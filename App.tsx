
import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import AssistantConfigPanel from './components/AssistantConfig';
import ActiveCallModal from './components/ActiveCallModal';
import PhoneInterface from './components/PhoneInterface';
import SpeedDialInterface from './components/SpeedDialInterface';
import LogsView from './components/LogsView';
import SettingsView from './components/SettingsView';
import { AssistantConfig, VoiceName, View, CallLogEntry, LogEntry, AppSettings, TwilioConfig } from './types';

const DEFAULT_SYSTEM_INSTRUCTION = `You are a helpful, witty, and concise AI voice assistant. 
Your task is to help the user with quick queries, simulate a phone support agent, or just chat.
Keep responses relatively short to maintain a conversational flow.`;

const DEFAULT_N8N_WEBHOOK = 'https://webhook-editor.abianca.com.br/webhook/retorno-new-vapi-ae75-6dfccb8f37d4';
const DEFAULT_OPENAI_KEY = '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';

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<View>('assistants');
  const [isCallActive, setIsCallActive] = useState(false);
  
  // Load logs from local storage
  const [callLogs, setCallLogs] = useState<CallLogEntry[]>(() => {
    const savedLogs = localStorage.getItem('call_logs');
    return savedLogs ? JSON.parse(savedLogs) : [];
  });

  // Global App Settings
  const [appSettings, setAppSettings] = useState<AppSettings>(() => {
    const saved = localStorage.getItem('app_settings');
    return saved ? JSON.parse(saved) : { 
      n8nWebhookUrl: DEFAULT_N8N_WEBHOOK,
      openaiApiKey: DEFAULT_OPENAI_KEY
    };
  });

  // Twilio Settings
  const [twilioConfig, setTwilioConfig] = useState<TwilioConfig>(() => {
    const savedConfig = localStorage.getItem('twilio_config');
    if (savedConfig) {
      return JSON.parse(savedConfig);
    }
    // Default credentials for testing
    return {
      accountSid: 'AC3883d04e400fe1328cf490a389fa910a',
      authToken: '37bc166feaaa030b1fddfae5fbf188b8',
      fromNumber: '+5511993137410',
      webhookUrl: 'https://uncandied-jeanene-pyruvic.ngrok-free.dev/incoming'
    };
  });

  const [config, setConfig] = useState<AssistantConfig>({
    name: 'Customer Support Bot v1',
    systemInstruction: DEFAULT_SYSTEM_INSTRUCTION,
    voice: VoiceName.Puck,
    firstMessage: 'Hello! How can I help you today?',
    transcriberModel: 'nova-2',
    model: 'gemini-2.5-flash-native-audio-preview-09-2025'
  });

  const handleSaveSettings = (newSettings: AppSettings) => {
      setAppSettings(newSettings);
      localStorage.setItem('app_settings', JSON.stringify(newSettings));
  };

  const handleSaveTwilioConfig = (newConfig: TwilioConfig) => {
    // Smart Fix: Automatically append /incoming if missing
    let url = newConfig.webhookUrl?.trim() || '';
    if (url.length > 0) {
        if (url.endsWith('/')) {
            url = url.slice(0, -1); // Remove trailing slash
        }
        if (!url.endsWith('/incoming')) {
            url = `${url}/incoming`; // Auto-append
        }
    }
    const finalConfig = { ...newConfig, webhookUrl: url };
    setTwilioConfig(finalConfig);
    localStorage.setItem('twilio_config', JSON.stringify(finalConfig));
  };

  // Function to trigger n8n webhook
  const triggerAutomation = async (log: CallLogEntry) => {
    if (!appSettings.n8nWebhookUrl) return;

    try {
        await fetch(appSettings.n8nWebhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(log)
        });
        console.log('Sent data to n8n');
    } catch (err) {
        console.error('Failed to send to n8n', err);
    }
  };

  const handleCallLog = (log: CallLogEntry) => {
    const updatedLogs = [log, ...callLogs];
    setCallLogs(updatedLogs);
    localStorage.setItem('call_logs', JSON.stringify(updatedLogs));
    
    // Trigger automation for ALL calls (Web, Twilio, SpeedDial)
    triggerAutomation(log);
  };

  const handleWebCallEnd = (logs: LogEntry[]) => {
    setIsCallActive(false);
    
    // Don't save if empty or just system messages
    if (logs.length <= 1) return;

    const logEntry: CallLogEntry = {
        id: Date.now().toString(),
        timestamp: new Date().toISOString(),
        type: 'web',
        status: 'success',
        assistantName: config.name,
        transcript: logs
    };
    
    handleCallLog(logEntry);
  };

  return (
    <div className="flex h-screen w-screen bg-slate-950 text-slate-200 overflow-hidden">
      <Sidebar currentView={currentView} onViewChange={setCurrentView} />
      
      <main className="flex-1 flex flex-col relative">
        
        {currentView === 'assistants' && (
          <AssistantConfigPanel 
              config={config} 
              setConfig={setConfig} 
              onStartDemo={() => setIsCallActive(true)} 
          />
        )}

        {currentView === 'phone' && (
          <PhoneInterface 
            assistantConfig={config} 
            twilioConfig={twilioConfig}
            onCallLog={handleCallLog}
            n8nWebhookUrl={appSettings.n8nWebhookUrl}
          />
        )}
        
        {currentView === 'speed-dial' && (
          <SpeedDialInterface 
            twilioConfig={twilioConfig}
            onCallLog={handleCallLog}
            n8nWebhookUrl={appSettings.n8nWebhookUrl}
          />
        )}

        {currentView === 'logs' && (
          <LogsView logs={callLogs} />
        )}

        {currentView === 'settings' && (
          <SettingsView 
             settings={appSettings}
             twilioConfig={twilioConfig}
             onSave={handleSaveSettings}
             onSaveTwilioConfig={handleSaveTwilioConfig}
          />
        )}
        
        {isCallActive && (
            <ActiveCallModal 
                config={config} 
                onClose={handleWebCallEnd} 
            />
        )}
        
        {/* Disclaimer Footer */}
        {currentView !== 'settings' && (
            <div className="absolute bottom-4 right-8 text-[10px] text-slate-600 max-w-md text-right pointer-events-none hidden md:block">
                <p>Architecture Note: This demo uses <strong>Gemini Live API</strong> directly in the browser to simulate the Vapi.ai architecture (Telephony + STT + LLM + TTS) with ultra-low latency.</p>
            </div>
        )}
      </main>
    </div>
  );
};

export default App;
