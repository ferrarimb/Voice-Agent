

export enum VoiceName {
  Puck = 'Puck',
  Charon = 'Charon',
  Kore = 'Kore',
  Fenrir = 'Fenrir',
  Zephyr = 'Zephyr',
}

export type VoiceProvider = 'openai' | 'elevenlabs';

export interface AssistantConfig {
  name: string;
  systemInstruction: string;
  voiceProvider: VoiceProvider;
  voice: string;
  elevenLabsApiKey?: string;
  firstMessage: string;
  transcriberModel: string;
  model: string;
}

export interface LogEntry {
  id: string;
  timestamp: Date;
  role: 'user' | 'assistant' | 'system';
  message: string;
}

export interface CallLogEntry {
  id: string;
  timestamp: string; // ISO string for serialization
  type: 'pstn' | 'web'; // Distinguish between Twilio and Browser
  source?: 'direct_call' | 'bridge' | 'live_demo'; // Source of the call
  to?: string;
  from?: string;
  status: 'success' | 'failed';
  assistantName: string;
  errorMessage?: string;
  transcript?: LogEntry[]; // The chat history
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface TwilioConfig {
  accountSid: string;
  authToken: string;
  fromNumber: string;
  webhookUrl?: string; // URL for the backend server handling the media stream
}

export interface AppSettings {
  n8nWebhookUrl?: string;
  openaiApiKey?: string;
}

export type View = 'assistants' | 'phone' | 'logs' | 'settings' | 'speed-dial';