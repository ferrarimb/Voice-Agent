
/**
 * Vapi Clone Backend - Twilio <-> OpenAI Realtime API (GPT-4o Audio)
 * 
 * DEBUG MODE: STABLE v6
 * Fixes: n8n Webhook Propagation (Transcripts)
 */

require('dotenv').config();
const Fastify = require('fastify');
const fastifyWebsocket = require('@fastify/websocket');
const fastifyFormBody = require('@fastify/formbody');
const WebSocket = require('ws');

const fastify = Fastify();
fastify.register(fastifyFormBody);
fastify.register(fastifyWebsocket);

// --- Helpers ---
const log = (msg, type = 'INFO') => {
    const time = new Date().toISOString().split('T')[1].slice(0, -1);
    console.log(`[${time}] [${type}] ${msg}`);
};

// --- CORS & LOGGING HOOK ---
// Intercepta TODAS as requisições para logar e aplicar CORS
fastify.addHook('onRequest', (request, reply, done) => {
    // 1. Log de Conexão
    log(`INCOMING: ${request.method} ${request.url}`, "NETWORK");

    // 2. Headers de CORS Manuais (Globais)
    reply.header("Access-Control-Allow-Origin", "*");
    reply.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    reply.header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");

    // Se for OPTIONS global (fallback), responde OK
    if (request.method === 'OPTIONS') {
        reply.send();
        return;
    }
    
    done();
});

const PORT = process.env.PORT || 5000;

// Fallback Key
const TEST_KEY = "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";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY ? process.env.OPENAI_API_KEY.trim() : TEST_KEY;

if (!OPENAI_API_KEY) {
    log(`❌ FATAL: OPENAI_API_KEY missing.`, "SYSTEM");
    process.exit(1);
} else {
    log(`🔑 API Key loaded (starts with: ${OPENAI_API_KEY.substring(0, 8)}...)`, "SYSTEM");
}

// --- Constants ---
const SYSTEM_MESSAGE = `
You are a helpful, witty, and concise AI voice assistant. 
You are answering a phone call.
Your output audio format is G711 u-law.
Always respond quickly and concisely.
`.trim();
const VOICE = 'alloy';

// --- Routes ---

// FIX: Explicit OPTIONS route to satisfy Fastify Router and prevent 404 on Preflight
fastify.options('/trigger-call', async (request, reply) => {
    return reply.send();
});

// 1. Trigger Call (Speed-to-Lead)
fastify.post('/trigger-call', async (request, reply) => {
    log(`[SPEED-DIAL] 🚀 Processando Trigger...`, "DEBUG");
    
    try {
        const body = request.body;
        
        if (!body) {
             log(`[SPEED-DIAL] ❌ Body vazio ou inválido`, "ERROR");
             return reply.status(400).send({ success: false, error: "Body missing" });
        }

        log(`[SPEED-DIAL] Payload: ${JSON.stringify(body, null, 2)}`, "DEBUG");

        const { lead_name, lead_phone, sdr_phone, horario, twilio_config } = body;
        
        if (!twilio_config || !twilio_config.accountSid || !twilio_config.authToken) {
            log(`[SPEED-DIAL] ❌ Credenciais Twilio ausentes`, "ERROR");
            return reply.status(400).send({ success: false, error: 'Missing Twilio Config' });
        }

        const auth = Buffer.from(`${twilio_config.accountSid}:${twilio_config.authToken}`).toString('base64');
        const callbackUrl = `${twilio_config.baseUrl}/connect-lead?lead_name=${encodeURIComponent(lead_name)}&lead_phone=${encodeURIComponent(lead_phone)}&horario=${encodeURIComponent(horario)}`;

        log(`[SPEED-DIAL] Callback TwiML: ${callbackUrl}`, "DEBUG");

        const formData = new URLSearchParams();
        formData.append('To', sdr_phone);
        formData.append('From', twilio_config.fromNumber);
        formData.append('Url', callbackUrl); 
        formData.append('MachineDetection', 'Enable'); 

        log(`[SPEED-DIAL] Enviando request para Twilio API...`, "DEBUG");

        const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilio_config.accountSid}/Calls.json`, {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${auth}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: formData
        });

        if (!response.ok) {
            const err = await response.json();
            log(`[SPEED-DIAL] ❌ Erro Twilio: ${JSON.stringify(err)}`, "ERROR");
            return reply.send({ success: false, error: err.message });
        }
        
        const result = await response.json();
        log(`[SPEED-DIAL] ✅ Sucesso! Call SID: ${result.sid}`, "SUCCESS");
        
        return reply.send({ success: true, sid: result.sid });
    } catch (e) {
        log(`[SPEED-DIAL] ❌ Exception: ${e.message}`, "FATAL");
        return reply.status(500).send({ success: false, error: e.message });
    }
});

// 2. Connect Lead (TwiML Webhook)
fastify.all('/connect-lead', async (request, reply) => {
    log(`[SPEED-DIAL] 📞 Webhook /connect-lead recebido`, "DEBUG");
    
    const queryParams = request.query || {};
    const bodyParams = request.body || {};

    const { lead_name, lead_phone, horario } = queryParams;
    const { AnsweredBy, CallSid } = bodyParams;

    log(`[SPEED-DIAL] Params: lead=${lead_name}, answered_by=${AnsweredBy}`, "DEBUG");

    if (AnsweredBy && (AnsweredBy.startsWith('machine') || AnsweredBy === 'fax')) {
        log(`[SPEED-DIAL] 🤖 Máquina (${AnsweredBy}). Desligando.`, "BRIDGE");
        const twiml = `
        <Response>
            <Hangup/>
        </Response>`;
        return reply.type('text/xml').send(twiml);
    }

    log(`[SPEED-DIAL] 👤 Humano (${AnsweredBy || 'unknown'}). Conectando...`, "BRIDGE");
    
    const twiml = `
    <Response>
        <Say voice="Polly.Camila-Neural" language="pt-BR">
            Novo lead: ${lead_name || 'Cliente'} para ${horario || 'agora'}. Conectando.
        </Say>
        <Dial callerId="${bodyParams.From || ''}">
            ${lead_phone}
        </Dial>
    </Response>
    `;
    
    reply.type('text/xml').send(twiml);
});


// 3. Incoming Call (Standard AI Agent)
fastify.post('/incoming', async (request, reply) => {
    const host = request.headers.host;
    // Extract n8n_url from query (populated by twilioService.ts)
    const n8nUrl = request.query.n8n_url || '';
    
    log(`📞 Incoming AI Call! Host: ${host} | Webhook: ${n8nUrl ? 'YES' : 'NO'}`, "TWILIO");
    
    // Pass n8n_url as a Stream Parameter to ensure it persists in the WebSocket session
    // Note: We don't append it to the WSS URL anymore to avoid parsing issues
    const wssUrl = `wss://${host}/media-stream`;
    
    const twiml = `
    <Response>
        <Connect>
            <Stream url="${wssUrl}">
                <Parameter name="n8n_url" value="${n8nUrl}" />
            </Stream>
        </Connect>
        <Pause length="40" /> 
    </Response>
    `;
    reply.type('text/xml').send(twiml);
});

// 4. WebSocket Stream (Audio Bridge)
fastify.register(async (fastifyInstance) => {
    fastifyInstance.get('/media-stream', { websocket: true }, (connection, req) => {
        
        const twilioWs = connection.socket || connection;
        
        // Scope variables for this specific call session
        let n8nUrl = null;
        let streamSid = null;
        let openAiWs = null;
        let isOpenAiConnected = false;
        let isSessionUpdated = false;
        let hasSentGreeting = false;
        const transcripts = [];

        log(`🔌 Socket Connection Initiated`, "TWILIO");

        if (!twilioWs) {
            log("❌ FATAL: Could not retrieve WebSocket object from connection", "ERROR");
            return;
        }

        // --- OpenAI Logic ---
        const connectToOpenAI = () => {
            try {
                openAiWs = new WebSocket("wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview", {
                    headers: {
                        "Authorization": "Bearer " + OPENAI_API_KEY,
                        "OpenAI-Beta": "realtime=v1",
                    },
                });

                openAiWs.on('open', () => {
                    log('🤖 OpenAI Connected', "OPENAI");
                    isOpenAiConnected = true;
                    
                    const sessionConfig = {
                        type: 'session.update',
                        session: {
                            modalities: ['text', 'audio'],
                            instructions: SYSTEM_MESSAGE,
                            voice: VOICE,
                            input_audio_format: 'g711_ulaw',
                            output_audio_format: 'g711_ulaw',
                            // Enable input transcription for logging
                            input_audio_transcription: {
                                model: 'whisper-1'
                            },
                            turn_detection: {
                                type: 'server_vad',
                                threshold: 0.5,
                                prefix_padding_ms: 300,
                                silence_duration_ms: 200,
                            }
                        }
                    };
                    openAiWs.send(JSON.stringify(sessionConfig));
                });

                openAiWs.on('message', (data) => {
                    try {
                        const event = JSON.parse(data.toString());

                        if (event.type === 'session.updated') {
                            isSessionUpdated = true;
                            checkAndSendGreeting();
                        } else if (event.type === 'response.audio.delta' && event.delta) {
                            if (streamSid) {
                                twilioWs.send(JSON.stringify({
                                    event: 'media',
                                    streamSid: streamSid,
                                    media: { payload: event.delta }
                                }));
                            }
                        } else if (event.type === 'input_audio_buffer.speech_started') {
                            if (streamSid) {
                                twilioWs.send(JSON.stringify({ event: 'clear', streamSid: streamSid }));
                                openAiWs.send(JSON.stringify({ type: 'response.cancel' }));
                            }
                        } else if (event.type === 'conversation.item.input_audio_transcription.completed') {
                            // User spoke
                            const text = event.transcript;
                            if (text) {
                                log(`User: ${text}`, "TRANSCRIPT");
                                transcripts.push({ role: 'user', message: text, timestamp: new Date() });
                            }
                        } else if (event.type === 'response.done') {
                            // Assistant spoke (get final text content if available)
                            const outputItems = event.response?.output || [];
                            for (const item of outputItems) {
                                if (item.content) {
                                    for (const content of item.content) {
                                        if (content.type === 'audio' && content.transcript) {
                                             log(`AI: ${content.transcript}`, "TRANSCRIPT");
                                             transcripts.push({ role: 'assistant', message: content.transcript, timestamp: new Date() });
                                        }
                                    }
                                }
                            }
                        }

                    } catch (e) {
                        log(`Error processing OpenAI message: ${e.message}`, "ERROR");
                    }
                });

                openAiWs.on('close', (code, reason) => {
                    log(`💀 OpenAI Closed`, "OPENAI");
                    isOpenAiConnected = false;
                });

                openAiWs.on('error', (err) => {
                    log(`❌ OpenAI Error: ${err.message}`, "ERROR");
                });

            } catch (err) {
                log(`❌ Failed to connect to OpenAI: ${err.message}`, "ERROR");
            }
        };

        // --- Twilio Logic ---
        twilioWs.on('message', (message) => {
            try {
                const data = JSON.parse(message.toString());

                if (data.event === 'start') {
                    streamSid = data.start.streamSid;
                    
                    // EXTRACT CUSTOM PARAMS (Robust way)
                    if (data.start.customParameters && data.start.customParameters.n8n_url) {
                        n8nUrl = data.start.customParameters.n8n_url;
                    }

                    log(`▶️ Stream Started: ${streamSid} | n8n Webhook: ${n8nUrl || 'None'}`, "TWILIO");
                    checkAndSendGreeting();
                } else if (data.event === 'media' && isOpenAiConnected && openAiWs.readyState === WebSocket.OPEN) {
                    openAiWs.send(JSON.stringify({
                        type: 'input_audio_buffer.append',
                        audio: data.media.payload
                    }));
                } else if (data.event === 'stop') {
                    log(`⏹️ Call Ended. Logs captured: ${transcripts.length}`, "TWILIO");
                    if (openAiWs) openAiWs.close();
                    
                    // Trigger Webhook if present
                    if (n8nUrl) {
                        if (transcripts.length > 0) {
                            
                            // FORMAT TRANSCRIPT FOR N8N
                            // Creates a single, readable string from the conversation history
                            const formattedTranscript = transcripts
                                .map(t => `${t.role === 'user' ? 'User' : 'AI'}: ${t.message}`)
                                .join('\n');

                            log(`🚀 Triggering n8n Webhook: ${n8nUrl}`, "WEBHOOK");
                            fetch(n8nUrl, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    assistantName: "Twilio AI Agent",
                                    transcript: formattedTranscript, // Organized readable string
                                    messages: transcripts, // Raw array data
                                    timestamp: new Date().toISOString(),
                                    type: 'pstn',
                                    status: 'success'
                                })
                            }).then(async res => {
                                const txt = await res.text();
                                log(`Webhook Response: ${res.status} ${txt}`, "WEBHOOK");
                            }).catch(err => {
                                log(`Webhook Failed: ${err.message}`, "WEBHOOK");
                            });
                        } else {
                            log(`⚠️ Skipping Webhook: No transcripts captured.`, "WEBHOOK");
                        }
                    } else {
                        log(`ℹ️ No n8n URL configured for this call.`, "WEBHOOK");
                    }
                }
            } catch (e) {
                log(`Error parsing Twilio message: ${e.message}`, "ERROR");
            }
        });

        twilioWs.on('close', () => {
            log('🔌 Twilio Disconnected', "TWILIO");
            if (openAiWs) openAiWs.close();
        });

        const checkAndSendGreeting = () => {
            if (streamSid && isSessionUpdated && !hasSentGreeting) {
                openAiWs.send(JSON.stringify({
                    type: 'response.create',
                    response: {
                        modalities: ['text', 'audio'],
                        instructions: "Say 'Hello! I am ready to help you.' in a friendly tone."
                    }
                }));
                hasSentGreeting = true;
            }
        };

        connectToOpenAI();
    });
});

fastify.listen({ port: PORT, host: '0.0.0.0' }, (err) => {
    if (err) {
        log(`Failed to start server: ${err.message}`, "FATAL");
        process.exit(1);
    }
    log(`✅ SERVER READY ON PORT ${PORT}`, "SYSTEM");
});
