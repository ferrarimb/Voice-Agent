

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
const KONCLUI_FALLBACK_WEBHOOK = 'https://n8n-webhook.mkt.konclui.com/webhook/fallback-konclui-4f25-9986-c8b8d1094d93';

// Global Map to store SDR detection results (keyed by CallSid)
// This allows /verify-sdr to pass detection results to the WebSocket handler
const sdrDetectionResults = new Map();

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

// Helper to clean ring tone artifacts from transcription
// Whisper sometimes transcribes ringing as "BIIIIII...", "RIIING", repeated chars, etc.
const cleanRingToneArtifacts = (text) => {
    if (!text) return text;
    
    // Remove long sequences of repeated characters (5+ of same char)
    // e.g., "BIIIIIIIIII" -> ""
    let cleaned = text.replace(/(.)\1{4,}/g, '');
    
    // Remove common ring tone transcription patterns
    cleaned = cleaned.replace(/\b[BR]I{3,}N?G?\b/gi, ''); // BIIIII, RIIIING, etc
    cleaned = cleaned.replace(/📞|🔔|⏏️|🔴/g, ''); // Emoji artifacts
    
    // Clean up multiple spaces and trim
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
    
    return cleaned;
};

// Helper to validate if transcript contains real human speech (not just noise/beeps)
// Returns true only if there's meaningful content after cleaning artifacts
const isRealHumanSpeech = (text) => {
    if (!text || typeof text !== 'string') return false;
    
    // Clean artifacts first
    const cleaned = cleanRingToneArtifacts(text);
    if (!cleaned || cleaned.length === 0) return false;
    
    // Filter out common noise patterns that Whisper transcribes
    const noisePatterns = [
        /^bip+$/i,                    // "bip", "bipi", "bipp"
        /^beep+$/i,                   // "beep", "beeep"
        /^\.\.+$/,                   // "...", "....."
        /^[\s\.\,\-]+$/,             // Only punctuation/spaces
        /^[a-z]$/i,                   // Single letter
        /^(ah+|eh+|oh+|uh+)$/i,       // Just vowel sounds
        /^\[.*\]$/,                   // Bracketed content like "[NOISE]"
        /^\(.*\)$/,                   // Parenthesized content like "(bip)"
        /^música/i,                   // "música" (background music)
        /^som/i,                      // "som" (sound)
        /^ruído/i                     // "ruído" (noise)
    ];
    
    // Check if it matches any noise pattern
    for (const pattern of noisePatterns) {
        if (pattern.test(cleaned.trim())) {
            return false;
        }
    }
    
    // Must have at least 3 characters after cleaning to be considered real speech
    // This filters out very short artifacts like "a", "o", etc.
    if (cleaned.length < 3) return false;
    
    // If we got here, it's likely real human speech
    return true;
}

// Helper to send fallback webhook for Speed Dial failures
// CRITICAL: This ensures ALL speed dial attempts are logged, even failures
const sendSpeedDialFallbackWebhook = async (params) => {
    const {
        token = 'sem_token',
        n8n_url,
        lead_id = 'sem_lead_id',
        call_id = '',
        nome_lead = '',
        telefone_lead = '',
        telefone_sdr = '',
        status = 'failed',
        error_reason = '',
        sdr_answered = false,
        lead_answered = false,
        sdr_detection_reason = '',
        lead_detection_reason = '',
        sip_response_code = '',
        call_sid = ''
    } = params;

    // Determine final webhook URL based on token
    const finalWebhookUrl = (token === 'konclui') 
        ? KONCLUI_FALLBACK_WEBHOOK
        : (n8n_url || DEFAULT_N8N_WEBHOOK);

    const webhookPayload = {
        assistantName: "Speed Dial Bridge",
        transcript: `[Falha no disparo: ${error_reason}]`,
        realtime_messages: [],
        recordingUrl: "",
        timestamp: new Date().toISOString(),
        status: status,
        mode: 'bridge',
        source: 'speed_dial_fallback',
        sdr_transcript: "",
        lead_transcript: "",
        token: token,
        lead_id: lead_id,
        call_id: call_id,
        nome_lead: nome_lead,
        telefone_lead: telefone_lead,
        telefone_sdr: telefone_sdr,
        sdr_answered: sdr_answered,
        lead_answered: lead_answered,
        sdr_detection_reason: sdr_detection_reason,
        lead_detection_reason: lead_detection_reason,
        error_reason: error_reason,
        sip_response_code: sip_response_code,
        call_sid: call_sid
    };

    log(`🚨 [FALLBACK WEBHOOK] Enviando para: ${(token === 'konclui') ? 'Konclui' : 'N8N'} - Motivo: ${error_reason}`, "WEBHOOK");
    log(`📊 [FALLBACK WEBHOOK] Payload: token=${token}, lead_id=${lead_id}, call_id=${call_id}`, "DEBUG");

    try {
        const res = await fetch(finalWebhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(webhookPayload)
        });
        
        if (res.ok) {
            log(`✅ [FALLBACK WEBHOOK] Entregue com sucesso`, "WEBHOOK");
        } else {
            const errBody = await res.text().catch(() => 'No body');
            log(`❌ [FALLBACK WEBHOOK] HTTP Error: ${res.status} - ${errBody}`, "WEBHOOK");
        }
    } catch (err) {
        log(`❌ [FALLBACK WEBHOOK] Network Failed: ${err.message}`, "WEBHOOK");
    }
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

// 3. Create WAV Header (Standard 8kHz, 16-bit, configurable channels)
function createWavHeader(dataLength, sampleRate = 8000, numChannels = 1) {
    const buffer = Buffer.alloc(44);
    const blockAlign = numChannels * 2; // 2 bytes per sample (16-bit)
    const byteRate = sampleRate * blockAlign;
    
    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(36 + dataLength, 4);
    buffer.write('WAVE', 8);
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16); // PCM
    buffer.writeUInt16LE(1, 20);  // Audio format (1 = PCM)
    buffer.writeUInt16LE(numChannels, 22);  // Channels
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(byteRate, 28); // Byte Rate
    buffer.writeUInt16LE(blockAlign, 32);  // Block Align
    buffer.writeUInt16LE(16, 34); // Bits per Sample
    buffer.write('data', 36);
    buffer.writeUInt32LE(dataLength, 40);
    return buffer;
}

// 4. Process timestamped chunks into synchronized PCM buffers
// Returns {inboundPcm, outboundPcm} aligned by timestamp
function processTimestampedChunks(inboundChunks, outboundChunks, sampleRate = 8000) {
    // Each chunk has {timestamp (ms), buffer}
    // Twilio sends ~20ms chunks at 8kHz = 160 samples per chunk
    const samplesPerMs = sampleRate / 1000; // 8 samples per ms
    
    // Find the earliest timestamp across both tracks (stream start)
    const inboundStart = inboundChunks.length > 0 ? inboundChunks[0].timestamp : Infinity;
    const outboundStart = outboundChunks.length > 0 ? outboundChunks[0].timestamp : Infinity;
    const globalStart = Math.min(inboundStart, outboundStart);
    
    // Find the latest end timestamp
    const inboundEnd = inboundChunks.length > 0 ? inboundChunks[inboundChunks.length - 1].timestamp : 0;
    const outboundEnd = outboundChunks.length > 0 ? outboundChunks[outboundChunks.length - 1].timestamp : 0;
    const globalEnd = Math.max(inboundEnd, outboundEnd);
    
    // Calculate total duration and buffer size
    // Add some padding for the last chunk (~20ms)
    const totalDurationMs = globalEnd - globalStart + 20;
    const totalSamples = Math.ceil(totalDurationMs * samplesPerMs);
    
    log(`🔄 Sync: GlobalStart=${globalStart}ms, InboundStart=${inboundStart}ms, OutboundStart=${outboundStart}ms, Duration=${totalDurationMs}ms`, "AUDIO");
    
    // Create output buffers initialized with silence (0)
    const inboundPcm = new Int16Array(totalSamples);
    const outboundPcm = new Int16Array(totalSamples);
    
    // Place inbound chunks at correct positions
    for (const chunk of inboundChunks) {
        const offsetMs = chunk.timestamp - globalStart;
        const sampleOffset = Math.floor(offsetMs * samplesPerMs);
        const decoded = decodeMuLawBuffer(chunk.buffer);
        
        for (let i = 0; i < decoded.length && (sampleOffset + i) < totalSamples; i++) {
            inboundPcm[sampleOffset + i] = decoded[i];
        }
    }
    
    // Place outbound chunks at correct positions
    for (const chunk of outboundChunks) {
        const offsetMs = chunk.timestamp - globalStart;
        const sampleOffset = Math.floor(offsetMs * samplesPerMs);
        const decoded = decodeMuLawBuffer(chunk.buffer);
        
        for (let i = 0; i < decoded.length && (sampleOffset + i) < totalSamples; i++) {
            outboundPcm[sampleOffset + i] = decoded[i];
        }
    }
    
    return { inboundPcm, outboundPcm };
}

// 5. Create Stereo WAV from two synchronized mono tracks (interleave samples)
function createStereoWav(inboundPcm, outboundPcm, sampleRate = 8000) {
    // Use the longer track length, pad shorter one with silence
    const maxLength = Math.max(inboundPcm.length, outboundPcm.length);
    
    // Interleave: Left channel = inbound (Lead), Right channel = outbound (SDR)
    const stereoData = new Int16Array(maxLength * 2);
    
    for (let i = 0; i < maxLength; i++) {
        // Left channel (inbound/Lead)
        stereoData[i * 2] = i < inboundPcm.length ? inboundPcm[i] : 0;
        // Right channel (outbound/SDR)
        stereoData[i * 2 + 1] = i < outboundPcm.length ? outboundPcm[i] : 0;
    }
    
    const wavHeader = createWavHeader(stereoData.byteLength, sampleRate, 2);
    return Buffer.concat([wavHeader, Buffer.from(stereoData.buffer)]);
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

// --- TRANSCRIPTION API HELPER (using gpt-4o-transcribe for best accuracy) ---
// gpt-4o-transcribe has significantly lower Word Error Rate than whisper-1
async function transcribeAudio(audioBuffer, apiKey = null) {
    const useKey = apiKey || OPENAI_API_KEY;
    const boundary = '--------------------------' + Date.now().toString(16);
    const model = 'gpt-4o-transcribe'; // Best accuracy model
    const language = 'pt';

    const parts = [
        `--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\n${model}\r\n`,
        `--${boundary}\r\nContent-Disposition: form-data; name="language"\r\n\r\n${language}\r\n`,
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="recording.wav"\r\nContent-Type: audio/wav\r\n\r\n`
    ];

    const start = Buffer.from(parts.join(''));
    const end = Buffer.from(`\r\n--${boundary}--\r\n`);
    const payload = Buffer.concat([start, audioBuffer, end]);

    try {
        log(`🎙️ Sending ${audioBuffer.length} bytes to GPT-4o Transcribe...`, "WHISPER");
        const resp = await fetch('https://api.openai.com/v1/audio/transcriptions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${useKey}`,
                'Content-Type': `multipart/form-data; boundary=${boundary}`,
                'Content-Length': payload.length
            },
            body: payload
        });
        
        const data = await resp.json();
        if (data.error) throw new Error(data.error.message);
        
        return {
            text: data.text || '',
            segments: []
        };
    } catch (e) {
        log(`❌ Transcription Error: ${e.message}`, "ERROR");
        return { text: '', segments: [] };
    }
}

// --- AUDIO ENERGY ANALYSIS (Voice Activity Detection) ---
function calculateRMS(samples, start, end) {
    let sum = 0;
    const count = end - start;
    for (let i = start; i < end && i < samples.length; i++) {
        sum += samples[i] * samples[i];
    }
    return Math.sqrt(sum / count);
}

function detectSpeakerSegments(sdrPcm, outboundPcm, sampleRate = 8000, windowMs = 300) {
    const windowSize = Math.floor(sampleRate * windowMs / 1000); // samples per window
    const totalSamples = Math.max(sdrPcm.length, outboundPcm.length);
    const segments = [];
    
    // Energy threshold for voice activity (adjust based on testing)
    const SILENCE_THRESHOLD = 50; // RMS threshold for silence
    const BIANCA_END_SEC = 8; // First 8 seconds are BIANCA
    const biancaEndSample = BIANCA_END_SEC * sampleRate;
    
    let currentSpeaker = null;
    let segmentStart = 0;
    
    for (let pos = 0; pos < totalSamples; pos += windowSize) {
        const windowEnd = Math.min(pos + windowSize, totalSamples);
        const timeSeconds = pos / sampleRate;
        
        // Calculate RMS energy for each channel
        const sdrEnergy = pos < sdrPcm.length ? calculateRMS(sdrPcm, pos, Math.min(windowEnd, sdrPcm.length)) : 0;
        const outEnergy = pos < outboundPcm.length ? calculateRMS(outboundPcm, pos, Math.min(windowEnd, outboundPcm.length)) : 0;
        
        // Determine who is speaking in this window
        let speaker = null;
        if (sdrEnergy > SILENCE_THRESHOLD && sdrEnergy > outEnergy * 1.2) {
            speaker = 'SDR';
        } else if (outEnergy > SILENCE_THRESHOLD && outEnergy >= sdrEnergy * 0.8) {
            // Outbound channel: BIANCA for first 8s, then LEAD
            speaker = pos < biancaEndSample ? 'BIANCA' : 'LEAD';
        }
        // If both are below threshold or similar, keep silence (null)
        
        // Track speaker changes
        if (speaker !== currentSpeaker) {
            if (currentSpeaker !== null && pos > segmentStart) {
                segments.push({
                    speaker: currentSpeaker,
                    startSample: segmentStart,
                    endSample: pos,
                    startSec: segmentStart / sampleRate,
                    endSec: pos / sampleRate
                });
            }
            currentSpeaker = speaker;
            segmentStart = pos;
        }
    }
    
    // Don't forget the last segment
    if (currentSpeaker !== null && totalSamples > segmentStart) {
        segments.push({
            speaker: currentSpeaker,
            startSample: segmentStart,
            endSample: totalSamples,
            startSec: segmentStart / sampleRate,
            endSec: totalSamples / sampleRate
        });
    }
    
    // Merge consecutive segments of the same speaker (with small gaps)
    const mergedSegments = [];
    for (const seg of segments) {
        const last = mergedSegments[mergedSegments.length - 1];
        // Merge if same speaker and gap is less than 1 second
        if (last && last.speaker === seg.speaker && (seg.startSec - last.endSec) < 1.0) {
            last.endSample = seg.endSample;
            last.endSec = seg.endSec;
        } else {
            mergedSegments.push({ ...seg });
        }
    }
    
    return mergedSegments;
}

// --- BIANCA MESSAGE PATTERNS ---
// These are the known TTS messages that BIANCA speaks during a bridge call
// Include common Whisper misrecognitions (lead -> Lyd, líder, lid, etc)
const BIANCA_PATTERNS = [
    /novo lead/i,
    /agendado para/i,
    /pediu para falar/i,
    /diga algo para confirmar/i,
    /conectando com o/i,  // Broad match - "conectando com o" anything (lead, Lyd, líder, etc)
    /não foi poss[íi]vel confirmar/i,
    /a ligação será encerrada/i,
    /especialista/i,
    /falar com especialista/i
];

function isBiancaMessage(text) {
    if (!text) return false;
    const normalized = text.toLowerCase().trim();
    return BIANCA_PATTERNS.some(pattern => pattern.test(normalized));
}

// --- TRANSCRIBE BRIDGE CALL (True chronological ordering via VAD) ---
// Uses Voice Activity Detection to determine who speaks when, then transcribes in order
async function transcribeBridgeCall(inboundPcm, outboundPcm, apiKey = null) {
    const results = { sdr: null, lead: null, combined: null };
    const SAMPLE_RATE = 8000;
    const MIN_SEGMENT_DURATION = 0.5; // Minimum 0.5 seconds to transcribe
    
    try {
        if (!inboundPcm || !outboundPcm || inboundPcm.length === 0 || outboundPcm.length === 0) {
            log(`⚠️ Missing audio channels for bridge transcription`, "WHISPER");
            return results;
        }
        
        // Step 1: Detect speaker segments using energy analysis
        log(`🔍 Analisando atividade de voz em ${Math.max(inboundPcm.length, outboundPcm.length)} samples...`, "WHISPER");
        const segments = detectSpeakerSegments(inboundPcm, outboundPcm, SAMPLE_RATE);
        log(`📊 Detectados ${segments.length} segmentos de fala`, "WHISPER");
        
        // Step 2: Transcribe each segment in chronological order
        const transcribedSegments = [];
        let sdrTexts = [];
        let leadTexts = [];
        
        for (let i = 0; i < segments.length; i++) {
            const seg = segments[i];
            const duration = seg.endSec - seg.startSec;
            
            // Skip very short segments
            if (duration < MIN_SEGMENT_DURATION) continue;
            
            // Extract audio for this segment from the appropriate channel
            let segmentPcm;
            if (seg.speaker === 'SDR') {
                segmentPcm = inboundPcm.slice(seg.startSample, seg.endSample);
            } else {
                // BIANCA or LEAD - both from outbound channel
                segmentPcm = outboundPcm.slice(seg.startSample, seg.endSample);
            }
            
            // Create WAV and transcribe
            if (segmentPcm.length > 0) {
                const wavHeader = createWavHeader(segmentPcm.byteLength, SAMPLE_RATE, 1);
                const wavBuffer = Buffer.concat([wavHeader, Buffer.from(segmentPcm.buffer, segmentPcm.byteOffset, segmentPcm.byteLength)]);
                
                log(`🎤 [${i+1}/${segments.length}] ${seg.speaker} (${seg.startSec.toFixed(1)}s-${seg.endSec.toFixed(1)}s)...`, "WHISPER");
                const result = await transcribeAudio(wavBuffer, apiKey);
                
                if (result.text && result.text.trim()) {
                    const text = result.text.trim();
                    
                    // Post-processing: Correct speaker based on content
                    // If originally detected as LEAD but matches BIANCA patterns, it's BIANCA
                    let finalSpeaker = seg.speaker;
                    if (seg.speaker === 'LEAD' && isBiancaMessage(text)) {
                        finalSpeaker = 'BIANCA';
                        log(`🔄 Corrigido: "${text.substring(0, 30)}..." era LEAD, agora é BIANCA`, "WHISPER");
                    }
                    
                    transcribedSegments.push({
                        speaker: finalSpeaker,
                        text: text,
                        startSec: seg.startSec
                    });
                    
                    // Collect for raw transcripts (only SDR and LEAD, not BIANCA)
                    if (finalSpeaker === 'SDR') sdrTexts.push(text);
                    if (finalSpeaker === 'LEAD') leadTexts.push(text);
                }
            }
        }
        
        // Step 3: Build final transcript (clean ring tone artifacts)
        results.sdr = cleanRingToneArtifacts(sdrTexts.join(' '));
        results.lead = cleanRingToneArtifacts(leadTexts.join(' '));
        
        if (transcribedSegments.length > 0) {
            results.combined = transcribedSegments
                .map(s => `[${s.speaker}]: ${cleanRingToneArtifacts(s.text)}`)
                .filter(line => line.split(': ')[1]?.trim()) // Remove empty lines after cleaning
                .join('\n');
        }
        
        log(`✅ Transcrição Bridge completa. ${transcribedSegments.length} segmentos transcritos.`, "WHISPER");
        
    } catch (e) {
        log(`❌ Erro na transcrição Bridge: ${e.message}`, "ERROR");
    }
    
    return results;
}

// --- QUICK CONFIRMATION PATTERNS ---
// These are common short responses that DEFINITELY indicate a human SDR answered
// Used as a FAST PATH to avoid API call delays and potential failures
const QUICK_CONFIRMATION_PATTERNS = [
    /^(confirmad[oa]|confirm[oa])$/i,      // "Confirmada", "Confirmado", "Confirma", "Confirmo"
    /^(ok|okay|ок)$/i,                      // "OK", "Okay"
    /^(sim|s)$/i,                           // "Sim", "S"
    /^(pode|prosseguir|prossiga)$/i,       // "Pode", "Prosseguir", "Prossiga"
    /^(certo|cert[oa])$/i,                  // "Certo", "Certa"
    /^(beleza|blz)$/i,                      // "Beleza", "Blz"
    /^(tá|ta|tudo bem|tranquilo)$/i,       // "Tá", "Ta", "Tudo bem", "Tranquilo"
    /^(pronto|pront[oa])$/i,               // "Pronto", "Pronta"
    /^(alô|alo|oi|olá|ola|fala)$/i,       // Greetings
    /^(manda|vai|vamos|bora)$/i,           // "Manda", "Vai", "Vamos", "Bora"
    /^(positivo|afirmativo)$/i,            // "Positivo", "Afirmativo"
    /^(entendi|entendido)$/i,              // "Entendi", "Entendido"
    /^(aqui|presente)$/i,                  // "Aqui", "Presente"
    /^(é|eh|isso)$/i,                      // "É", "Eh", "Isso"
    /^(falo|fala eu)$/i,                   // "Falo", "Fala eu"
];

// Check if transcript matches quick confirmation patterns (FAST PATH)
function isQuickConfirmation(transcript) {
    if (!transcript || typeof transcript !== 'string') return false;
    const cleaned = transcript.trim().toLowerCase();
    // Remove punctuation for matching
    const noPunctuation = cleaned.replace(/[.,!?;:]+/g, '').trim();
    
    for (const pattern of QUICK_CONFIRMATION_PATTERNS) {
        if (pattern.test(noPunctuation)) {
            return true;
        }
    }
    return false;
}

// --- SDR ANSWER DETECTION (Voicemail vs Real Person) ---
async function analyzeSDRAnswer(transcript, apiKey = null) {
    const useKey = apiKey || OPENAI_API_KEY;
    
    // FAST PATH: Check for quick confirmation patterns FIRST
    // This avoids API call delays and potential failures for obvious human responses
    if (isQuickConfirmation(transcript)) {
        log(`✅ [FAST PATH] Quick confirmation detected: "${transcript}"`, "DETECTION");
        return {
            isHuman: true,
            confidence: 0.99,
            reason: `quick_confirmation_pattern: "${transcript}"`
        };
    }
    
    try {
        log(`🔍 Analisando resposta do SDR via API: "${transcript}"`, "DETECTION");
        
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${useKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [
                    {
                        role: 'system',
                        content: `Você é um detector de caixa postal/secretária eletrônica.

Analise a transcrição da primeira fala de uma ligação telefônica e determine se:
1. É uma PESSOA REAL atendendo (ex: "Alô", "Oi", "Fala", "Bianca", "Quem é?", nome da pessoa, etc)
2. É uma CAIXA POSTAL ou SECRETÁRIA ELETRÔNICA (ex: "Você ligou para...", "Deixe sua mensagem", "não está disponível", "após o sinal", promoções automáticas, etc)

Responda APENAS com um JSON no formato:
{"is_human": true/false, "confidence": 0.0-1.0, "reason": "breve explicação"}

Seja rigoroso: na dúvida, assuma que é caixa postal para evitar conectar leads a mensagens automáticas.`
                    },
                    {
                        role: 'user',
                        content: `Transcrição: "${transcript}"`
                    }
                ],
                temperature: 0.1,
                max_tokens: 100
            })
        });
        
        const data = await response.json();
        if (data.error) throw new Error(data.error.message);
        
        const content = data.choices[0]?.message?.content || '{}';
        
        // Parse JSON response
        const jsonMatch = content.match(/\{[^}]+\}/);
        if (jsonMatch) {
            const result = JSON.parse(jsonMatch[0]);
            log(`✅ Detecção: is_human=${result.is_human}, confidence=${result.confidence}, reason="${result.reason}"`, "DETECTION");
            return {
                isHuman: result.is_human === true,
                confidence: result.confidence || 0,
                reason: result.reason || 'unknown'
            };
        }
        
        // Fallback: assume não é humano se não conseguiu parsear
        log(`⚠️ Não foi possível parsear resposta, assumindo caixa postal`, "DETECTION");
        return { isHuman: false, confidence: 0, reason: 'parse_error' };
        
    } catch (e) {
        log(`❌ Erro na detecção SDR: ${e.message}`, "ERROR");
        // Em caso de erro, assume que não é humano para segurança
        return { isHuman: false, confidence: 0, reason: `error: ${e.message}` };
    }
}

// --- LEAD ANSWER DETECTION (Real Human vs Noise/Voicemail) ---
async function analyzeLeadAnswer(transcript, apiKey = null) {
    const useKey = apiKey || OPENAI_API_KEY;
    
    // Quick pre-checks before calling AI
    if (!transcript || typeof transcript !== 'string') {
        return { isHuman: false, confidence: 1.0, reason: 'no_transcript' };
    }
    
    const cleaned = cleanRingToneArtifacts(transcript);
    if (!cleaned || cleaned.trim().length === 0) {
        return { isHuman: false, confidence: 1.0, reason: 'empty_after_cleaning' };
    }
    
    // If it's only BIANCA messages, lead didn't speak
    if (isBiancaMessage(cleaned)) {
        return { isHuman: false, confidence: 0.95, reason: 'only_bianca_messages' };
    }
    
    // If very short and matches noise patterns, skip AI call
    if (!isRealHumanSpeech(cleaned)) {
        return { isHuman: false, confidence: 0.9, reason: 'noise_or_artifacts' };
    }
    
    try {
        log(`🔍 Analisando resposta do LEAD: "${transcript.substring(0, 100)}..."`, "DETECTION");
        
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${useKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [
                    {
                        role: 'system',
                        content: `Você é um detector de fala humana real em transcrições de ligações telefônicas.

Analise a transcrição e determine se contém FALA HUMANA REAL do lead (pessoa que recebeu a ligação).

CONSIDERE HUMANO REAL:
- Saudações naturais: "Alô", "Oi", "Fala", "Sim", "Quem é?", "Pronto"
- Respostas conversacionais: perguntas, afirmações, negações
- Qualquer fala que indique interação humana genuína

CONSIDERE NÃO HUMANO (retorne false):
- Mensagens de caixa postal/secretária eletrônica
- Apenas ruídos transcritos: "bip", "beep", sons
- Mensagens do sistema/assistente virtual (ex: "conectando com o lead")
- Promoções automáticas de operadoras
- Transcrições muito curtas sem sentido (menos de 2 palavras reais)
- Música de espera

Responda APENAS com JSON: {"is_human": true/false, "confidence": 0.0-1.0, "reason": "breve explicação"}`
                    },
                    {
                        role: 'user',
                        content: `Transcrição do lead: "${transcript}"`
                    }
                ],
                temperature: 0.1,
                max_tokens: 100
            })
        });
        
        const data = await response.json();
        if (data.error) throw new Error(data.error.message);
        
        const content = data.choices[0]?.message?.content || '{}';
        
        const jsonMatch = content.match(/\{[^}]+\}/);
        if (jsonMatch) {
            const result = JSON.parse(jsonMatch[0]);
            log(`✅ Detecção Lead: is_human=${result.is_human}, confidence=${result.confidence}, reason="${result.reason}"`, "DETECTION");
            return {
                isHuman: result.is_human === true,
                confidence: result.confidence || 0,
                reason: result.reason || 'unknown'
            };
        }
        
        log(`⚠️ Não foi possível parsear resposta do lead, assumindo não-humano`, "DETECTION");
        return { isHuman: false, confidence: 0, reason: 'parse_error' };
        
    } catch (e) {
        log(`❌ Erro na detecção Lead: ${e.message}`, "ERROR");
        // Em caso de erro, usa fallback simples
        const fallback = isRealHumanSpeech(cleaned);
        return { isHuman: fallback, confidence: 0.5, reason: `error_fallback: ${e.message}` };
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
        log(`[SPEED-DIAL] Body recebido: ${JSON.stringify(body ? Object.keys(body) : 'null')}`, "DEBUG");
        
        if (!body) {
            log(`[SPEED-DIAL] ❌ Body missing`, "ERROR");
            return reply.status(400).send({ success: false, error: "Body missing" });
        }

        const { 
            lead_name, 
            lead_phone, 
            sdr_phone, 
            data_agendamento,
            twilio_config, 
            n8n_url,
            token,
            lead_id,
            openai_key
        } = body;
        
        // Gerar call_id único
        const finalCallId = `${Date.now()}-${Math.random().toString(36).substring(2, 18)}`;
        
        log(`[SPEED-DIAL] Dados: lead=${lead_name}, lead_phone=${lead_phone}, sdr=${sdr_phone}`, "DEBUG");
        log(`[SPEED-DIAL] Twilio Config presente: ${!!twilio_config}, SID: ${twilio_config?.accountSid?.substring(0,8)}...`, "DEBUG");
        
        if (!twilio_config || !twilio_config.accountSid || !twilio_config.authToken) {
            log(`[SPEED-DIAL] ❌ Missing Twilio Config`, "ERROR");
            // Enviar webhook de fallback para credenciais ausentes
            await sendSpeedDialFallbackWebhook({
                token: token || 'sem_token',
                n8n_url: n8n_url,
                lead_id: lead_id || 'sem_lead_id',
                call_id: finalCallId,
                nome_lead: lead_name || '',
                telefone_lead: lead_phone || '',
                telefone_sdr: sdr_phone || '',
                status: 'failed',
                error_reason: 'credenciais_twilio_ausentes'
            });
            return reply.status(400).send({ success: false, error: 'Missing Twilio Config', call_id: finalCallId });
        }

        const cleanSdrPhone = sanitizePhone(sdr_phone);
        const cleanLeadPhone = sanitizePhone(lead_phone);

        // Apply fallback if n8n_url is missing or empty
        const finalN8nUrl = n8n_url || DEFAULT_N8N_WEBHOOK;
        
        // Se não tiver data_agendamento, lead pediu para falar com especialista
        const agendou = !!data_agendamento;
        const finalHorario = data_agendamento || "";
        
        const userToken = token || 'sem_token';
        const userLeadId = lead_id || 'sem_lead_id';

        const auth = Buffer.from(`${twilio_config.accountSid}:${twilio_config.authToken}`).toString('base64');
        const callbackUrl = `${twilio_config.baseUrl}/connect-lead?lead_name=${encodeURIComponent(lead_name)}&lead_phone=${encodeURIComponent(cleanLeadPhone)}&horario=${encodeURIComponent(finalHorario)}&agendou=${agendou}&n8n_url=${encodeURIComponent(finalN8nUrl)}${openai_key ? `&openai_key=${encodeURIComponent(openai_key)}` : ''}&user_token=${encodeURIComponent(userToken)}&lead_id=${encodeURIComponent(userLeadId)}&call_id=${encodeURIComponent(finalCallId)}`;

        log(`[SPEED-DIAL] Callback URL: ${callbackUrl}`, "DEBUG");

        // Build StatusCallback URL to capture failed calls (busy, no-answer, canceled, failed)
        const statusCallbackUrl = `${twilio_config.baseUrl}/call-status?token=${encodeURIComponent(userToken)}&lead_id=${encodeURIComponent(userLeadId)}&call_id=${encodeURIComponent(finalCallId)}&nome_lead=${encodeURIComponent(lead_name || '')}&telefone_lead=${encodeURIComponent(cleanLeadPhone)}&telefone_sdr=${encodeURIComponent(cleanSdrPhone)}&n8n_url=${encodeURIComponent(finalN8nUrl)}`;

        const formData = new URLSearchParams();
        formData.append('To', cleanSdrPhone);
        formData.append('From', twilio_config.fromNumber);
        formData.append('Url', callbackUrl); 
        formData.append('MachineDetection', 'Enable');
        formData.append('StatusCallback', statusCallbackUrl);
        formData.append('StatusCallbackEvent', 'completed');

        log(`[SPEED-DIAL] 📞 Chamando Twilio API para ${cleanSdrPhone}...`, "INFO");
        log(`[SPEED-DIAL] StatusCallback URL: ${statusCallbackUrl}`, "DEBUG");

        const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilio_config.accountSid}/Calls.json`, {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${auth}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: formData
        });

        log(`[SPEED-DIAL] Twilio Response Status: ${response.status}`, "DEBUG");

        if (!response.ok) {
            const err = await response.json();
            log(`[SPEED-DIAL] ❌ Twilio Error: ${JSON.stringify(err)}`, "ERROR");
            // Enviar webhook de fallback para erro da API Twilio
            await sendSpeedDialFallbackWebhook({
                token: userToken,
                n8n_url: finalN8nUrl,
                lead_id: userLeadId,
                call_id: finalCallId,
                nome_lead: lead_name,
                telefone_lead: cleanLeadPhone,
                telefone_sdr: cleanSdrPhone,
                status: 'failed',
                error_reason: `twilio_api_error: ${err.message}`
            });
            return reply.send({ success: false, error: err.message || JSON.stringify(err), call_id: finalCallId });
        }
        
        const result = await response.json();
        log(`[SPEED-DIAL] ✅ Chamada iniciada! SID: ${result.sid}`, "SYSTEM");
        return reply.send({ success: true, sid: result.sid, call_id: finalCallId });
    } catch (e) {
        log(`[TRIGGER] ❌ Exception: ${e.message}`, "ERROR");
        log(`[TRIGGER] Stack: ${e.stack}`, "ERROR");
        const errorCallId = `${Date.now()}-${Math.random().toString(36).substring(2, 18)}`;
        // Enviar webhook de fallback para exceção
        await sendSpeedDialFallbackWebhook({
            token: request.body?.token || 'sem_token',
            n8n_url: request.body?.n8n_url,
            lead_id: request.body?.lead_id || 'sem_lead_id',
            call_id: errorCallId,
            nome_lead: request.body?.lead_name || '',
            telefone_lead: request.body?.lead_phone || '',
            telefone_sdr: request.body?.sdr_phone || '',
            status: 'failed',
            error_reason: `exception: ${e.message}`
        });
        return reply.status(500).send({ success: false, error: e.message, call_id: errorCallId });
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
            TWILIO_FROM_NUMBER,
            OPENAI_KEY,
            token,
            lead_id,
            call_id
        } = body;
        
        const finalCallId = call_id || `${Date.now()}-${Math.random().toString(36).substring(2, 18)}`;

        if (!nome_lead || !telefone_lead || !telefone_sdr) {
            // Enviar webhook de fallback mesmo com parâmetros faltando
            await sendSpeedDialFallbackWebhook({
                token: token || 'sem_token',
                n8n_url: n8n_url,
                lead_id: lead_id || 'sem_lead_id',
                call_id: finalCallId,
                nome_lead: nome_lead || '',
                telefone_lead: telefone_lead || '',
                telefone_sdr: telefone_sdr || '',
                status: 'failed',
                error_reason: 'parametros_obrigatorios_faltando'
            });
            return reply.status(400).send({ success: false, error: "Faltando parametros obrigatorios: nome_lead, telefone_lead, telefone_sdr", call_id: finalCallId });
        }

        const cleanSdrPhone = sanitizePhone(telefone_sdr);
        const cleanLeadPhone = sanitizePhone(telefone_lead);

        const accountSid = TWILIO_ACCOUNT_SID || process.env.TWILIO_ACCOUNT_SID;
        const authToken = TWILIO_AUTH_TOKEN || process.env.TWILIO_AUTH_TOKEN;
        const fromNumber = TWILIO_FROM_NUMBER || process.env.TWILIO_FROM_NUMBER;

        if (!accountSid || !authToken || !fromNumber) {
            // Enviar webhook de fallback para credenciais ausentes
            await sendSpeedDialFallbackWebhook({
                token: token || 'sem_token',
                n8n_url: n8n_url,
                lead_id: lead_id || 'sem_lead_id',
                call_id: finalCallId,
                nome_lead: nome_lead || '',
                telefone_lead: telefone_lead || '',
                telefone_sdr: telefone_sdr || '',
                status: 'failed',
                error_reason: 'credenciais_twilio_ausentes'
            });
            return reply.status(500).send({ 
                success: false, 
                error: "Credenciais Twilio ausentes.",
                call_id: finalCallId
            });
        }

        const protocol = request.protocol || 'https';
        const host = request.headers.host;
        const baseUrl = `${protocol}://${host}`;
        
        // Se não tiver data_agendamento, lead pediu para falar com especialista
        const agendou = !!data_agendamento;
        const horario = data_agendamento || "";
        
        // Apply fallback if n8n_url is missing or empty
        const finalN8nUrl = n8n_url || DEFAULT_N8N_WEBHOOK;

        const userToken = token || 'sem_token';
        const userLeadId = lead_id || 'sem_lead_id';
        const callbackUrl = `${baseUrl}/connect-lead?lead_name=${encodeURIComponent(nome_lead)}&lead_phone=${encodeURIComponent(cleanLeadPhone)}&horario=${encodeURIComponent(horario)}&agendou=${agendou}&n8n_url=${encodeURIComponent(finalN8nUrl)}${OPENAI_KEY ? `&openai_key=${encodeURIComponent(OPENAI_KEY)}` : ''}&user_token=${encodeURIComponent(userToken)}&lead_id=${encodeURIComponent(userLeadId)}&call_id=${encodeURIComponent(finalCallId)}`;

        const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
        
        // Build StatusCallback URL to capture failed calls (busy, no-answer, canceled, failed)
        const statusCallbackUrl = `${baseUrl}/call-status?token=${encodeURIComponent(userToken)}&lead_id=${encodeURIComponent(userLeadId)}&call_id=${encodeURIComponent(finalCallId)}&nome_lead=${encodeURIComponent(nome_lead || '')}&telefone_lead=${encodeURIComponent(cleanLeadPhone)}&telefone_sdr=${encodeURIComponent(cleanSdrPhone)}&n8n_url=${encodeURIComponent(finalN8nUrl)}`;
        
        const formData = new URLSearchParams();
        formData.append('To', cleanSdrPhone);
        formData.append('From', fromNumber);
        formData.append('Url', callbackUrl); 
        formData.append('MachineDetection', 'Enable');
        formData.append('StatusCallback', statusCallbackUrl);
        formData.append('StatusCallbackEvent', 'completed');

        log(`[WEBHOOK] Discando para SDR ${cleanSdrPhone} sobre Lead ${nome_lead}...`, "INFO");
        log(`[WEBHOOK] StatusCallback URL: ${statusCallbackUrl}`, "DEBUG");

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
            // Enviar webhook de fallback para erro da API Twilio
            await sendSpeedDialFallbackWebhook({
                token: userToken,
                n8n_url: finalN8nUrl,
                lead_id: userLeadId,
                call_id: finalCallId,
                nome_lead: nome_lead,
                telefone_lead: cleanLeadPhone,
                telefone_sdr: cleanSdrPhone,
                status: 'failed',
                error_reason: `twilio_api_error: ${err.message}`
            });
            return reply.send({ success: false, error: err.message, call_id: finalCallId });
        }
        
        const result = await response.json();
        return reply.send({ success: true, sid: result.sid, message: "Conexão SDR Iniciada com Sucesso", call_id: finalCallId });

    } catch (e) {
        log(`[WEBHOOK] Error: ${e.message}`, "ERROR");
        const errorCallId = request.body?.call_id || `${Date.now()}-${Math.random().toString(36).substring(2, 18)}`;
        // Enviar webhook de fallback para exceção
        await sendSpeedDialFallbackWebhook({
            token: request.body?.token || 'sem_token',
            n8n_url: request.body?.n8n_url,
            lead_id: request.body?.lead_id || 'sem_lead_id',
            call_id: errorCallId,
            nome_lead: request.body?.nome_lead || '',
            telefone_lead: request.body?.telefone_lead || '',
            telefone_sdr: request.body?.telefone_sdr || '',
            status: 'failed',
            error_reason: `exception: ${e.message}`
        });
        return reply.status(500).send({ success: false, error: e.message, call_id: errorCallId });
    }
});

// 2. Connect Lead - Step 1: Capture SDR voice and verify human
fastify.all('/connect-lead', async (request, reply) => {
    log(`[CONNECT-LEAD] Step 1: Capturing SDR voice for verification...`, "DEBUG");
    const queryParams = request.query || {};
    const bodyParams = request.body || {};
    const host = request.headers.host;
    const protocol = request.headers['x-forwarded-proto'] || 'https';
    
    const raw_lead_name = getSingleParam(queryParams.lead_name);
    const raw_lead_phone = getSingleParam(queryParams.lead_phone);
    const raw_horario = getSingleParam(queryParams.horario);
    const raw_n8n_url = getSingleParam(queryParams.n8n_url);
    const raw_openai_key = getSingleParam(queryParams.openai_key);
    const raw_user_token = getSingleParam(queryParams.user_token);
    const raw_lead_id = getSingleParam(queryParams.lead_id);
    const raw_call_id = getSingleParam(queryParams.call_id);
    const agendou = getSingleParam(queryParams.agendou) !== 'false';
    
    const lead_name = escapeXml(raw_lead_name || 'Cliente');
    const lead_phone = sanitizePhone(raw_lead_phone);
    const horario = escapeXml(raw_horario || '');
    const n8n_url = raw_n8n_url || DEFAULT_N8N_WEBHOOK;
    const fromNumber = bodyParams.From || '';

    const { AnsweredBy } = bodyParams;

    // Machine Detection from Twilio
    if (AnsweredBy && (AnsweredBy.startsWith('machine') || AnsweredBy === 'fax')) {
        log(`[CONNECT-LEAD] ❌ Machine detected by Twilio: ${AnsweredBy}`, "DETECTION");
        // Enviar webhook de fallback para machine detection
        await sendSpeedDialFallbackWebhook({
            token: raw_user_token || 'sem_token',
            n8n_url: n8n_url,
            lead_id: raw_lead_id || 'sem_lead_id',
            call_id: raw_call_id || '',
            nome_lead: raw_lead_name || '',
            telefone_lead: raw_lead_phone || '',
            telefone_sdr: fromNumber || '',
            status: 'failed',
            error_reason: `machine_detection: ${AnsweredBy}`,
            sdr_answered: false,
            sdr_detection_reason: `twilio_machine_detection: ${AnsweredBy}`
        });
        const twiml = `<Response><Hangup/></Response>`;
        return reply.type('text/xml').send(twiml);
    }
    
    // Build callback URL for verification step
    const verifyUrl = `${protocol}://${host}/verify-sdr?lead_name=${encodeURIComponent(raw_lead_name || '')}&lead_phone=${encodeURIComponent(raw_lead_phone || '')}&horario=${encodeURIComponent(raw_horario || '')}&agendou=${agendou}&n8n_url=${encodeURIComponent(n8n_url)}&openai_key=${encodeURIComponent(raw_openai_key || '')}&user_token=${encodeURIComponent(raw_user_token || 'sem_token')}&lead_id=${encodeURIComponent(raw_lead_id || 'sem_lead_id')}&from_number=${encodeURIComponent(fromNumber)}&call_id=${encodeURIComponent(raw_call_id || '')}`;

    const wssUrl = `wss://${host}/media-stream`;
    const voice = getSingleParam(queryParams.voice) || DEFAULT_VOICE;
    const provider = getSingleParam(queryParams.provider) || 'openai';
    const xiKey = getSingleParam(queryParams.xi_api_key) || '';
    const openaiKey = raw_openai_key ? raw_openai_key.trim().replace(/^\+/, '').replace(/\+/g, '') : '';

    // Start recording from the BEGINNING - captures everything including SDR's first words
    const twiml = `
    <Response>
        <Start>
            <Stream url="${wssUrl}" track="both_tracks">
                <Parameter name="n8n_url" value="${escapeXml(n8n_url)}" />
                <Parameter name="mode" value="bridge" />
                <Parameter name="voice" value="${escapeXml(voice)}" />
                <Parameter name="provider" value="${escapeXml(provider)}" />
                <Parameter name="xi_api_key" value="${escapeXml(xiKey)}" />
                <Parameter name="openai_key" value="${escapeXml(openaiKey)}" />
                <Parameter name="source" value="bridge" />
                <Parameter name="user_token" value="${escapeXml(raw_user_token || 'sem_token')}" />
                <Parameter name="lead_id" value="${escapeXml(raw_lead_id || 'sem_lead_id')}" />
                <Parameter name="call_id" value="${escapeXml(raw_call_id || '')}" />
            </Stream>
        </Start>
        <Say voice="Polly.Camila-Neural" language="pt-BR">
            Novo lead: ${lead_name}. ${agendou ? `Agendado para ${horario}.` : 'Pediu para falar com especialista.'}
        </Say>
        <Gather input="speech" timeout="3" speechTimeout="2" language="pt-BR" action="${escapeXml(verifyUrl)}" method="POST">
            <Say voice="Polly.Camila-Neural" language="pt-BR">
                Diga algo para confirmar.
            </Say>
        </Gather>
        <Redirect>${escapeXml(verifyUrl)}&amp;speech_result=timeout</Redirect>
    </Response>
    `;
    reply.type('text/xml').send(twiml);
});

// 2b. Verify SDR Response - Analyze if human or voicemail
fastify.all('/verify-sdr', async (request, reply) => {
    log(`[VERIFY-SDR] ========== INÍCIO DA VERIFICAÇÃO SDR ==========`, "DETECTION");
    
    const queryParams = request.query || {};
    const bodyParams = request.body || {};
    const host = request.headers.host;
    const protocol = request.headers['x-forwarded-proto'] || 'https';
    
    // DEBUG: Log all received parameters
    log(`[VERIFY-SDR] Query Params: ${JSON.stringify(queryParams)}`, "DEBUG");
    log(`[VERIFY-SDR] Body Params Keys: ${Object.keys(bodyParams).join(', ')}`, "DEBUG");
    log(`[VERIFY-SDR] Body Params Full: ${JSON.stringify(bodyParams)}`, "DEBUG");
    
    const raw_lead_name = getSingleParam(queryParams.lead_name);
    const raw_lead_phone = getSingleParam(queryParams.lead_phone);
    const raw_horario = getSingleParam(queryParams.horario);
    const raw_n8n_url = getSingleParam(queryParams.n8n_url);
    const raw_openai_key = getSingleParam(queryParams.openai_key);
    const raw_user_token = getSingleParam(queryParams.user_token) || 'sem_token';
    const raw_lead_id = getSingleParam(queryParams.lead_id) || 'sem_lead_id';
    const raw_call_id = getSingleParam(queryParams.call_id) || '';
    const agendou = getSingleParam(queryParams.agendou) !== 'false';
    const fromNumber = getSingleParam(queryParams.from_number) || '';
    
    const voice = getSingleParam(queryParams.voice) || DEFAULT_VOICE;
    const provider = getSingleParam(queryParams.provider) || 'openai';
    const xiKey = getSingleParam(queryParams.xi_api_key) || '';
    // Clean the OpenAI key - remove URL encoding artifacts (+ becomes space, leading +, etc)
    const openaiKey = raw_openai_key ? raw_openai_key.trim().replace(/^\+/, '').replace(/\+/g, '') : '';
    
    const lead_name = escapeXml(raw_lead_name || 'Cliente');
    const lead_phone = sanitizePhone(raw_lead_phone);
    const n8n_url = raw_n8n_url || DEFAULT_N8N_WEBHOOK;
    
    // Get speech result from Twilio Gather - CHECK MULTIPLE POSSIBLE SOURCES
    const speechResultFromBody = bodyParams.SpeechResult || '';
    const speechResultFromQuery = getSingleParam(queryParams.speech_result) || '';
    const speechResult = speechResultFromBody || speechResultFromQuery;
    const confidence = parseFloat(bodyParams.Confidence || '0');
    
    // DETAILED LOGGING for debugging
    log(`[VERIFY-SDR] 🎤 SpeechResult from Body: "${speechResultFromBody}"`, "DETECTION");
    log(`[VERIFY-SDR] 🎤 SpeechResult from Query: "${speechResultFromQuery}"`, "DETECTION");
    log(`[VERIFY-SDR] 🎤 Final SpeechResult: "${speechResult}" (confidence: ${confidence})`, "DETECTION");
    log(`[VERIFY-SDR] 🔑 Using OpenAI Key: ${openaiKey ? `${openaiKey.substring(0, 10)}...` : 'DEFAULT'}`, "DEBUG");
    log(`[VERIFY-SDR] 📞 Lead: ${lead_name}, Phone: ${lead_phone}`, "DEBUG");
    
    let sdrAnswered = false;
    let detectionReason = 'no_speech';
    let detectionConfidence = 0;
    
    // Analyze the speech if we got any
    if (speechResult && speechResult !== 'timeout' && speechResult.trim().length > 0) {
        log(`[VERIFY-SDR] ✅ Temos speech result válido, analisando...`, "DETECTION");
        try {
            const analysis = await analyzeSDRAnswer(speechResult, openaiKey || null);
            sdrAnswered = analysis.isHuman;
            detectionReason = analysis.reason;
            detectionConfidence = analysis.confidence;
            log(`[VERIFY-SDR] 📊 Análise completa: isHuman=${sdrAnswered}, reason="${detectionReason}", confidence=${detectionConfidence}`, "DETECTION");
        } catch (analysisError) {
            log(`[VERIFY-SDR] ❌ ERRO na análise: ${analysisError.message}`, "ERROR");
            // FALLBACK: If analysis fails but we have speech, use quick confirmation check
            if (isQuickConfirmation(speechResult)) {
                log(`[VERIFY-SDR] 🔄 Fallback: Quick confirmation detected após erro`, "DETECTION");
                sdrAnswered = true;
                detectionReason = 'fallback_quick_confirmation_after_error';
                detectionConfidence = 0.9;
            } else {
                detectionReason = `analysis_error: ${analysisError.message}`;
            }
        }
    } else if (speechResult === 'timeout') {
        log(`[VERIFY-SDR] ⚠️ TIMEOUT: Nenhuma fala detectada pelo Twilio Gather`, "DETECTION");
        detectionReason = 'timeout_no_speech';
    } else {
        log(`[VERIFY-SDR] ⚠️ SpeechResult vazio ou inválido: "${speechResult}"`, "DETECTION");
        detectionReason = 'empty_speech_result';
    }
    
    log(`[VERIFY-SDR] 🏁 DECISÃO FINAL: sdrAnswered=${sdrAnswered}, reason="${detectionReason}"`, "DETECTION");
    
    // Store detection result in global Map keyed by CallSid
    // This allows the WebSocket handler to retrieve the result later
    const callSid = bodyParams.CallSid || '';
    if (callSid) {
        sdrDetectionResults.set(callSid, {
            sdrAnswered,
            detectionReason,
            detectionConfidence,
            sdrFirstWords: speechResult || '',
            timestamp: Date.now()
        });
        log(`[VERIFY-SDR] Stored detection result for CallSid: ${callSid} (sdrAnswered=${sdrAnswered})`, "DEBUG");
        
        // Clean up old entries (older than 5 minutes) to prevent memory leak
        const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
        for (const [key, value] of sdrDetectionResults.entries()) {
            if (value.timestamp < fiveMinutesAgo) {
                sdrDetectionResults.delete(key);
            }
        }
    }
    
    const wssUrl = `wss://${host}/media-stream`;
    
    // Recording already started in /connect-lead - no need to start again
    // Just decide: connect to Lead or hang up
    
    log(`[VERIFY-SDR] ========== GERANDO TwiML ==========`, "DETECTION");
    
    if (sdrAnswered) {
        log(`[VERIFY-SDR] ✅ SDR confirmed as HUMAN. Connecting to Lead ${lead_phone}...`, "DETECTION");
        log(`[VERIFY-SDR] 📤 TwiML: DIAL para ${lead_phone} com callerId=${fromNumber}`, "DETECTION");
        
        // SDR is human - proceed to dial the Lead
        const twiml = `
        <Response>
            <Say voice="Polly.Camila-Neural" language="pt-BR">
                Conectando com o lead agora.
            </Say>
            <Dial callerId="${escapeXml(fromNumber)}" timeout="30">
                ${lead_phone}
            </Dial>
        </Response>
        `;
        log(`[VERIFY-SDR] ========== FIM - CONECTANDO LEAD ==========`, "DETECTION");
        reply.type('text/xml').send(twiml);
    } else {
        log(`[VERIFY-SDR] ❌ SDR NOT confirmed. Reason: ${detectionReason}`, "DETECTION");
        log(`[VERIFY-SDR] 📤 TwiML: HANGUP (Não foi possível confirmar)`, "DETECTION");
        
        // Enviar webhook de fallback para SDR não confirmado
        await sendSpeedDialFallbackWebhook({
            token: raw_user_token,
            n8n_url: n8n_url,
            lead_id: raw_lead_id,
            call_id: raw_call_id,
            nome_lead: raw_lead_name || '',
            telefone_lead: raw_lead_phone || '',
            telefone_sdr: fromNumber || '',
            status: 'failed',
            error_reason: `sdr_not_confirmed: ${detectionReason}`,
            sdr_answered: false,
            sdr_detection_reason: detectionReason
        });
        
        // Recording is already running from /connect-lead, so full audio will be captured
        const twiml = `
        <Response>
            <Say voice="Polly.Camila-Neural" language="pt-BR">
                Não foi possível confirmar o atendimento. A ligação será encerrada.
            </Say>
            <Pause length="2"/>
            <Hangup/>
        </Response>
        `;
        log(`[VERIFY-SDR] ========== FIM - DESLIGANDO ==========`, "DETECTION");
        reply.type('text/xml').send(twiml);
    }
});

// 2c. Call Status Callback - Captures calls that fail before being answered (busy, no-answer, canceled, failed)
// CRITICAL: This ensures fallback webhook is sent even when SDR doesn't answer
fastify.all('/call-status', async (request, reply) => {
    const bodyParams = request.body || {};
    const queryParams = request.query || {};
    
    // Twilio may send via GET (query) or POST (body) - check both
    const callStatus = getSingleParam(queryParams.CallStatus) || bodyParams.CallStatus || '';
    const callSid = getSingleParam(queryParams.CallSid) || bodyParams.CallSid || '';
    const sipResponseCode = getSingleParam(queryParams.SipResponseCode) || bodyParams.SipResponseCode || '';
    
    // Extract our custom parameters from query string
    const token = getSingleParam(queryParams.token) || 'sem_token';
    const leadId = getSingleParam(queryParams.lead_id) || 'sem_lead_id';
    const callId = getSingleParam(queryParams.call_id) || '';
    const nomeLead = getSingleParam(queryParams.nome_lead) || '';
    const telefoneLead = getSingleParam(queryParams.telefone_lead) || '';
    const telefoneSdr = getSingleParam(queryParams.telefone_sdr) || '';
    const n8nUrl = getSingleParam(queryParams.n8n_url) || DEFAULT_N8N_WEBHOOK;
    
    log(`[CALL-STATUS] 📞 CallSid=${callSid}, Status=${callStatus}, SipCode=${sipResponseCode}, call_id=${callId}`, "DEBUG");
    
    // Only send fallback for terminal failure states where call was never answered
    const failureStatuses = ['busy', 'no-answer', 'canceled', 'failed'];
    
    if (failureStatuses.includes(callStatus)) {
        log(`[CALL-STATUS] ❌ Chamada falhou antes de ser atendida: ${callStatus}${sipResponseCode ? ` (SIP ${sipResponseCode})` : ''}`, "WEBHOOK");
        
        await sendSpeedDialFallbackWebhook({
            token: token,
            n8n_url: n8nUrl,
            lead_id: leadId,
            call_id: callId,
            nome_lead: nomeLead,
            telefone_lead: telefoneLead,
            telefone_sdr: telefoneSdr,
            status: 'failed',
            error_reason: `call_status_${callStatus}`,
            sdr_answered: false,
            lead_answered: false,
            sdr_detection_reason: `twilio_call_status: ${callStatus}${sipResponseCode ? ` (SIP ${sipResponseCode})` : ''}`,
            sip_response_code: sipResponseCode,
            call_sid: callSid
        });
    } else {
        log(`[CALL-STATUS] ℹ️ Status ${callStatus} não requer fallback (chamada em progresso ou completada)`, "DEBUG");
    }
    
    // Twilio expects empty 200 response
    return reply.status(200).send('');
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
        let customOpenaiKey = ''; // Custom OpenAI key for transcription (optional)
        let userToken = 'sem_token'; // Token for fallback webhook
        let leadId = 'sem_lead_id'; // Lead ID for fallback webhook
        let callId = ''; // Call ID for fallback webhook tracking
        
        // SDR Detection fields (populated from /verify-sdr via global Map lookup)
        let sdrAnswered = false; // Default false, will be set from stored detection result
        let sdrDetectionReason = '';
        let sdrDetectionConfidence = 0;
        let sdrFirstWords = '';
        
        const transcripts = [];
        let savedAudioChunks = []; // Storing raw u-law buffers (for agent mode)
        // Bridge mode: Store chunks with timestamps for proper synchronization
        let inboundAudioChunks = []; // [{timestamp, buffer}] - Track: inbound (Lead)
        let outboundAudioChunks = []; // [{timestamp, buffer}] - Track: outbound (SDR)
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

                openAiWs.on('error', (err) => {
                    // Prevent Node from crashing due to unhandled WebSocket errors (ex: 401)
                    const msg = err && err.message ? err.message : String(err);
                    log(`❌ OpenAI WebSocket Error: ${msg}`, "ERROR");
                    isOpenAiConnected = false;
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
                    if (params.openai_key) {
                        // Clean the key - remove URL encoding artifacts like leading + or spaces
                        customOpenaiKey = params.openai_key.trim().replace(/^\+/, '');
                    }
                    
                    // Set User Token for webhook
                    if (params.user_token) userToken = params.user_token;
                    
                    // Set Lead ID for webhook
                    if (params.lead_id) leadId = params.lead_id;
                    
                    // Set Call ID for webhook tracking
                    if (params.call_id) callId = params.call_id;
                    
                    // Set Source
                    if (params.source) callSource = params.source;
                    
                    // SDR Detection: Look up stored result from /verify-sdr using callSid
                    const callSid = data.start.callSid || '';
                    if (callSid && callMode === 'bridge') {
                        const storedDetection = sdrDetectionResults.get(callSid);
                        if (storedDetection) {
                            sdrAnswered = storedDetection.sdrAnswered;
                            sdrDetectionReason = storedDetection.detectionReason || '';
                            sdrDetectionConfidence = storedDetection.detectionConfidence || 0;
                            sdrFirstWords = storedDetection.sdrFirstWords || '';
                            log(`📋 Retrieved SDR detection for CallSid ${callSid}: sdrAnswered=${sdrAnswered}`, "DEBUG");
                            // Clean up after retrieval
                            sdrDetectionResults.delete(callSid);
                        } else {
                            log(`⚠️ No stored SDR detection found for CallSid ${callSid}, using default (false)`, "DEBUG");
                            sdrAnswered = false;
                            sdrDetectionReason = 'no_detection_stored';
                        }
                    }
                    
                    // Log if custom OpenAI key is provided
                    if (customOpenaiKey) {
                        log(`🔑 Custom OpenAI Key provided for transcription (len=${customOpenaiKey.length})`, "DEBUG");
                    }

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
                        const track = data.media.track; // 'inbound' or 'outbound' (only in both_tracks mode)
                        const timestamp = parseInt(data.media.timestamp) || 0; // Twilio timestamp in ms
                        
                        // BRIDGE MODE: Separate tracks with timestamps for sync
                        if (callMode === 'bridge' && track) {
                            if (track === 'inbound') {
                                inboundAudioChunks.push({ timestamp, buffer: chunkBuffer });
                            } else if (track === 'outbound') {
                                outboundAudioChunks.push({ timestamp, buffer: chunkBuffer });
                            }
                        } else {
                            // AGENT MODE: Single track
                            savedAudioChunks.push(chunkBuffer);
                        }

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
                        let sdrTranscript = null;
                        let leadTranscript = null;

                        // BRIDGE MODE: Process separated tracks into stereo WAV with timestamp sync
                        if (callMode === 'bridge' && (inboundAudioChunks.length > 0 || outboundAudioChunks.length > 0)) {
                            let inboundPcm = null;
                            let outboundPcm = null;
                            
                            try {
                                log(`💾 Processing BRIDGE audio: ${inboundAudioChunks.length} inbound chunks, ${outboundAudioChunks.length} outbound chunks`, "AUDIO");
                                
                                // Synchronize tracks using timestamps (handles delay between SDR and Lead connection)
                                const syncResult = processTimestampedChunks(inboundAudioChunks, outboundAudioChunks, 8000);
                                inboundPcm = syncResult.inboundPcm;
                                outboundPcm = syncResult.outboundPcm;
                                
                                log(`🎧 Synchronized: Inbound=${inboundPcm.length} samples, Outbound=${outboundPcm.length} samples`, "AUDIO");
                                
                                // Create stereo WAV (Left=Lead, Right=SDR)
                                const finalWavBuffer = createStereoWav(inboundPcm, outboundPcm, 8000);
                                
                                const fileName = `call_${callMode}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.wav`;
                                const { data: uploadData, error: uploadError } = await supabase
                                    .storage
                                    .from('audios') 
                                    .upload(fileName, finalWavBuffer, { contentType: 'audio/wav', upsert: false });

                                if (!uploadError) {
                                    const { data: publicUrlData } = supabase.storage.from('audios').getPublicUrl(fileName);
                                    recordingUrl = publicUrlData.publicUrl;
                                    log(`✅ Stereo WAV uploaded: ${recordingUrl}`, "AUDIO");
                                } else {
                                    log(`❌ Upload Error: ${uploadError.message}`, "ERROR");
                                }
                            } catch (audioErr) {
                                log(`❌ Bridge Audio Processing Error: ${audioErr.message}`, "ERROR");
                            }
                            
                            // TRANSCRIPTION: Use custom key if provided, separate SDR/LEAD channels
                            // This is wrapped in its own try-catch to ensure webhook is sent even if transcription fails
                            try {
                                const transcriptionKey = customOpenaiKey || null;
                                if (transcriptionKey) {
                                    log(`🔑 Using custom OpenAI key for transcription`, "WHISPER");
                                }
                                
                                if (inboundPcm && outboundPcm) {
                                    const bridgeTranscription = await transcribeBridgeCall(inboundPcm, outboundPcm, transcriptionKey);
                                    sdrTranscript = bridgeTranscription.sdr || null;
                                    leadTranscript = bridgeTranscription.lead || null;
                                    finalTranscription = bridgeTranscription.combined || null;
                                }
                            } catch (transcriptionErr) {
                                log(`❌ Transcription Error (webhook will still be sent): ${transcriptionErr.message}`, "ERROR");
                            }
                        }
                        // AGENT MODE: Single track mono WAV
                        else if (savedAudioChunks.length > 0) {
                            try {
                                log(`💾 Processing ${savedAudioChunks.length} chunks...`, "AUDIO");
                                const uLawBuffer = Buffer.concat(savedAudioChunks);
                                const pcmBuffer = decodeMuLawBuffer(uLawBuffer);
                                const wavHeader = createWavHeader(pcmBuffer.byteLength, 8000, 1);
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
                            } catch (audioErr) {
                                log(`❌ Audio Processing Error: ${audioErr.message}`, "ERROR");
                            }
                        }

                        // ALWAYS send webhook when call ends, even without transcript/recording
                        let mainTranscript = "";
                        if (finalTranscription) {
                            mainTranscript = finalTranscription;
                        } else if (transcripts.length > 0) {
                            mainTranscript = transcripts.map(t => `${t.role.toUpperCase()}: ${t.message}`).join('\n');
                        } else {
                            mainTranscript = "[Sem transcrição disponível]";
                        }

                        log(`🚀 Sending Webhook to: ${(userToken === 'konclui') ? 'Konclui Fallback' : n8nUrl}`, "WEBHOOK");
                        log(`📊 Webhook Data: mode=${callMode}, source=${callSource}, hasRecording=${!!recordingUrl}, transcriptLen=${mainTranscript.length}`, "DEBUG");
                        
                        // Build webhook payload
                        const webhookPayload = {
                            assistantName: callMode === 'bridge' ? "Speed Dial Bridge" : "Twilio AI Agent",
                            transcript: mainTranscript, 
                            realtime_messages: transcripts, 
                            recordingUrl: recordingUrl || "", 
                            timestamp: new Date().toISOString(),
                            status: 'success',
                            mode: callMode,
                            source: callSource || 'unknown'
                        };
                        
                        // Add separated transcripts and token for bridge mode
                        if (callMode === 'bridge') {
                            webhookPayload.sdr_transcript = sdrTranscript || "";
                            webhookPayload.lead_transcript = leadTranscript || "";
                            webhookPayload.token = userToken;
                            webhookPayload.lead_id = leadId;
                            webhookPayload.call_id = callId || "";
                            
                            const transcriptionKey = customOpenaiKey || null;
                            
                            // SDR Detection: Use stored value from /verify-sdr Map
                            // FALLBACK: If no_detection_stored but we have sdr_transcript, analyze it now
                            if (sdrDetectionReason === 'no_detection_stored' && sdrTranscript && sdrTranscript.trim().length > 0) {
                                log(`🔄 SDR Fallback: No stored detection, analyzing sdr_transcript: "${sdrTranscript.substring(0, 50)}..."`, "DETECTION");
                                const sdrAnalysis = await analyzeSDRAnswer(sdrTranscript, transcriptionKey);
                                sdrAnswered = sdrAnalysis.isHuman;
                                sdrDetectionReason = sdrAnalysis.reason + '_fallback';
                                sdrDetectionConfidence = sdrAnalysis.confidence;
                                sdrFirstWords = sdrTranscript.substring(0, 100);
                            }
                            
                            webhookPayload.sdr_answered = sdrAnswered;
                            webhookPayload.sdr_detection_reason = sdrDetectionReason || "";
                            webhookPayload.sdr_detection_confidence = sdrDetectionConfidence;
                            webhookPayload.sdr_first_words = sdrFirstWords || "";
                            
                            // Lead Detection: Use AI analysis for robust detection
                            const leadAnalysis = await analyzeLeadAnswer(leadTranscript, transcriptionKey);
                            webhookPayload.lead_answered = leadAnalysis.isHuman;
                            webhookPayload.lead_detection_reason = leadAnalysis.reason || "";
                            webhookPayload.lead_detection_confidence = leadAnalysis.confidence || 0;
                        }
                        
                        // Determine final webhook URL based on token
                        // If token is "konclui", use the specific Konclui fallback endpoint
                        const finalWebhookUrl = (userToken === 'konclui') 
                            ? KONCLUI_FALLBACK_WEBHOOK
                            : n8nUrl;
                        
                        if (userToken === 'konclui') {
                            log(`🔀 Token "konclui" detected - using Konclui fallback webhook`, "WEBHOOK");
                        }
                        
                        fetch(finalWebhookUrl, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(webhookPayload)
                        }).then(async res => {
                            if (res.ok) {
                                log(`✅ Webhook Delivered Successfully`, "WEBHOOK");
                            } else {
                                const errBody = await res.text().catch(() => 'No body');
                                log(`❌ Webhook HTTP Error: ${res.status} - ${errBody}`, "WEBHOOK");
                            }
                        }).catch(err => log(`❌ Webhook Network Failed: ${err.message}`, "WEBHOOK"));
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
