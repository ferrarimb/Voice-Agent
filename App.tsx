import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import AssistantConfigPanel from './components/AssistantConfig';
import ActiveCallModal from './components/ActiveCallModal';
import PhoneInterface from './components/PhoneInterface';
import SpeedDialInterface from './components/SpeedDialInterface';
import LogsView from './components/LogsView';
import SettingsView from './components/SettingsView';
import { AssistantConfig, VoiceName, View, CallLogEntry, LogEntry, AppSettings, TwilioConfig } from './types';

const DEFAULT_SYSTEM_INSTRUCTION = `Você é a Bianca, uma assistente virtual especialista em agendamentos de uma imobiliária. 
Seu objetivo principal é qualificar o cliente e agendar uma visita presencial ao imóvel de interesse.
Seja extremamente cordial, profissional e levemente persuasiva.
Mantenha suas respostas curtas (máximo de 2 frases) para garantir a fluidez da conversa por voz.
Siga este roteiro básico:
1. Identifique o interesse do cliente no imóvel.
2. Pergunte o nome do cliente se ainda não souber.
3. Pergunte qual o melhor período para a visita (manhã ou tarde).
4. Ofereça um horário específico e tente obter a confirmação ("posso confirmar?").
Se o cliente perguntar detalhes técnicos que você não sabe, diga que o corretor especialista poderá esclarecer tudo durante a visita.`;

const DEFAULT_N8N_WEBHOOK = 'https://webhook-editor.abianca.com.br/webhook/retorno-new-vapi-ae75-6dfccb8f37d4';
const DEFAULT_OPENAI_KEY = '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';

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<View>('assistants');
  const [isCallActive, setIsCallActive] = useState(false);
  
  // Speed Dial State Persistence
  const [speedDialState, setSpeedDialState] = useState(() => {
    const saved = localStorage.getItem('speed_dial_state');
    return saved ? JSON.parse(saved) : {
      lead: { name: '', phone: '', context: 'Imóvel Centro' },
      sdrPhone: '' 
    };
  });

  const handleSpeedDialChange = (newState: any) => {
    setSpeedDialState(newState);
    localStorage.setItem('speed_dial_state', JSON.stringify(newState));
  };
  
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

  // Twilio Settings - Pre-filled defaults as requested
  const [twilioConfig, setTwilioConfig] = useState<TwilioConfig>(() => {
    const savedConfig = localStorage.getItem('twilio_config');
    if (savedConfig) {
      return JSON.parse(savedConfig);
    }
    // Specific Default credentials requested by user
    return {
      accountSid: 'AC3883d04e400fe1328cf490a389fa910a',
      authToken: '37bc166feaaa030b1fddfae5fbf188b8',
      fromNumber: '+5511993137410',
      webhookUrl: 'https://uncandied-jeanene-pyruvic.ngrok-free.dev'
    };
  });

  const [config, setConfig] = useState<AssistantConfig>({
    name: 'Agente de Agendamento',
    systemInstruction: DEFAULT_SYSTEM_INSTRUCTION,
    voiceProvider: 'elevenlabs',
    voice: '33B4UnXyTNbgLmdEDh5P',
    elevenLabsApiKey: 'sk_39578024a45d109ca7904d876342b2db4cece03ff833077c',
    firstMessage: 'Olá! Aqui é a Bianca da Imobiliária. Vi que você se interessou pelo imóvel no centro. Como posso ajudar?',
    transcriberModel: 'nova-2',
    model: 'gpt-4o-realtime-preview'
  });

  const handleSaveSettings = (newSettings: AppSettings) => {
      setAppSettings(newSettings);
      localStorage.setItem('app_settings', JSON.stringify(newSettings));
  };

  const handleSaveTwilioConfig = (newConfig: TwilioConfig) => {
    let url = newConfig.webhookUrl?.trim() || '';
    if (url.length > 0) {
        if (url.endsWith('/')) {
            url = url.slice(0, -1); 
        }
    }
    const finalConfig = { ...newConfig, webhookUrl: url };
    setTwilioConfig(finalConfig);
    localStorage.setItem('twilio_config', JSON.stringify(finalConfig));
  };

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
    triggerAutomation(log);
  };

  const handleWebCallEnd = (logs: LogEntry[]) => {
    setIsCallActive(false);
    if (logs.length <= 1) return;

    const logEntry: CallLogEntry = {
        id: Date.now().toString(),
        timestamp: new Date().toISOString(),
        type: 'web',
        source: 'live_demo',
        status: 'success',
        assistantName: config.name,
        transcript: logs
    };
    
    handleCallLog(logEntry);
  };

  return (
    <div className="flex h-screen w-screen text-slate-200 overflow-hidden relative selection:bg-indigo-500/30">
      
      {/* Sidebar Navigation */}
      <Sidebar currentView={currentView} onViewChange={setCurrentView} />
      
      {/* Main Content Area */}
      <main className="flex-1 flex flex-col relative z-10 overflow-hidden">
        
        {/* Animated Wrapper: Key ensures re-mount + animation on view change */}
        <div key={currentView} className="h-full w-full animate-enter">
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
                savedState={speedDialState}
                onStateChange={handleSpeedDialChange}
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
        </div>
        
        {/* Overlays (No animation wrapper to prevent re-mounts/jumps) */}
        {isCallActive && (
            <ActiveCallModal 
                config={config} 
                onClose={handleWebCallEnd} 
            />
        )}
        
        {/* Footer Disclaimer */}
        {currentView !== 'settings' && (
            <div className="absolute bottom-4 right-8 text-[10px] text-white/10 max-w-md text-right pointer-events-none hidden md:block mix-blend-overlay font-medium tracking-widest uppercase animate-enter" style={{animationDelay: '0.5s'}}>
                Bianca Voice OS • Gemini Live
            </div>
        )}
      </main>
    </div>
  );
};

export default App;