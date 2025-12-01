

/**
 * Vapi Clone Backend - Twilio <-> OpenAI Realtime API (GPT-4o Audio)
 * 
 * OPTIMIZED: v19 (ElevenLabs Voice Transplant)
 * Fixes: 
 * 1. Reverted to modalities: ['text', 'audio'] to ensure OpenAI VAD works.
 * 2. Intercepts and blocks OpenAI audio if ElevenLabs is active.
 * 3. Uses audio transcript to drive ElevenLabs TTS.
 * 4. Adds robust fallback for N8N Webhook URL and Source identification.
 */

require('dotenv').config();
const Fastify = require('fastify');
const fastifyWebsocket = require('@fastify/websocket');
const fastifyFormBody = require('@fastify/formbody');
const WebSocket = require('ws');
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const fastify = Fastify({
    logger: false // We use our own logger
});
fastify.register(fastifyFormBody);
fastify.register(fastifyWebsocket);

// --- CONSTANTS ---
const DEFAULT_N8N_WEBHOOK = process.env.N8N_WEBHOOK_URL || 'https://webhook-editor.abianca.com.br/webhook/retorno-new-vapi-ae75-6dfccb8f37d4';

// --- Helpers ---
const log = (msg, type = 'INFO') => {
    // FILTER: Don't log high-frequency media events to console to prevent lag
    if (type === 'BUFFER') return; 
    const time = new Date().toISOString().split('T')[1].slice(0, -1);
    const color = type === 'ERROR' ? '\x1b[31m' : type === 'SYSTEM' ? '\x1b[32m' : type === 'DEBUG' ? '\x1b[33m' : '\x1b[0m';
    console.log(`${color}[${time}] [${type}] ${msg}\x1b[0m`);
};

// Global Error Handler
fastify.setErrorHandler(function (error, request, reply) {
    log(`FATAL ERROR: ${error.message}`, 'ERROR');
    log(error.stack, 'ERROR');
    reply.status(500).send({ error: "Internal Server Error", message: error.message });
});

// Helper to sanitize phone numbers (remove spaces, parens, dashes)
const sanitizePhone = (phone) => {
    if (!phone) return '';
    // Keep only digits and plus sign
    return phone.replace(/[^0-9+]/g, '');
};

// Helper to escape XML special characters
const escapeXml = (unsafe) => {
    if (typeof unsafe !== 'string') return unsafe;
    return unsafe.replace(/[<>&'"]/g, c => {
        switch (c) {
            case '<': return '&lt;';
            case '>': return '&gt;';
            case '&': return '&amp;';
            case '\'': return '&apos;';
            case '"': return '&quot;';
        }
    });
};

// Helper to get single value from potentially duplicated query params
const getSingleParam = (param) => {
    if (Array.isArray(param)) return param[0];
    return param;
};

// --- AUDIO PROCESSING UTILS ---

// 1. G.711 u-law to Linear PCM 16-bit Lookup Table
const muLawToLinear16 = new Int16Array(256);
for (let i = 0; i < 256; i++) {
    let mu = ~i;
    let sign = (mu & 0x80) >> 7;
    let exponent = (mu & 0x70) >> 4;
    let mantissa = mu & 0x0f;
    let sample = mantissa << (exponent + 3);
    sample += 0x84 << exponent;
    sample -= 0x84;
    if (sign === 0) sample = -sample;
    muLawToLinear16[i] = sample;
}

// 2. Decode Buffer (u-law) to Int16Array (PCM)
function decodeMuLawBuffer(buffer) {
    const int16 = new Int16Array(buffer.length);
    for (let i = 0; i < buffer.length; i++) {
        int16[i] = muLawToLinear16[buffer[i]];
    }
    return int16;
}

// 3. Create WAV Header (Standard 8kHz, 16-bit, Mono for Telephony)
function createWavHeader(dataLength, sampleRate = 8000) {
    const buffer = Buffer.alloc(44);
    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(36 + dataLength, 4);
    buffer.write('WAVE', 8);
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16); // PCM
    buffer.writeUInt16LE(1, 20);  // Mono
    buffer.writeUInt16LE(1, 22);  // Channels
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(sampleRate * 2, 28); // Byte Rate (SampleRate * BlockAlign)
    buffer.writeUInt16LE(2, 32);  // Block Align (Channels * Bits/8)
    buffer.writeUInt16LE(16, 34); // Bits per Sample
    buffer.write('data', 36);
    buffer.writeUInt32LE(dataLength, 40);
    return buffer;
}

// --- SUPABASE CONFIG ---
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://xtkorgedlxwfuaqyxguq.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh0a29yZ2VkbHh3ZnVhcXl4Z3VxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTczNDAwNjg0MywiZXhwIjoyMDQ5NTgyODQzfQ.kaCxJ0WatQtCMQqFh1_Yru6mHyhhospZKERDxMS3G4k';
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Fallback Key
const TEST_KEY = "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";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY ? process.env.OPENAI_API_KEY.trim() : TEST_KEY;

if (!OPENAI_API_KEY) {
    log(`❌ FATAL: OPENAI_API_KEY missing.`, "SYSTEM");
    process.exit(1);
}

// --- WHISPER API HELPER (Multipart without external deps) ---
async function transcribeWithWhisper(audioBuffer) {
    const boundary = '--------------------------' + Date.now().toString(16);
    const model = 'whisper-1';
    const language = 'pt'; // Force Portuguese

    // Construct Multipart Body
    const parts = [
        `--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\n${model}\r\n`,
        `--${boundary}\r\nContent-Disposition: form-data; name="language"\r\n\r\n${language}\r\n`,
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="recording.wav"\r\nContent-Type: audio/wav\r\n\r\n`
    ];

    const start = Buffer.from(parts.join(''));
    const end = Buffer.from(`\r\n--${boundary}--\r\n`);
    
    // Combine buffers
    const payload = Buffer.concat([start, audioBuffer, end]);

    try {
        log(`🎙️ Sending ${audioBuffer.length} bytes to Whisper API...`, "WHISPER");
        const resp = await fetch('https://api.openai.com/v1/audio/transcriptions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${OPENAI_API_KEY}`,
                'Content-Type': `multipart/form-data; boundary=${boundary}`,
                'Content-Length': payload.length
            },
            body: payload
        });
        
        const data = await resp.json();
        if(data.error) throw new Error(data.error.message);
        log(`📝 Whisper Transcription: "${data.text.substring(0, 50)}..."`, "WHISPER");
        return data.text;
    } catch (e) {
        log(`❌ Whisper Error: ${e.message}`, "ERROR");
        return null;
    }
}

// --- ELEVENLABS HELPER ---
async function streamElevenLabsAudio(text, voiceId, apiKey, twilioWs, streamSid) {
    if (!text || !text.trim()) return;
    log(`🗣️ ElevenLabs TTS Request: "${text.substring(0, 30)}..."`, "ELEVENLABS");
    
    try {
        // optimize_streaming_latency=4 (Maximum speed)
        // output_format=ulaw_8000 (Twilio native)
        const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream?output_format=ulaw_8000&optimize_streaming_latency=4`, {
            method: 'POST',
            headers: {
                'xi-api-key': apiKey,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                text: text,
                model_id: "eleven_turbo_v2_5", // Turbo model for speed
                voice_settings: {
                    stability: 0.5,
                    similarity_boost: 0.7
                }
            })
        });

        if (!response.ok) {
            const err = await response.text();
            log(`❌ ElevenLabs API Error: ${err}`, "ERROR");
            return;
        }

        // Stream the response body
        const reader = response.body.getReader();
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            // value is a Uint8Array of u-law bytes
            // Convert to base64 and send to Twilio
            const payload = Buffer.from(value).toString('base64');
            
            if (twilioWs.readyState === WebSocket.OPEN) {
                twilioWs.send(JSON.stringify({
                    event: 'media',
                    streamSid: streamSid,
                    media: { payload: payload }
                }));
            }
        }
    } catch (e) {
        log(`❌ ElevenLabs Stream Error: ${e.message}`, "ERROR");
    }
}


// --- CORS & LOGGING HOOK ---
fastify.addHook('onRequest', (request, reply, done) => {
    // Only log distinct non-health-check requests
    if (!request.url.includes('health') && !request.url.includes('favicon')) {
        log(`INCOMING: ${request.method} ${request.url}`, "NETWORK");
        // Log body if it exists for deeper debug
        if (request.body) log(`BODY: ${JSON.stringify(request.body).substring(0, 100)}...`, "DEBUG");
    }
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

const SYSTEM_MESSAGE_AGENT = `
You are a helpful, witty, and concise AI voice assistant. 
You are answering a phone call.
Your output audio format is G711 u-law.
Always respond quickly and concisely.
Language: Portuguese (Brazil) unless spoken to in English.
`.trim();

const SYSTEM_MESSAGE_SCRIBE = `
ATENÇÃO: MODO "ESCUTA SILENCIOSA" (BRIDGE).
SEU ÚNICO OBJETIVO É OUVIR E TRANSCREVER.

REGRAS:
1. IDIOMA: PORTUGUÊS (BRASIL).
2. TAREFA: Apenas transcreva o que os humanos (Lead e SDR) estão falando.
3. NÃO responda. NÃO gere áudio.
4. Você está ouvindo uma chamada telefônica entre duas pessoas.
`.trim();

const DEFAULT_VOICE = 'alloy';

// --- Routes ---

fastify.options('/trigger-call', async (request, reply) => {
    return reply.send();
});
fastify.options('/webhook/speed-dial', async (request, reply) => {
    return reply.send();
});

// 0. ROOT HANDLER
fastify.all('/', async (request, reply) => {
    log(`[ROOT] 📞 Handling Outbound Call Request`, "DEBUG");
    
    const host = request.headers.host;
    // Fallback to default if not provided
    const n8nUrl = request.query.n8n_url || DEFAULT_N8N_WEBHOOK;
    
    // Extract Voice Params
    const voice = request.query.voice || DEFAULT_VOICE;
    const provider = request.query.provider || 'openai';
    const xiApiKey = request.query.xi_api_key || '';
    const firstMessage = request.query.first_message || '';
    const systemInstruction = request.query.system_instruction || '';
    
    // Identify Source
    const source = request.query.source || 'direct_call';

    // Construct WebSocket URL
    const wssUrl = `wss://${host}/media-stream`;
    log(`[ROOT] Connecting Stream to: ${wssUrl}`, "DEBUG");
    log(`[ROOT] Provider: ${provider}, Voice: ${voice}, Source: ${source}, Webhook: ${n8nUrl ? 'Set' : 'None'}`, "DEBUG");

    const twiml = `
    <Response>
        <Connect>
            <Stream url="${wssUrl}">
                <Parameter name="n8n_url" value="${escapeXml(n8nUrl)}" />
                <Parameter name="mode" value="agent" />
                <Parameter name="voice" value="${escapeXml(voice)}" />
                <Parameter name="provider" value="${escapeXml(provider)}" />
                <Parameter name="xi_api_key" value="${escapeXml(xiApiKey)}" />
                <Parameter name="first_message" value="${escapeXml(firstMessage)}" />
                <Parameter name="system_instruction" value="${escapeXml(systemInstruction)}" />
                <Parameter name="source" value="${escapeXml(source)}" />
            </Stream>
        </Connect>
    </Response>
    `;
    
    reply.type('text/xml').send(twiml);
});

// 1. Trigger Call (Speed-to-Lead) - FRONTEND VERSION
fastify.post('/trigger-call', async (request, reply) => {
    log(`[SPEED-DIAL] 🚀 Processando Trigger (Frontend)...`, "DEBUG");
    try {
        const body = request.body;
        if (!body) return reply.status(400).send({ success: false, error: "Body missing" });

        const { lead_name, lead_phone, sdr_phone, horario, twilio_config, n8n_url } = body;
        
        if (!twilio_config || !twilio_config.accountSid || !twilio_config.authToken) {
            return reply.status(400).send({ success: false, error: 'Missing Twilio Config' });
        }

        // Apply fallback if n8n_url is missing or empty
        const finalN8nUrl = n8n_url || DEFAULT_N8N_WEBHOOK;

        const auth = Buffer.from(`${twilio_config.accountSid}:${twilio_config.authToken}`).toString('base64');
        const callbackUrl = `${twilio_config.baseUrl}/connect-lead?lead_name=${encodeURIComponent(lead_name)}&lead_phone=${encodeURIComponent(sanitizePhone(lead_phone))}&horario=${encodeURIComponent(horario)}&n8n_url=${encodeURIComponent(finalN8nUrl)}`;

        const formData = new URLSearchParams();
        formData.append('To', sanitizePhone(sdr_phone));
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
        log(`[TRIGGER] Error: ${e.message}`, "ERROR");
        return reply.status(500).send({ success: false, error: e.message });
    }
});

// 1.b. External Webhook (Portuguese Params + Credentials in Body)
fastify.post('/webhook/speed-dial', async (request, reply) => {
    log(`[WEBHOOK] 🌐 Recebendo Webhook Externo...`, "DEBUG");
    try {
        const body = request.body;
        if (!body) return reply.status(400).send({ success: false, error: "Body missing" });

        const { 
            nome_lead, 
            data_agendamento, 
            telefone_lead, 
            telefone_sdr,
            n8n_url, 
            TWILIO_ACCOUNT_SID,
            TWILIO_AUTH_TOKEN,
            TWILIO_FROM_NUMBER
        } = body;

        if (!nome_lead || !telefone_lead || !telefone_sdr) {
            return reply.status(400).send({ success: false, error: "Faltando parametros obrigatorios: nome_lead, telefone_lead, telefone_sdr" });
        }

        const cleanSdrPhone = sanitizePhone(telefone_sdr);
        const cleanLeadPhone = sanitizePhone(telefone_lead);

        const accountSid = TWILIO_ACCOUNT_SID || process.env.TWILIO_ACCOUNT_SID;
        const authToken = TWILIO_AUTH_TOKEN || process.env.TWILIO_AUTH_TOKEN;
        const fromNumber = TWILIO_FROM_NUMBER || process.env.TWILIO_FROM_NUMBER;

        if (!accountSid || !authToken || !fromNumber) {
            return reply.status(500).send({ 
                success: false, 
                error: "Credenciais Twilio ausentes." 
            });
        }

        const protocol = request.protocol || 'https';
        const host = request.headers.host;
        const baseUrl = `${protocol}://${host}`;
        const horario = data_agendamento || "Agora";
        
        // Apply fallback if n8n_url is missing or empty
        const finalN8nUrl = n8n_url || DEFAULT_N8N_WEBHOOK;

        const callbackUrl = `${baseUrl}/connect-lead?lead_name=${encodeURIComponent(nome_lead)}&lead_phone=${encodeURIComponent(cleanLeadPhone)}&horario=${encodeURIComponent(horario)}&n8n_url=${encodeURIComponent(finalN8nUrl)}`;

        const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
        const formData = new URLSearchParams();
        formData.append('To', cleanSdrPhone);
        formData.append('From', fromNumber);
        formData.append('Url', callbackUrl); 
        formData.append('MachineDetection', 'Enable'); 

        log(`[WEBHOOK] Discando para SDR ${cleanSdrPhone} sobre Lead ${nome_lead}...`, "INFO");

        const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json`, {
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
        return reply.send({ success: true, sid: result.sid, message: "Conexão SDR Iniciada com Sucesso" });

    } catch (e) {
        log(`[WEBHOOK] Error: ${e.message}`, "ERROR");
        return reply.status(500).send({ success: false, error: e.message });
    }
});

// 2. Connect Lead (TwiML Webhook)
fastify.all('/connect-lead', async (request, reply) => {
    log(`[CONNECT-LEAD] Initializing Bridge Call...`, "DEBUG");
    const queryParams = request.query || {};
    const bodyParams = request.body || {};
    const host = request.headers.host;
    
    const raw_lead_name = getSingleParam(queryParams.lead_name);
    const raw_lead_phone = getSingleParam(queryParams.lead_phone);
    const raw_horario = getSingleParam(queryParams.horario);
    const raw_n8n_url = getSingleParam(queryParams.n8n_url);
    
    const voice = getSingleParam(queryParams.voice) || DEFAULT_VOICE;
    const provider = getSingleParam(queryParams.provider) || 'openai';
    const xiKey = getSingleParam(queryParams.xi_api_key) || '';
    
    const lead_name = escapeXml(raw_lead_name || 'Cliente');
    const lead_phone = sanitizePhone(raw_lead_phone);
    const horario = escapeXml(raw_horario || 'agora');
    // Fallback to default
    const n8n_url = raw_n8n_url || DEFAULT_N8N_WEBHOOK;

    const { AnsweredBy } = bodyParams;
    const wssUrl = `wss://${host}/media-stream`;

    if (AnsweredBy && (AnsweredBy.startsWith('machine') || AnsweredBy === 'fax')) {
        const twiml = `<Response><Hangup/></Response>`;
        return reply.type('text/xml').send(twiml);
    }
    
    const fromNumber = bodyParams.From || '';

    const twiml = `
    <Response>
        <Start>
            <Stream url="${wssUrl}" track="both_tracks">
                <Parameter name="n8n_url" value="${escapeXml(n8n_url)}" />
                <Parameter name="mode" value="bridge" />
                <Parameter name="voice" value="${escapeXml(voice)}" />
                <Parameter name="provider" value="${escapeXml(provider)}" />
                <Parameter name="xi_api_key" value="${escapeXml(xiKey)}" />
                <Parameter name="source" value="bridge" />
            </Stream>
        </Start>
        <Say voice="Polly.Camila-Neural" language="pt-BR">
            Novo lead: ${lead_name}. Agendado para ${horario}. Conectando chamada.
        </Say>
        <Dial callerId="${fromNumber}" timeout="30">
            ${lead_phone}
        </Dial>
    </Response>
    `;
    reply.type('text/xml').send(twiml);
});

// 3. Incoming Call
fastify.all('/incoming', async (request, reply) => {
    log(`[INCOMING] Receiving Standard Call`, "DEBUG");
    const host = request.headers.host;
    const queryParams = request.query || {};
    
    // Fallback to default
    const n8nUrl = getSingleParam(queryParams.n8n_url) || DEFAULT_N8N_WEBHOOK;

    const voice = getSingleParam(queryParams.voice) || DEFAULT_VOICE;
    const provider = getSingleParam(queryParams.provider) || 'openai';
    const xiKey = getSingleParam(queryParams.xi_api_key) || '';
    const firstMessage = getSingleParam(queryParams.first_message) || '';
    const systemInstruction = getSingleParam(queryParams.system_instruction) || '';
    
    const wssUrl = `wss://${host}/media-stream`;
    
    const twiml = `
    <Response>
        <Connect>
            <Stream url="${wssUrl}">
                <Parameter name="n8n_url" value="${escapeXml(n8nUrl)}" />
                <Parameter name="mode" value="agent" />
                <Parameter name="voice" value="${escapeXml(voice)}" />
                <Parameter name="provider" value="${escapeXml(provider)}" />
                <Parameter name="xi_api_key" value="${escapeXml(xiKey)}" />
                <Parameter name="first_message" value="${escapeXml(firstMessage)}" />
                <Parameter name="system_instruction" value="${escapeXml(systemInstruction)}" />
                <Parameter name="source" value="incoming_call" />
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
        let callMode = 'agent'; 
        let callSource = 'unknown';

        // Voice Config
        let activeVoice = DEFAULT_VOICE;
        let activeProvider = 'openai';
        let elevenLabsApiKey = '';
        let customSystemInstruction = '';
        let initialGreeting = "Hello! I am ready to help you.";
        
        const transcripts = [];
        let savedAudioChunks = []; // Storing raw u-law buffers
        let openAiAudioQueue = [];

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
                    log(`🤖 OpenAI Connected [Provider: ${activeProvider}]`, "OPENAI");
                    isOpenAiConnected = true;
                    
                    const isBridge = callMode === 'bridge';
                    const isElevenLabs = activeProvider === 'elevenlabs';
                    
                    let instruction = isBridge ? SYSTEM_MESSAGE_SCRIBE : SYSTEM_MESSAGE_AGENT;
                    if (!isBridge && customSystemInstruction) {
                        instruction = customSystemInstruction;
                    }
                    
                    // CRITICAL FIX: We MUST use ['text', 'audio'] even for ElevenLabs.
                    // If we use ['text'], OpenAI Realtime acts passively and doesn't handle VAD/Turn-taking well.
                    // Strategy: We let OpenAI generate audio, but we BLOCK it from sending to Twilio if ElevenLabs is on.
                    // Then we take the transcript of that audio and send it to ElevenLabs.
                    const modalities = ['text', 'audio'];
                    
                    // If we are using OpenAI voice, ensure it's a valid one.
                    let openAiVoice = activeVoice;
                    const validOpenAIVoices = ['alloy', 'ash', 'ballad', 'coral', 'echo', 'sage', 'shimmer', 'verse'];
                    if (!validOpenAIVoices.includes(openAiVoice)) {
                         openAiVoice = 'alloy'; // Default to Alloy if using custom ElevenLabs ID
                    }

                    const sessionConfig = {
                        type: 'session.update',
                        session: {
                            modalities: modalities, 
                            instructions: instruction,
                            voice: openAiVoice, 
                            input_audio_format: 'g711_ulaw',
                            output_audio_format: 'g711_ulaw',
                            input_audio_transcription: { model: 'whisper-1' },
                            turn_detection: { type: 'server_vad' },
                            temperature: 0.7
                        }
                    };
                    openAiWs.send(JSON.stringify(sessionConfig));

                    if (openAiAudioQueue.length > 0) {
                        while (openAiAudioQueue.length > 0) {
                            const chunk = openAiAudioQueue.shift();
                            openAiWs.send(JSON.stringify({
                                type: 'input_audio_buffer.append',
                                audio: chunk 
                            }));
                        }
                    }
                });

                openAiWs.on('message', (data) => {
                    try {
                        const event = JSON.parse(data.toString());

                        if (event.type === 'session.updated') {
                            isSessionUpdated = true;
                            // Greeting logic is now handled in 'start' for ElevenLabs or 'session.updated' for OpenAI
                            if (callMode === 'agent' && activeProvider !== 'elevenlabs') {
                                checkAndSendGreetingOpenAI();
                            }
                        } 
                        // --- AUDIO OUTPUT (OpenAI Native) ---
                        else if (event.type === 'response.audio.delta' && event.delta) {
                            // BLOCKING LOGIC: Only send audio if NOT using ElevenLabs
                            if (streamSid && callMode === 'agent' && activeProvider !== 'elevenlabs') {
                                twilioWs.send(JSON.stringify({
                                    event: 'media',
                                    streamSid: streamSid,
                                    media: { payload: event.delta }
                                }));
                            }
                        } 
                        // --- INTERRUPTION HANDLING ---
                        else if (event.type === 'input_audio_buffer.speech_started') {
                            if (streamSid && callMode === 'agent') {
                                twilioWs.send(JSON.stringify({ event: 'clear', streamSid: streamSid }));
                                openAiWs.send(JSON.stringify({ type: 'response.cancel' }));
                            }
                        } 
                        // --- TRANSCRIPTIONS (User) ---
                        else if (event.type === 'conversation.item.input_audio_transcription.completed') {
                            const text = event.transcript;
                            if (text && text.trim().length > 0) {
                                log(`🗣️ User: ${text}`, "TRANSCRIPT");
                                transcripts.push({ role: 'user', message: text, timestamp: new Date() });
                            }
                        } 
                        // --- TRANSCRIPTIONS (Agent) & ELEVENLABS TRIGGER ---
                        // We use audio_transcript.done because it matches the audio generation we suppressed.
                        else if (event.type === 'response.audio_transcript.done') {
                            const text = event.transcript;
                            if (text && callMode === 'agent') {
                                transcripts.push({ role: 'assistant', message: text, timestamp: new Date() });
                                
                                // VOICE TRANSPLANT: OpenAI thought it spoke (we muted it), 
                                // now we take what it said and send to ElevenLabs.
                                if (activeProvider === 'elevenlabs' && elevenLabsApiKey) {
                                    streamElevenLabsAudio(text, activeVoice, elevenLabsApiKey, twilioWs, streamSid);
                                }
                            }
                        }
                    } catch (e) {}
                });

                openAiWs.on('close', () => isOpenAiConnected = false);
            } catch (err) {}
        };

        const checkAndSendGreetingOpenAI = () => {
             if (streamSid && isSessionUpdated && !hasSentGreeting) {
                openAiWs.send(JSON.stringify({
                    type: 'response.create',
                    response: {
                        modalities: ['text', 'audio'],
                        instructions: `Say '${initialGreeting}'` 
                    }
                }));
                hasSentGreeting = true;
             }
        };

        twilioWs.on('message', async (message) => {
            try {
                const data = JSON.parse(message.toString());

                if (data.event === 'start') {
                    streamSid = data.start.streamSid;
                    const params = data.start.customParameters || {};
                    
                    if (params.n8n_url) n8nUrl = params.n8n_url;
                    // Double check if params.n8n_url is empty string, if so fallback to default
                    if (!n8nUrl) n8nUrl = DEFAULT_N8N_WEBHOOK;
                    
                    if (params.mode) callMode = params.mode;
                    if (params.voice) activeVoice = params.voice;
                    if (params.provider) activeProvider = params.provider;
                    if (params.xi_api_key) elevenLabsApiKey = params.xi_api_key;
                    if (params.first_message) initialGreeting = params.first_message;
                    if (params.system_instruction) customSystemInstruction = params.system_instruction;
                    
                    // Set Source
                    if (params.source) callSource = params.source;

                    log(`▶️ Stream Started. Mode: ${callMode}. Voice: ${activeVoice} (${activeProvider}). Source: ${callSource}`, "TWILIO");
                    
                    // IF ElevenLabs: Trigger Greeting IMMEDIATELY (Don't wait for OpenAI loop)
                    if (callMode === 'agent' && activeProvider === 'elevenlabs' && elevenLabsApiKey) {
                        streamElevenLabsAudio(initialGreeting, activeVoice, elevenLabsApiKey, twilioWs, streamSid);
                        hasSentGreeting = true; // Mark as sent so OpenAI doesn't duplicate (though OpenAI side uses separate logic now)
                    }

                    connectToOpenAI();

                } else if (data.event === 'media') {
                    if (data.media.payload) {
                        const chunkBuffer = Buffer.from(data.media.payload, 'base64');
                        savedAudioChunks.push(chunkBuffer);

                        if (isOpenAiConnected && openAiWs.readyState === WebSocket.OPEN) {
                            openAiWs.send(JSON.stringify({
                                type: 'input_audio_buffer.append',
                                audio: data.media.payload 
                            }));
                        } else {
                            openAiAudioQueue.push(data.media.payload);
                        }
                    }

                } else if (data.event === 'stop') {
                    log(`⏹️ Call Ended. Processing recording...`, "TWILIO");
                    if (openAiWs) openAiWs.close();
                    
                    if (n8nUrl && n8nUrl.trim().length > 5) {
                        let recordingUrl = null;
                        let finalTranscription = null;

                        if (savedAudioChunks.length > 0) {
                            try {
                                log(`💾 Processing ${savedAudioChunks.length} chunks...`, "AUDIO");
                                const uLawBuffer = Buffer.concat(savedAudioChunks);
                                const pcmBuffer = decodeMuLawBuffer(uLawBuffer);
                                const wavHeader = createWavHeader(pcmBuffer.byteLength, 8000);
                                const finalWavBuffer = Buffer.concat([wavHeader, Buffer.from(pcmBuffer.buffer)]);

                                const fileName = `call_${callMode}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.wav`;
                                const { data: uploadData, error: uploadError } = await supabase
                                    .storage
                                    .from('audios') 
                                    .upload(fileName, finalWavBuffer, { contentType: 'audio/wav', upsert: false });

                                if (!uploadError) {
                                    const { data: publicUrlData } = supabase.storage.from('audios').getPublicUrl(fileName);
                                    recordingUrl = publicUrlData.publicUrl;
                                }

                                if (callMode === 'bridge') {
                                    finalTranscription = await transcribeWithWhisper(finalWavBuffer);
                                }
                            } catch (audioErr) {}
                        }

                        if (transcripts.length > 0 || recordingUrl || finalTranscription) {
                            let mainTranscript = "";
                            if (finalTranscription) {
                                mainTranscript = finalTranscription;
                            } else {
                                mainTranscript = transcripts.map(t => `${t.role.toUpperCase()}: ${t.message}`).join('\n');
                            }

                            log(`🚀 Sending Webhook to: ${n8nUrl}`, "WEBHOOK");
                            fetch(n8nUrl, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    assistantName: callMode === 'bridge' ? "Speed Dial Bridge" : "Twilio AI Agent",
                                    transcript: mainTranscript, 
                                    realtime_messages: transcripts, 
                                    recordingUrl: recordingUrl || "", 
                                    timestamp: new Date().toISOString(),
                                    status: 'success',
                                    mode: callMode,
                                    source: callSource || 'unknown'
                                })
                            }).then(res => {
                                if (res.ok) log(`✅ Webhook Delivered`, "WEBHOOK");
                                else log(`❌ Webhook HTTP Error: ${res.status}`, "WEBHOOK");
                            }).catch(err => log(`Webhook Failed: ${err.message}`, "WEBHOOK"));
                        }
                    } else {
                        log(`⚠️ No N8N URL configured. Skipping webhook.`, "WEBHOOK");
                    }
                }
            } catch (e) {
                log(`Twilio Msg Error: ${e.message}`, "ERROR");
            }
        });

        twilioWs.on('close', () => {
            if (openAiWs) openAiWs.close();
        });
    });
});

fastify.listen({ port: PORT, host: '0.0.0.0' }, (err) => {
    if (err) {
        log(err.message, 'FATAL');
        process.exit(1);
    }
    log(`✅ SERVER READY ON PORT ${PORT}`, "SYSTEM");
});
