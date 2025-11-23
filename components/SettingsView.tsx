import React, { useState, useEffect } from 'react';
import { Save, Server, Phone, Globe, Workflow, Copy, CheckCircle2, Webhook, Eye, EyeOff, Terminal, Radio, AlertTriangle, Cpu, X } from 'lucide-react';
import { AppSettings, TwilioConfig } from '../types';

interface SettingsViewProps {
  settings: AppSettings;
  twilioConfig: TwilioConfig;
  onSave: (settings: AppSettings) => void;
  onSaveTwilioConfig: (config: TwilioConfig) => void;
}

const SettingsView: React.FC<SettingsViewProps> = ({ settings, twilioConfig, onSave, onSaveTwilioConfig }) => {
  const [localSettings, setLocalSettings] = useState<AppSettings>(settings);
  const [localTwilio, setLocalTwilio] = useState<TwilioConfig>(twilioConfig);
  const [showSuccess, setShowSuccess] = useState(false);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [showServerGuide, setShowServerGuide] = useState(false);

  // Visibility States
  const [showAuthToken, setShowAuthToken] = useState(false);
  const [showOpenAIKey, setShowOpenAIKey] = useState(false);

  // Sync state if props change (e.g. initial load)
  useEffect(() => {
     setLocalSettings(settings);
     setLocalTwilio(twilioConfig);
  }, [settings, twilioConfig]);

  const handleSave = () => {
    onSave(localSettings);
    onSaveTwilioConfig(localTwilio);
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 3000);
  };

  let webhookBaseUrl = 'http://localhost:5000';
  if (localTwilio.webhookUrl) {
      try {
          // If it's ngrok, use it. If it doesn't have protocol, add it.
          const urlStr = localTwilio.webhookUrl.startsWith('http') ? localTwilio.webhookUrl : `https://${localTwilio.webhookUrl}`;
          const u = new URL(urlStr);
          webhookBaseUrl = u.origin;
      } catch (e) { webhookBaseUrl = localTwilio.webhookUrl; }
  }
  const webhookEndpoint = `${webhookBaseUrl}/webhook/speed-dial`;

  const jsonExample = `{
  "nome_lead": "Maria Souza",
  "data_agendamento": "14:00",
  "telefone_lead": "+5511999998888",
  "telefone_sdr": "${localTwilio.fromNumber || '+5511993137410'}",
  "TWILIO_ACCOUNT_SID": "${localTwilio.accountSid || 'AC...'}",
  "TWILIO_AUTH_TOKEN": "${localTwilio.authToken ? '*******' : '...'}",
  "TWILIO_FROM_NUMBER": "${localTwilio.fromNumber || '+5511993137410'}"
}`;

  const copyToClipboard = (text: string, type: string) => {
      navigator.clipboard.writeText(text);
      setCopyStatus(type);
      setTimeout(() => setCopyStatus(null), 2000);
  };

  return (
    <div className="flex-1 h-screen overflow-y-auto custom-scrollbar">
      <header className="h-24 flex items-center justify-between px-10 sticky top-0 z-20 backdrop-blur-xl bg-transparent border-b border-white/5">
        <h1 className="text-white font-semibold text-2xl tracking-tight text-glow">System Settings</h1>
        <div className="flex gap-4">
             <button 
                onClick={() => setShowServerGuide(true)}
                className="glass-button px-6 py-3 rounded-2xl text-blue-200 text-sm font-medium hover:bg-blue-500/20 transition flex items-center gap-2 border-blue-500/20"
            >
                <Server size={18} /> <span className="hidden sm:inline">Connection Guide</span>
            </button>
            <button 
                onClick={handleSave}
                className="glass-button px-8 py-3 rounded-2xl text-white text-sm font-bold hover:bg-white/10 transition flex items-center gap-2 shadow-[0_0_20px_rgba(255,255,255,0.1)]"
            >
                <Save size={18} /> Save Config
            </button>
        </div>
      </header>

      <div className="p-10 max-w-6xl mx-auto space-y-8 pb-40">
        {showSuccess && (
            <div className="glass-panel border-l-4 border-l-emerald-500 text-emerald-100 px-6 py-4 rounded-2xl flex items-center gap-4 animate-in slide-in-from-top-4 shadow-[0_0_30px_rgba(16,185,129,0.2)]">
                <CheckCircle2 size={24} />
                <span className="font-medium">Configuration saved successfully. System updated.</span>
            </div>
        )}

        {/* Twilio Section */}
        <section className="glass-panel rounded-[2.5rem] p-10">
            <div className="flex items-center gap-4 mb-10 border-b border-white/5 pb-6">
                <div className="w-12 h-12 rounded-2xl bg-red-500/10 flex items-center justify-center border border-red-500/20 shadow-[0_0_15px_rgba(239,68,68,0.2)]">
                    <Phone size={24} className="text-red-400" />
                </div>
                <div>
                    <h2 className="text-xl font-semibold text-white">Telephony Provider</h2>
                    <p className="text-sm text-white/40">Twilio API credentials for phone calls.</p>
                </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-3">
                    <label className="text-xs uppercase font-bold tracking-widest text-white/30 ml-1">Account SID</label>
                    <input 
                        type="text" 
                        value={localTwilio.accountSid}
                        onChange={(e) => setLocalTwilio({...localTwilio, accountSid: e.target.value})}
                        className="w-full glass-input rounded-2xl px-5 py-4 text-sm font-mono text-white/80"
                        placeholder="AC..."
                    />
                </div>
                <div className="space-y-3">
                    <label className="text-xs uppercase font-bold tracking-widest text-white/30 ml-1">Auth Token</label>
                    <div className="relative">
                        <input 
                            type={showAuthToken ? "text" : "password"}
                            value={localTwilio.authToken}
                            onChange={(e) => setLocalTwilio({...localTwilio, authToken: e.target.value})}
                            className="w-full glass-input rounded-2xl px-5 py-4 text-sm font-mono text-white/80 pr-12"
                        />
                        <button 
                            onClick={() => setShowAuthToken(!showAuthToken)}
                            className="absolute right-4 top-1/2 -translate-y-1/2 text-white/30 hover:text-white transition"
                        >
                            {showAuthToken ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                    </div>
                </div>
                <div className="space-y-3">
                    <label className="text-xs uppercase font-bold tracking-widest text-white/30 ml-1">Caller ID (From)</label>
                    <input 
                        type="text" 
                        value={localTwilio.fromNumber}
                        onChange={(e) => setLocalTwilio({...localTwilio, fromNumber: e.target.value})}
                        className="w-full glass-input rounded-2xl px-5 py-4 text-sm font-mono text-white/80"
                        placeholder="+55..."
                    />
                </div>
                <div className="space-y-3">
                    <label className="text-xs uppercase font-bold tracking-widest text-white/30 ml-1">Ngrok URL (HTTPS)</label>
                    <input 
                        type="text" 
                        value={localTwilio.webhookUrl || ''}
                        onChange={(e) => setLocalTwilio({...localTwilio, webhookUrl: e.target.value})}
                        className="w-full glass-input rounded-2xl px-5 py-4 text-sm text-blue-300 font-mono border-blue-500/30 bg-blue-500/5 focus:bg-blue-500/10"
                        placeholder="https://..."
                    />
                </div>
            </div>
        </section>

        {/* Integrations Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <section className="glass-panel rounded-[2.5rem] p-10">
                <div className="flex items-center gap-4 mb-8">
                    <div className="w-10 h-10 rounded-2xl bg-green-500/10 flex items-center justify-center border border-green-500/20">
                        <Globe size={20} className="text-green-400" />
                    </div>
                    <h2 className="text-lg font-semibold text-white">OpenAI</h2>
                </div>
                <div className="space-y-3">
                    <label className="text-xs uppercase font-bold tracking-widest text-white/30 ml-1">API Key</label>
                    <div className="relative">
                        <input 
                            type={showOpenAIKey ? "text" : "password"}
                            value={localSettings.openaiApiKey || ''}
                            onChange={(e) => setLocalSettings({ ...localSettings, openaiApiKey: e.target.value })}
                            className="w-full glass-input rounded-2xl px-5 py-4 text-sm font-mono text-white/80 pr-12"
                            placeholder="sk-..."
                        />
                        <button 
                            onClick={() => setShowOpenAIKey(!showOpenAIKey)}
                            className="absolute right-4 top-1/2 -translate-y-1/2 text-white/30 hover:text-white transition"
                        >
                            {showOpenAIKey ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                    </div>
                    <p className="text-[10px] text-white/30 ml-1">Used for server-side Whisper & Logic.</p>
                </div>
            </section>

            <section className="glass-panel rounded-[2.5rem] p-10">
                <div className="flex items-center gap-4 mb-8">
                    <div className="w-10 h-10 rounded-2xl bg-orange-500/10 flex items-center justify-center border border-orange-500/20">
                        <Workflow size={20} className="text-orange-400" />
                    </div>
                    <h2 className="text-lg font-semibold text-white">Automation (n8n)</h2>
                </div>
                <div className="space-y-3">
                    <label className="text-xs uppercase font-bold tracking-widest text-white/30 ml-1">Webhook URL</label>
                    <input 
                        type="text" 
                        value={localSettings.n8nWebhookUrl || ''}
                        onChange={(e) => setLocalSettings({ ...localSettings, n8nWebhookUrl: e.target.value })}
                        className="w-full glass-input rounded-2xl px-5 py-4 text-sm font-mono text-white/80"
                        placeholder="https://..."
                    />
                </div>
            </section>
        </div>
        
         {/* Webhook Info Panel - Liquid Glass Style */}
         <section className="glass-panel rounded-[2rem] p-10 border-l-4 border-l-blue-500/50">
            <div className="flex items-center gap-3 mb-6 pb-6 border-b border-white/5 text-blue-300">
                <Webhook size={24} />
                <div>
                     <h3 className="font-semibold text-lg text-white">Integração Externa (Ponte SDR)</h3>
                     <p className="text-xs text-white/40 uppercase tracking-wider">Developer Endpoint</p>
                </div>
            </div>

            <p className="text-sm text-white/60 mb-8 leading-relaxed">
                Para automatizar o Speed-to-Lead (ex: n8n, Zapier), envie uma requisição POST com o JSON abaixo para o seu servidor.
            </p>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                <div className="space-y-6">
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-white/30 uppercase tracking-widest">URL do Endpoint</label>
                        <div className="flex gap-3 h-12">
                            <span className="glass-panel bg-emerald-500/10 text-emerald-300 px-4 rounded-xl text-xs font-mono font-bold flex items-center justify-center border border-emerald-500/20">POST</span>
                            <div className="flex-1 glass-input rounded-xl flex items-center justify-between pl-4 pr-2">
                                <code className="text-xs text-white/70 truncate font-mono">{webhookEndpoint}</code>
                                <button onClick={() => copyToClipboard(webhookEndpoint, 'url')} className="p-2 hover:bg-white/10 rounded-lg text-white/40 hover:text-white transition">
                                    {copyStatus === 'url' ? <CheckCircle2 size={16} className="text-emerald-500"/> : <Copy size={16} />}
                                </button>
                            </div>
                        </div>
                    </div>
                     <div className="glass-panel bg-white/[0.02] p-6 rounded-xl border border-white/5 text-xs text-white/50 leading-relaxed space-y-2">
                        <p><strong className="text-white/80">Como funciona:</strong></p>
                        <ul className="list-disc list-inside space-y-1 ml-1">
                            <li>O Endpoint requer que seu servidor local esteja rodando e o Ngrok conectado.</li>
                            <li>O sistema liga para o <code>telefone_sdr</code> (Agente), sussurra os dados, e conecta ao <code>telefone_lead</code>.</li>
                        </ul>
                    </div>
                </div>

                <div className="space-y-2">
                    <label className="text-xs font-bold text-white/30 uppercase tracking-widest">Payload Exemplo (JSON)</label>
                    <div className="glass-input bg-black/40 rounded-xl p-5 relative group border border-white/10">
                        <button onClick={() => copyToClipboard(jsonExample, 'json')} className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 rounded-lg text-white/40 group-hover:opacity-100 opacity-0 transition hover:text-white">
                            {copyStatus === 'json' ? <CheckCircle2 size={14} className="text-emerald-500"/> : <Copy size={14} />}
                        </button>
                        <pre className="text-[11px] text-blue-300 font-mono leading-relaxed whitespace-pre-wrap overflow-x-auto custom-scrollbar">
                            {jsonExample}
                        </pre>
                    </div>
                </div>
            </div>
        </section>

      </div>

      {showServerGuide && <ServerGuideModal onClose={() => setShowServerGuide(false)} />}
    </div>
  );
};

// Adapted Server Guide with Liquid Glass Design
const ServerGuideModal: React.FC<{onClose: () => void}> = ({ onClose }) => {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-md animate-in fade-in duration-300" onClick={onClose}></div>
            <div className="relative w-full max-w-4xl h-[85vh] glass-panel rounded-[2.5rem] flex flex-col shadow-2xl border border-white/10 bg-[#050505]/90 overflow-hidden animate-in zoom-in-95 duration-300">
                
                {/* Header */}
                <div className="flex items-center justify-between p-8 border-b border-white/5 bg-white/[0.02]">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-indigo-500/10 rounded-2xl border border-indigo-500/20 shadow-[0_0_15px_rgba(99,102,241,0.15)]">
                            <Server className="text-indigo-400" size={24} />
                        </div>
                        <div>
                            <h3 className="text-xl font-semibold text-white">Manual de Operações do Servidor</h3>
                            <p className="text-sm text-white/40">Guia definitivo para rodar a integração localmente.</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/10 text-white/40 hover:text-white transition">
                        <X size={24} />
                    </button>
                </div>
                
                <div className="flex-1 overflow-y-auto p-0 custom-scrollbar">
                    
                    {/* Architecture Diagram */}
                    <div className="bg-white/[0.01] p-10 border-b border-white/5 flex flex-col items-center justify-center relative overflow-hidden">
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-20 bg-gradient-to-r from-transparent via-indigo-500/5 to-transparent blur-3xl pointer-events-none"></div>
                        <h4 className="text-[10px] font-bold text-white/30 uppercase tracking-[0.2em] mb-8 relative z-10">Fluxo de Dados</h4>
                        <div className="flex items-center gap-6 text-white/60 text-sm flex-wrap justify-center relative z-10">
                             <div className="flex flex-col items-center gap-3 group">
                                 <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center group-hover:bg-white/10 transition shadow-lg">
                                     <Phone size={20} />
                                 </div>
                                 <span className="text-xs font-medium">Celular</span>
                             </div>
                             <div className="h-px w-10 bg-white/10"></div>
                             <div className="flex flex-col items-center gap-3 group">
                                 <div className="w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 shadow-[0_0_15px_rgba(239,68,68,0.1)]">
                                     <span className="font-bold text-[10px]">TWILIO</span>
                                 </div>
                                 <span className="text-xs font-medium">Telefonia</span>
                             </div>
                             <div className="h-px w-10 bg-white/10"></div>
                             <div className="flex flex-col items-center gap-3 group">
                                 <div className="w-14 h-14 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.1)]">
                                     <Globe size={20} />
                                 </div>
                                 <span className="text-xs font-medium">Ngrok</span>
                             </div>
                             <div className="h-px w-10 bg-white/10"></div>
                             <div className="flex flex-col items-center gap-3 group">
                                 <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shadow-[0_0_15px_rgba(99,102,241,0.1)]">
                                     <Cpu size={20} />
                                 </div>
                                 <span className="text-xs font-medium text-white">Seu PC</span>
                             </div>
                        </div>
                    </div>

                    <div className="p-10 space-y-12">

                        {/* SECTION 1: SETUP */}
                        <section>
                            <h4 className="text-lg font-semibold text-white mb-6 flex items-center gap-3">
                                <span className="w-8 h-8 rounded-full bg-white/5 text-white/60 flex items-center justify-center text-xs font-bold border border-white/10">1</span>
                                Preparação (Faça uma vez)
                            </h4>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="glass-panel bg-white/[0.02] border-white/5 rounded-2xl p-6 hover:bg-white/[0.04] transition">
                                    <h5 className="font-bold text-indigo-300 text-sm mb-3 flex items-center gap-2">
                                        <Terminal size={16} /> O Truque do CMD
                                    </h5>
                                    <p className="text-xs text-white/50 mb-4 leading-relaxed">
                                        Para não se perder nas pastas:
                                    </p>
                                    <ol className="list-decimal ml-4 space-y-2 text-xs text-white/70">
                                        <li>Abra a pasta do projeto no Windows Explorer.</li>
                                        <li>Clique na barra de endereço lá no topo.</li>
                                        <li>Apague tudo, digite <code className="bg-white/10 px-1.5 py-0.5 rounded text-white">cmd</code> e dê Enter.</li>
                                    </ol>
                                </div>

                                <div className="glass-panel bg-white/[0.02] border-white/5 rounded-2xl p-6 hover:bg-white/[0.04] transition">
                                    <h5 className="font-bold text-emerald-300 text-sm mb-3 flex items-center gap-2">
                                        <AlertTriangle size={16} /> O Arquivo .env
                                    </h5>
                                    <p className="text-xs text-white/50 mb-4 leading-relaxed">
                                        O servidor precisa da sua chave OpenAI.
                                    </p>
                                    <ul className="space-y-2 text-xs text-white/70">
                                        <li>1. Crie um arquivo chamado <code className="text-white bg-white/10 px-1 rounded">.env</code> na pasta.</li>
                                        <li>2. Abra no Bloco de Notas.</li>
                                        <li>3. Cole sua chave exatamente assim:</li>
                                    </ul>
                                    <code className="block mt-3 bg-black/40 p-3 rounded-lg text-[10px] text-emerald-400 font-mono border border-white/5">
                                        OPENAI_API_KEY=sk-proj-...
                                    </code>
                                </div>
                            </div>
                        </section>

                        {/* SECTION 2: EXECUTION */}
                        <section>
                            <h4 className="text-lg font-semibold text-white mb-6 flex items-center gap-3">
                                <span className="w-8 h-8 rounded-full bg-white/5 text-white/60 flex items-center justify-center text-xs font-bold border border-white/10">2</span>
                                Rodando o Sistema (Sempre que for usar)
                            </h4>
                            
                            <div className="space-y-4">
                                {/* Terminal 1 */}
                                <div className="flex gap-6 group">
                                    <div className="w-8 flex flex-col items-center pt-2">
                                        <div className="h-full w-px bg-gradient-to-b from-indigo-500/50 to-transparent"></div>
                                    </div>
                                    <div className="flex-1 glass-panel bg-black/40 border-white/10 rounded-2xl overflow-hidden shadow-lg">
                                        <div className="bg-white/5 px-5 py-3 text-[10px] font-bold text-white/40 flex justify-between uppercase tracking-wider border-b border-white/5">
                                            <span>Terminal 1: O Servidor</span>
                                            <span className="text-indigo-400">Janela A</span>
                                        </div>
                                        <div className="p-5 font-mono text-sm space-y-5">
                                            <div>
                                                <p className="text-white/30 text-xs mb-2"># Passo 1: Instalar dependências (Só na primeira vez)</p>
                                                <div className="bg-black/50 p-3 rounded-xl border border-white/10 text-white/80 select-all">
                                                    npm install fastify @fastify/websocket @fastify/formbody ws dotenv
                                                </div>
                                            </div>
                                            <div>
                                                <p className="text-white/30 text-xs mb-2"># Passo 2: Ligar o servidor</p>
                                                <div className="bg-black/50 p-3 rounded-xl border border-white/10 text-emerald-400 font-bold select-all">
                                                    node server.js
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Terminal 2 */}
                                <div className="flex gap-6 group">
                                    <div className="w-8 flex flex-col items-center pt-2">
                                        <div className="h-full w-px bg-gradient-to-b from-blue-500/50 to-transparent"></div>
                                    </div>
                                    <div className="flex-1 glass-panel bg-black/40 border-white/10 rounded-2xl overflow-hidden shadow-lg">
                                        <div className="bg-white/5 px-5 py-3 text-[10px] font-bold text-white/40 flex justify-between uppercase tracking-wider border-b border-white/5">
                                            <span>Terminal 2: O Ngrok</span>
                                            <span className="text-blue-400">Janela B</span>
                                        </div>
                                        <div className="p-5 font-mono text-sm space-y-5">
                                            <div>
                                                <p className="text-white/30 text-xs mb-2"># Comando Mágico (Se ngrok falhar, use npx ngrok)</p>
                                                <div className="bg-black/50 p-3 rounded-xl border border-white/10 text-blue-300 font-bold select-all">
                                                    npx ngrok http 5000
                                                </div>
                                            </div>
                                            <div className="bg-blue-500/10 p-3 rounded-xl border border-blue-500/20 text-white/60 text-xs flex items-center gap-3">
                                                <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse"></div>
                                                <span>Copie o link em <strong>Forwarding</strong> (ex: https://xyz.ngrok-free.app)</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </section>

                        {/* SECTION 3: TROUBLESHOOTING */}
                        <section className="pb-8">
                            <h4 className="text-lg font-semibold text-white mb-6 flex items-center gap-3">
                                <AlertTriangle size={20} className="text-yellow-500" />
                                Solução de Problemas
                            </h4>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="glass-panel bg-red-500/5 border-red-500/10 p-5 rounded-2xl">
                                    <h5 className="font-bold text-red-300 text-xs mb-2 uppercase tracking-wide">Ngrok pede "Authtoken"</h5>
                                    <p className="text-[11px] text-white/50 leading-relaxed">
                                        O Ngrok agora exige login. 
                                        1. Crie conta em <a href="https://dashboard.ngrok.com" target="_blank" className="underline text-white hover:text-red-300">dashboard.ngrok.com</a>.
                                        2. Copie o comando <code>ngrok config add-authtoken...</code>.
                                        3. Cole no terminal.
                                    </p>
                                </div>
                                <div className="glass-panel bg-yellow-500/5 border-yellow-500/10 p-5 rounded-2xl">
                                    <h5 className="font-bold text-yellow-300 text-xs mb-2 uppercase tracking-wide">Erro: Address in use</h5>
                                    <p className="text-[11px] text-white/50 leading-relaxed">
                                        Porta ocupada. Feche a janela do terminal antigo ou aperte <code>Ctrl + C</code> nele antes de rodar de novo.
                                    </p>
                                </div>
                            </div>
                        </section>

                    </div>
                </div>
            </div>
        </div>
    );
};

export default SettingsView;