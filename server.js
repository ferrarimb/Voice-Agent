
/**
 * Vapi Clone Backend - Twilio <-> OpenAI Realtime API (GPT-4o Audio)
 * 
 * DEBUG MODE: STABLE v9 (Audio Quality Fix)
 * Fixes: Speed Dial "Robotic/Doubled" Recording
 */

require('dotenv').config();
const Fastify = require('fastify');
const fastifyWebsocket = require('@fastify/websocket');
const fastifyFormBody = require('@fastify/formbody');
const WebSocket = require('ws');
const { createClient } = require('@supabase/supabase-js');
const { WaveFile } = require('wavefile');
const crypto = require('crypto');

const fastify = Fastify();
fastify.register(fastifyFormBody);
fastify.register(fastifyWebsocket);

// --- Helpers ---
const log = (msg, type = 'INFO') => {
    const time = new Date().toISOString().split('T')[1].slice(0, -1);
    console.log(`[${time}] [${type}] ${msg}`);
};

// --- SUPABASE CONFIG ---
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://xtkorgedlxwfuaqyxguq.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh0a29yZ2VkbHh3ZnVhcXl4Z3VxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTczNDAwNjg0MywiZXhwIjoyMDQ5NTgyODQzfQ.kaCxJ0WatQtCMQqFh1_Yru6mHyhhospZKERDxMS3G4k';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// --- CORS & LOGGING HOOK ---
fastify.addHook('onRequest', (request, reply, done) => {
    log(`INCOMING: ${request.method} ${request.url}`, "NETWORK");
    reply.header("Access-Control-Allow-Origin", "*");
    reply.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    reply.header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
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
}

// --- Constants ---
const SYSTEM_MESSAGE_AGENT = `
You are a helpful, witty, and concise AI voice assistant. 
You are answering a phone call.
Your output audio format is G711 u-law.
Always respond quickly and concisely.
`.trim();

const SYSTEM_MESSAGE_SCRIBE = `
You are a silent transcriber. 
You are listening to a conversation between two people.
DO NOT SPEAK. DO NOT GENERATE AUDIO.
Your only job is to transcribe what you hear.
`.trim();

const VOICE = 'alloy';

// --- Routes ---

fastify.options('/trigger-call', async (request, reply) => {
    return reply.send();
});

// 1. Trigger Call (Speed-to-Lead)
fastify.post('/trigger-call', async (request, reply) => {
    log(`[SPEED-DIAL] 🚀 Processando Trigger...`, "DEBUG");
    try {
        const body = request.body;
        if (!body) return reply.status(400).send({ success: false, error: "Body missing" });

        const { lead_name, lead_phone, sdr_phone, horario, twilio_config, n8n_url } = body;
        
        if (!twilio_config || !twilio_config.accountSid || !twilio_config.authToken) {
            return reply.status(400).send({ success: false, error: 'Missing Twilio Config' });
        }

        const auth = Buffer.from(`${twilio_config.accountSid}:${twilio_config.authToken}`).toString('base64');
        // Pass n8n_url to the callback
        const callbackUrl = `${twilio_config.baseUrl}/connect-lead?lead_name=${encodeURIComponent(lead_name)}&lead_phone=${encodeURIComponent(lead_phone)}&horario=${encodeURIComponent(horario)}&n8n_url=${encodeURIComponent(n8n_url || '')}`;

        const formData = new URLSearchParams();
        formData.append('To', sdr_phone);
        formData.append('From', twilio_config.fromNumber);
        formData.append('Url', callbackUrl); 
        formData.append('MachineDetection', 'Enable'); 

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
            return reply.send({ success: false, error: err.message });
        }
        
        const result = await response.json();
        return reply.send({ success: true, sid: result.sid });
    } catch (e) {
        return reply.status(500).send({ success: false, error: e.message });
    }
});

// 2. Connect Lead (TwiML Webhook) - UPDATED FOR RECORDING
fastify.all('/connect-lead', async (request, reply) => {
    const queryParams = request.query || {};
    const bodyParams = request.body || {};
    const host = request.headers.host;
    
    const { lead_name, lead_phone, horario, n8n_url } = queryParams;
    const { AnsweredBy } = bodyParams;
    const wssUrl = `wss://${host}/media-stream`;

    if (AnsweredBy && (AnsweredBy.startsWith('machine') || AnsweredBy === 'fax')) {
        const twiml = `<Response><Hangup/></Response>`;
        return reply.type('text/xml').send(twiml);
    }
    
    // Use <Start><Stream> to record the bridge asynchronously without blocking the Dial
    // track="both_tracks" mixes SDR and Lead audio for the recording/transcription
    const twiml = `
    <Response>
        <Start>
            <Stream url="${wssUrl}" track="both_tracks">
                <Parameter name="n8n_url" value="${n8n_url || ''}" />
                <Parameter name="mode" value="bridge" />
            </Stream>
        </Start>
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
    const n8nUrl = request.query.n8n_url || '';
    const wssUrl = `wss://${host}/media-stream`;
    
    const twiml = `
    <Response>
        <Connect>
            <Stream url="${wssUrl}">
                <Parameter name="n8n_url" value="${n8nUrl}" />
                <Parameter name="mode" value="agent" />
            </Stream>
        </Connect>
        <Pause length="40" /> 
    </Response>
    `;
    reply.type('text/xml').send(twiml);
});

// 5. WebSocket Stream (Audio Bridge)
fastify.register(async (fastifyInstance) => {
    fastifyInstance.get('/media-stream', { websocket: true }, (connection, req) => {
        
        const twilioWs = connection.socket || connection;
        
        let n8nUrl = null;
        let streamSid = null;
        let openAiWs = null;
        let isOpenAiConnected = false;
        let isSessionUpdated = false;
        let hasSentGreeting = false;
        let callMode = 'agent'; // 'agent' or 'bridge'
        
        const transcripts = [];
        // Buffer to store G.711 u-law chunks
        let savedAudioChunks = [];

        log(`🔌 Socket Connection Initiated`, "TWILIO");

        if (!twilioWs) return;

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
                    
                    const isBridge = callMode === 'bridge';
                    const instruction = isBridge ? SYSTEM_MESSAGE_SCRIBE : SYSTEM_MESSAGE_AGENT;
                    
                    // CRITICAL FIX: For bridge mode, strictly disable audio output ('text' only).
                    // This prevents OpenAI from hallucinating audio that causes echo/doubling in the recording.
                    const sessionConfig = {
                        type: 'session.update',
                        session: {
                            modalities: isBridge ? ['text'] : ['text', 'audio'], 
                            instructions: instruction,
                            voice: VOICE,
                            input_audio_format: 'g711_ulaw',
                            output_audio_format: 'g711_ulaw',
                            input_audio_transcription: { model: 'whisper-1' },
                            turn_detection: { type: 'server_vad' }
                        }
                    };
                    openAiWs.send(JSON.stringify(sessionConfig));
                });

                openAiWs.on('message', (data) => {
                    try {
                        const event = JSON.parse(data.toString());

                        if (event.type === 'session.updated') {
                            isSessionUpdated = true;
                            // Only send greeting if we are the active agent
                            if (callMode === 'agent') checkAndSendGreeting();
                        } else if (event.type === 'response.audio.delta' && event.delta) {
                            if (streamSid) {
                                // If in BRIDGE mode, OpenAI should be silent. 
                                // Due to modalities=['text'], this event should effectively NOT fire in bridge mode.
                                
                                if (callMode === 'agent') {
                                    // 1. Send to Twilio (User hears it)
                                    twilioWs.send(JSON.stringify({
                                        event: 'media',
                                        streamSid: streamSid,
                                        media: { payload: event.delta }
                                    }));
                                    
                                    // 2. Save to Buffer (Recording)
                                    const chunk = Buffer.from(event.delta, 'base64');
                                    savedAudioChunks.push(chunk);
                                }
                            }
                        } else if (event.type === 'input_audio_buffer.speech_started') {
                            if (streamSid && callMode === 'agent') {
                                twilioWs.send(JSON.stringify({ event: 'clear', streamSid: streamSid }));
                                openAiWs.send(JSON.stringify({ type: 'response.cancel' }));
                            }
                        } else if (event.type === 'conversation.item.input_audio_transcription.completed') {
                            const text = event.transcript;
                            if (text) {
                                // In Bridge mode, "User" is actually "Mixed SDR + Lead".
                                const role = callMode === 'bridge' ? 'conversation' : 'user';
                                log(`${role}: ${text}`, "TRANSCRIPT");
                                transcripts.push({ role: role, message: text, timestamp: new Date() });
                            }
                        } else if (event.type === 'response.done') {
                             // AI response transcripts (only relevant in Agent mode)
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
                    } catch (e) {}
                });

                openAiWs.on('close', () => isOpenAiConnected = false);
            } catch (err) {}
        };

        twilioWs.on('message', async (message) => {
            try {
                const data = JSON.parse(message.toString());

                if (data.event === 'start') {
                    streamSid = data.start.streamSid;
                    if (data.start.customParameters) {
                        if (data.start.customParameters.n8n_url) n8nUrl = data.start.customParameters.n8n_url;
                        if (data.start.customParameters.mode) callMode = data.start.customParameters.mode;
                    }
                    log(`▶️ Stream Started. Mode: ${callMode}. Webhook: ${n8nUrl ? 'YES' : 'NO'}`, "TWILIO");
                    
                    connectToOpenAI();

                } else if (data.event === 'media') {
                    // 1. Save User (or Mixed Bridge) Audio to Buffer
                    if (data.media.payload) {
                        const chunk = Buffer.from(data.media.payload, 'base64');
                        savedAudioChunks.push(chunk);
                    }

                    // 2. Send to OpenAI
                    if (isOpenAiConnected && openAiWs.readyState === WebSocket.OPEN) {
                        openAiWs.send(JSON.stringify({
                            type: 'input_audio_buffer.append',
                            audio: data.media.payload
                        }));
                    }

                } else if (data.event === 'stop') {
                    log(`⏹️ Call Ended. Processing recording...`, "TWILIO");
                    if (openAiWs) openAiWs.close();
                    
                    if (n8nUrl) {
                        let recordingUrl = null;

                        // --- AUDIO PROCESSING ---
                        if (savedAudioChunks.length > 0) {
                            try {
                                log(`💾 Encoding WAV (${savedAudioChunks.length} chunks)...`, "AUDIO");
                                const finalBuffer = Buffer.concat(savedAudioChunks);
                                
                                // Create WAV from G.711 u-law (8000Hz, Mono)
                                // This is the standard Twilio stream format.
                                const wav = new WaveFile();
                                wav.fromScratch(1, 8000, '8m', finalBuffer);
                                
                                const wavBuffer = wav.toBuffer();
                                const fileName = `call_${callMode}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.wav`;

                                const { data: uploadData, error: uploadError } = await supabase
                                    .storage
                                    .from('audios') 
                                    .upload(fileName, wavBuffer, {
                                        contentType: 'audio/wav',
                                        upsert: false
                                    });

                                if (uploadError) {
                                    log(`❌ Supabase Upload Error: ${uploadError.message}`, "ERROR");
                                } else {
                                    // Get Public URL
                                    const { data: publicUrlData } = supabase
                                        .storage
                                        .from('audios')
                                        .getPublicUrl(fileName);
                                    
                                    recordingUrl = publicUrlData.publicUrl;
                                    log(`✅ Audio Uploaded: ${recordingUrl}`, "SUCCESS");
                                }
                            } catch (audioErr) {
                                log(`❌ Audio Processing Error: ${audioErr.message}`, "ERROR");
                            }
                        }

                        // --- SEND TO N8N ---
                        if (transcripts.length > 0 || recordingUrl) {
                            const formattedTranscript = transcripts
                                .map(t => `${t.role.toUpperCase()}: ${t.message}`)
                                .join('\n');

                            log(`🚀 Triggering n8n Webhook...`, "WEBHOOK");
                            fetch(n8nUrl, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    assistantName: callMode === 'bridge' ? "Speed Dial Bridge" : "Twilio AI Agent",
                                    transcript: formattedTranscript, 
                                    messages: transcripts,
                                    recordingUrl: recordingUrl || "", 
                                    timestamp: new Date().toISOString(),
                                    status: 'success',
                                    mode: callMode
                                })
                            }).catch(err => log(`Webhook Failed: ${err.message}`, "WEBHOOK"));
                        }
                    }
                }
            } catch (e) {
                log(`Twilio Msg Error: ${e.message}`, "ERROR");
            }
        });

        twilioWs.on('close', () => {
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
    });
});

fastify.listen({ port: PORT, host: '0.0.0.0' }, (err) => {
    if (err) {
        process.exit(1);
    }
    log(`✅ SERVER READY ON PORT ${PORT}`, "SYSTEM");
});
