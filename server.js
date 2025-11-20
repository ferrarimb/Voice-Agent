/**
 * Vapi Clone Backend - Twilio <-> OpenAI Realtime API (GPT-4o Audio)
 * 
 * DEBUG MODE: STABLE v4
 * Fixes: WebSocket Access, Race Conditions, Crash Prevention
 */

require('dotenv').config();
const Fastify = require('fastify');
const fastifyWebsocket = require('@fastify/websocket');
const fastifyFormBody = require('@fastify/formbody');
const WebSocket = require('ws');

const fastify = Fastify();
fastify.register(fastifyFormBody);
fastify.register(fastifyWebsocket);

const PORT = process.env.PORT || 5000;

// Fallback Key (Only for local testing if .env fails)
const TEST_KEY = "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";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY ? process.env.OPENAI_API_KEY.trim() : TEST_KEY;

// --- Helpers ---
const log = (msg, type = 'INFO') => {
    const time = new Date().toISOString().split('T')[1].slice(0, -1);
    console.log(`[${time}] [${type}] ${msg}`);
};

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

// 1. Incoming Call (HTTP)
fastify.post('/incoming', async (request, reply) => {
    const host = request.headers.host;
    log(`📞 Incoming Call! Host: ${host}`, "TWILIO");
    
    const wssUrl = `wss://${host}/media-stream`;
    log(`🔗 Returning TwiML with Stream URL: ${wssUrl}`, "TWILIO");

    const twiml = `
    <Response>
        <Connect>
            <Stream url="${wssUrl}" />
        </Connect>
        <Pause length="40" /> 
    </Response>
    `;
    reply.type('text/xml').send(twiml);
});

// 2. WebSocket Stream (Audio Bridge)
fastify.register(async (fastifyInstance) => {
    fastifyInstance.get('/media-stream', { websocket: true }, (connection, req) => {
        
        // CRITICAL FIX: Safe socket extraction
        // Depending on fastify-websocket version, it might be connection.socket or connection itself
        const twilioWs = connection.socket || connection;
        
        if (!twilioWs) {
            log("❌ FATAL: Could not retrieve WebSocket object from connection", "ERROR");
            return;
        }

        log('🔌 Twilio Socket Connected', "TWILIO");

        let streamSid = null;
        let openAiWs = null;
        
        // State Flags
        let isOpenAiConnected = false;
        let isSessionUpdated = false;
        let hasSentGreeting = false;

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
                    
                    // Initialize Session
                    const sessionConfig = {
                        type: 'session.update',
                        session: {
                            modalities: ['text', 'audio'],
                            instructions: SYSTEM_MESSAGE,
                            voice: VOICE,
                            input_audio_format: 'g711_ulaw',
                            output_audio_format: 'g711_ulaw',
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
                            log('✅ Session Updated', "OPENAI");
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
                            log('🗣️ User speaking (Interrupt)', "OPENAI");
                            if (streamSid) {
                                twilioWs.send(JSON.stringify({ event: 'clear', streamSid: streamSid }));
                                openAiWs.send(JSON.stringify({ type: 'response.cancel' }));
                            }
                        }
                    } catch (e) {
                        log(`Error processing OpenAI message: ${e.message}`, "ERROR");
                    }
                });

                openAiWs.on('close', (code, reason) => {
                    log(`💀 OpenAI Closed: ${code} ${reason}`, "OPENAI");
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
                    log(`▶️ Stream Started: ${streamSid}`, "TWILIO");
                    checkAndSendGreeting();
                } else if (data.event === 'media' && isOpenAiConnected && openAiWs.readyState === WebSocket.OPEN) {
                    openAiWs.send(JSON.stringify({
                        type: 'input_audio_buffer.append',
                        audio: data.media.payload
                    }));
                } else if (data.event === 'stop') {
                    log('⏹️ Call Ended', "TWILIO");
                    if (openAiWs) openAiWs.close();
                }
            } catch (e) {
                log(`Error parsing Twilio message: ${e.message}`, "ERROR");
            }
        });

        twilioWs.on('close', () => {
            log('🔌 Twilio Disconnected', "TWILIO");
            if (openAiWs) openAiWs.close();
        });

        // --- Sincronização ---
        const checkAndSendGreeting = () => {
            if (streamSid && isSessionUpdated && !hasSentGreeting) {
                log('⚡ Triggering Greeting...', "SYSTEM");
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

        // Start
        connectToOpenAI();
    });
});

// --- Start Server ---
fastify.listen({ port: PORT, host: '0.0.0.0' }, (err) => {
    if (err) {
        log(`Failed to start server: ${err.message}`, "FATAL");
        process.exit(1);
    }
    log(`✅ SERVER READY ON PORT ${PORT}`, "SYSTEM");
});