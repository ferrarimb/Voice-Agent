import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { AssistantConfig } from '../types';
import { floatTo16BitPCM, base64ToBytes, pcmToAudioBuffer, arrayBufferToBase64 } from './audioUtils';

export class GeminiLiveService {
  private client: GoogleGenAI | null = null;
  private session: any = null; // LiveSession type is internal in SDK
  private inputAudioContext: AudioContext | null = null;
  private outputAudioContext: AudioContext | null = null;
  private audioStream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private nextStartTime: number = 0;
  private onLog: (role: 'user' | 'assistant' | 'system', text: string) => void;
  private onStatusChange: (status: 'connected' | 'disconnected' | 'error') => void;
  private onVolumeChange: (volume: number) => void;
  
  private isAudioContextInitialized = false;

  constructor(
    onLog: (role: 'user' | 'assistant' | 'system', text: string) => void,
    onStatusChange: (status: 'connected' | 'disconnected' | 'error') => void,
    onVolumeChange: (volume: number) => void
  ) {
    this.onLog = onLog;
    this.onStatusChange = onStatusChange;
    this.onVolumeChange = onVolumeChange;
  }

  async connect(apiKey: string, config: AssistantConfig) {
    try {
      this.client = new GoogleGenAI({ apiKey });
      
      // Initialize Audio Contexts
      this.inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      this.outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      
      // Get User Media
      this.audioStream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        } 
      });

      this.onLog('system', 'Connecting to Gemini Live API...');

      const sessionPromise = this.client.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: config.voice } },
          },
          systemInstruction: config.systemInstruction,
          inputAudioTranscription: {}, // Enable transcription for logs
        },
        callbacks: {
            onopen: () => {
                this.onStatusChange('connected');
                this.onLog('system', 'Session Connected. Start speaking.');
                this.startAudioInputStream(sessionPromise);
            },
            onmessage: (message: LiveServerMessage) => {
                this.handleMessage(message);
            },
            onclose: () => {
                this.onStatusChange('disconnected');
                this.onLog('system', 'Session Closed');
                this.stop();
            },
            onerror: (err) => {
                console.error("Gemini Live Error:", err);
                this.onStatusChange('error');
                this.onLog('system', `Error: ${err.message || 'Unknown error'}`);
            }
        }
      });

      this.session = await sessionPromise;

      // Send first message trigger if exists (by just sending empty audio or a specific text tool in a real scenario, 
      // but for now we just wait for user or sending a priming text message is tricky in pure audio mode).
      // The system instruction sets the initial context.

    } catch (error: any) {
      console.error('Connection failed:', error);
      this.onStatusChange('error');
      this.onLog('system', `Connection Failed: ${error.message}`);
    }
  }

  private startAudioInputStream(sessionPromise: Promise<any>) {
    if (!this.inputAudioContext || !this.audioStream) return;

    this.source = this.inputAudioContext.createMediaStreamSource(this.audioStream);
    this.processor = this.inputAudioContext.createScriptProcessor(4096, 1, 1);

    this.processor.onaudioprocess = (e) => {
      const inputData = e.inputBuffer.getChannelData(0);
      
      // Calculate volume for visualizer
      let sum = 0;
      for (let i = 0; i < inputData.length; i++) {
        sum += inputData[i] * inputData[i];
      }
      const rms = Math.sqrt(sum / inputData.length);
      this.onVolumeChange(rms);

      // Convert to PCM and send
      const pcmData = floatTo16BitPCM(inputData);
      const base64Data = arrayBufferToBase64(pcmData);

      sessionPromise.then((session) => {
          session.sendRealtimeInput({
              media: {
                  mimeType: 'audio/pcm;rate=16000',
                  data: base64Data
              }
          });
      });
    };

    this.source.connect(this.processor);
    this.processor.connect(this.inputAudioContext.destination);
  }

  private async handleMessage(message: LiveServerMessage) {
    // 1. Handle Audio Output
    const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
    if (base64Audio && this.outputAudioContext) {
        try {
            const audioBytes = base64ToBytes(base64Audio);
            const audioBuffer = pcmToAudioBuffer(audioBytes, this.outputAudioContext);
            
            const source = this.outputAudioContext.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(this.outputAudioContext.destination);
            
            // Simple queueing logic
            const currentTime = this.outputAudioContext.currentTime;
            if (this.nextStartTime < currentTime) {
                this.nextStartTime = currentTime;
            }
            
            source.start(this.nextStartTime);
            this.nextStartTime += audioBuffer.duration;
        } catch (e) {
            console.error("Error decoding audio", e);
        }
    }

    // 2. Handle Transcription (Logs)
    const userTranscript = message.serverContent?.inputTranscription?.text;
    if (userTranscript) {
        this.onLog('user', userTranscript);
    }

    // Note: Output transcription comes in separate messages or modelTurn parts usually if enabled
    // But for this MVP we might rely on what we hear. 
    // However, `turnComplete` often has the summary.
    if (message.serverContent?.turnComplete) {
        // Reset scheduling on turn complete to prevent drift?
        // Actually, keep it streaming.
    }
  }

  stop() {
    if (this.session) {
        // this.session.close(); // Not always available on the interface depending on version, rely on disconnect
        this.session = null;
    }
    
    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }
    if (this.processor) {
      this.processor.disconnect();
      this.processor = null;
    }
    if (this.audioStream) {
      this.audioStream.getTracks().forEach(track => track.stop());
      this.audioStream = null;
    }
    if (this.inputAudioContext) {
      this.inputAudioContext.close();
      this.inputAudioContext = null;
    }
    if (this.outputAudioContext) {
      this.outputAudioContext.close();
      this.outputAudioContext = null;
    }
    
    this.onStatusChange('disconnected');
  }
}