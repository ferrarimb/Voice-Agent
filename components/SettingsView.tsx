
import React, { useState } from 'react';
import { Save, Workflow, BellRing, Zap, Phone, Globe, Server, Terminal, ShieldAlert, AlertTriangle, X, Cpu, Webhook, Copy, CheckCircle2 } from 'lucide-react';
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
  const [showServerGuide, setShowServerGuide] = useState(false);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);

  const handleSave = () => {
    onSave(localSettings);
    onSaveTwilioConfig(localTwilio);
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 3000);
  };

  // Logic for Webhook Info (Moved from SpeedDialInterface)
  let webhookBaseUrl = 'https://seu-ngrok.ngrok-free.app';
  if (localTwilio.webhookUrl) {
      try {
          webhookBaseUrl = new URL(localTwilio.webhookUrl).origin;
      } catch (e) {
          if(localTwilio.webhookUrl.startsWith('http')) {
             webhookBaseUrl = localTwilio.webhookUrl;
          }
      }
  }
  
  const webhookEndpoint = `${webhookBaseUrl}/webhook/speed-dial`;

  const jsonExample = `{
  "nome_lead": "Maria Souza",
  "data_agendamento": "14:00",
  "telefone_lead": "+5511999998888",
  "telefone_sdr": "${localTwilio.fromNumber || '+5511999997777'}",
  "TWILIO_ACCOUNT_SID": "${localTwilio.accountSid || 'AC...'}",
  "TWILIO_AUTH_TOKEN": "${localTwilio.authToken ? '*******' : '...'}",
  "TWILIO_FROM_NUMBER": "${localTwilio.fromNumber || '+1...'}"
}`;

  const copyToClipboard = (text: string, type: string) => {
      navigator.clipboard.writeText(text);
      setCopyStatus(type);
      setTimeout(() => setCopyStatus(null), 2000);
  };

  return (
    <div className="flex-1 bg-slate-950 h-screen overflow-y-auto">
      <header className="h-16 border-b border-slate-800 bg-slate-900/50 flex items-center justify-between px-8 sticky top-0 backdrop-blur-sm z-10">
        <h1 className="text-white font-semibold text-lg">Configurações</h1>
        <div className="flex gap-3">
             <button 
                onClick={() => setShowServerGuide(true)}
                className="px-4 py-2 bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 text-sm font-medium rounded hover:bg-indigo-600/30 transition flex items-center gap-2"
            >
                <Server size={16} /> Guia do Servidor
            </button>
            <button 
            onClick={handleSave}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-500 transition flex items-center gap-2"
            >
            <Save size={16} /> Salvar Alterações
            </button>
        </div>
      </header>

      <div className="p-8 max-w-5xl mx-auto space-y-8">
        
        {showSuccess && (
            <div className="bg-green-500/10 border border-green-500/20 text-green-400 px-4 py-3 rounded-lg flex items-center gap-3 animate-in fade-in slide-in-from-top-2">
                <BellRing size={18} />
                <span>Configurações salvas com sucesso!</span>
            </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            
            {/* Twilio Configuration */}
            <section className="bg-slate-900 border border-slate-800 rounded-xl p-6 lg:col-span-1">
                <div className="flex items-start gap-4 mb-6">
                    <div className="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center text-red-500">
                        <Phone size={24} />
                    </div>
                    <div>
                        <h2 className="text-lg font-medium text-white">Twilio Telephony</h2>
                        <p className="text-sm text-slate-400">
                            Configure o acesso PSTN e números.
                        </p>
                    </div>
                </div>

                <div className="space-y-4">
                    <div>
                        <label className="block text-xs font-medium text-slate-400 mb-1">Account SID</label>
                        <input 
                        type="text" 
                        value={localTwilio.accountSid}
                        onChange={(e) => setLocalTwilio({...localTwilio, accountSid: e.target.value})}
                        className="w-full bg-slate-950 border border-slate-700 rounded-md px-3 py-2 text-slate-200 focus:ring-2 focus:ring-red-500 outline-none placeholder:text-slate-600"
                        placeholder="AC..."
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-slate-400 mb-1">Auth Token</label>
                        <input 
                        type="password" 
                        value={localTwilio.authToken}
                        onChange={(e) => setLocalTwilio({...localTwilio, authToken: e.target.value})}
                        className="w-full bg-slate-950 border border-slate-700 rounded-md px-3 py-2 text-slate-200 focus:ring-2 focus:ring-red-500 outline-none placeholder:text-slate-600"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-slate-400 mb-1">From Number</label>
                        <input 
                        type="text" 
                        value={localTwilio.fromNumber}
                        onChange={(e) => setLocalTwilio({...localTwilio, fromNumber: e.target.value})}
                        className="w-full bg-slate-950 border border-slate-700 rounded-md px-3 py-2 text-slate-200 focus:ring-2 focus:ring-red-500 outline-none placeholder:text-slate-600"
                        placeholder="+1..."
                        />
                    </div>
                    <div className="pt-4 border-t border-slate-800">
                        <label className="block text-xs font-medium text-slate-400 mb-1 flex items-center gap-2">
                        <Globe size={12} /> Webhook URL (Ngrok)
                        </label>
                        <input 
                        type="text" 
                        value={localTwilio.webhookUrl || ''}
                        onChange={(e) => setLocalTwilio({...localTwilio, webhookUrl: e.target.value})}
                        className="w-full bg-slate-950 border border-slate-700 rounded-md px-3 py-2 text-slate-200 focus:ring-2 focus:ring-blue-500 outline-none placeholder:text-slate-600"
                        placeholder="https://...ngrok.app"
                        />
                        <p className="text-[10px] text-slate-500 mt-2">
                           URL necessária para streaming de áudio (WebSocket).
                        </p>
                    </div>
                </div>
            </section>

             {/* API Keys Section */}
             <div className="space-y-8 lg:col-span-1">
                 
                <section className="bg-slate-900 border border-slate-800 rounded-xl p-6">
                    <div className="mb-4">
                        <h2 className="text-lg font-medium text-white">AI Brain</h2>
                        <p className="text-sm text-slate-400">Credenciais da API.</p>
                    </div>
                    <div className="space-y-2">
                        <label className="block text-xs font-medium text-slate-400">OpenAI API Key</label>
                        <input 
                            type="password" 
                            value={localSettings.openaiApiKey || ''}
                            onChange={(e) => setLocalSettings({ ...localSettings, openaiApiKey: e.target.value })}
                            className="w-full bg-slate-950 border border-slate-700 rounded-md px-3 py-2 text-slate-200 focus:ring-2 focus:ring-green-500 outline-none placeholder:text-slate-600"
                            placeholder="sk-..."
                        />
                        <p className="text-[10px] text-slate-500">
                            Usado principalmente no lado do Servidor.
                        </p>
                    </div>
                </section>

                {/* n8n Integration */}
                <section className="bg-slate-900 border border-slate-800 rounded-xl p-6">
                    <div className="flex items-start gap-4 mb-6">
                        <div className="w-10 h-10 rounded-lg bg-[#FF6D5A]/10 flex items-center justify-center text-[#FF6D5A]">
                            <Workflow size={24} />
                        </div>
                        <div>
                            <h2 className="text-lg font-medium text-white">Automação n8n</h2>
                            <p className="text-sm text-slate-400">
                                Webhook para processamento pós-chamada.
                            </p>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div>
                            <label className="block text-xs font-medium text-slate-400 mb-1">Webhook URL (POST)</label>
                            <input 
                                type="text" 
                                value={localSettings.n8nWebhookUrl || ''}
                                onChange={(e) => setLocalSettings({ ...localSettings, n8nWebhookUrl: e.target.value })}
                                className="w-full bg-slate-950 border border-slate-700 rounded-md px-3 py-2 text-slate-200 focus:ring-2 focus:ring-[#FF6D5A] outline-none placeholder:text-slate-600"
                                placeholder="https://your-n8n-instance.com/..."
                            />
                        </div>
                    </div>
                </section>

             </div>
        </div>

        {/* Webhook Info Panel - REDESIGNED LAYOUT */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 border-l-4 border-l-blue-500">
            <div className="flex items-center gap-2 mb-4 pb-4 border-b border-slate-800 text-blue-400">
                <Webhook size={20} />
                <h3 className="font-medium">Integração Externa (Ponte SDR)</h3>
            </div>

            <p className="text-sm text-slate-400 mb-6">
                Para automatizar o Speed-to-Lead (ex: n8n, Zapier), envie uma requisição POST com o JSON abaixo para o seu servidor.
            </p>

            {/* Changed to flex-col to prevent overlapping/cramping of payload */}
            <div className="flex flex-col gap-8">
                <div className="space-y-4">
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">URL do Endpoint</label>
                        <div className="flex gap-2 items-center">
                            <span className="bg-green-500/20 text-green-400 px-3 py-2 rounded text-sm font-mono border border-green-500/30 font-bold h-full flex items-center">POST</span>
                            <div className="flex-1 bg-black rounded border border-slate-700 flex items-center justify-between pl-3 pr-1 py-2">
                                <code className="text-sm text-slate-300 truncate font-mono">{webhookEndpoint}</code>
                                <button onClick={() => copyToClipboard(webhookEndpoint, 'url')} className="p-1.5 hover:bg-slate-800 rounded text-slate-500 hover:text-white transition">
                                    {copyStatus === 'url' ? <CheckCircle2 size={16} className="text-green-500"/> : <Copy size={16} />}
                                </button>
                            </div>
                        </div>
                    </div>
                     <div className="text-xs text-slate-500 bg-slate-950/50 p-3 rounded border border-slate-800/50">
                        <p><strong>Notas:</strong></p>
                        <ul className="list-disc list-inside space-y-1 mt-1">
                            <li>O Endpoint requer que seu servidor local esteja rodando e o Ngrok conectado.</li>
                            <li>O sistema primeiro liga para o <code>telefone_sdr</code> (Agente), sussurra os dados, e depois conecta ao <code>telefone_lead</code>.</li>
                        </ul>
                    </div>
                </div>

                <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Payload Exemplo (JSON)</label>
                    <div className="bg-black rounded border border-slate-700 p-4 relative group">
                        <button onClick={() => copyToClipboard(jsonExample, 'json')} className="absolute top-2 right-2 p-1.5 bg-slate-800 rounded text-slate-400 opacity-0 group-hover:opacity-100 transition hover:text-white z-10">
                            {copyStatus === 'json' ? <CheckCircle2 size={14} className="text-green-500"/> : <Copy size={14} />}
                        </button>
                        <pre className="text-xs text-blue-300 font-mono leading-relaxed whitespace-pre-wrap overflow-x-auto">
                            {jsonExample}
                        </pre>
                    </div>
                </div>
            </div>
        </div>

      </div>

      {/* Server Guide Modal */}
      {showServerGuide && (
          <ServerGuideModal onClose={() => setShowServerGuide(false)} />
      )}
    </div>
  );
};

const ServerGuideModal: React.FC<{onClose: () => void}> = ({ onClose }) => {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4">
            <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-4xl h-[90vh] flex flex-col shadow-2xl animate-in fade-in zoom-in-95 duration-200">
                <div className="flex items-center justify-between p-6 border-b border-slate-800 bg-slate-950">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-indigo-500/10 rounded-lg border border-indigo-500/20">
                            <Server className="text-indigo-400" size={24} />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-white">Manual de Operações do Servidor</h3>
                            <p className="text-sm text-slate-400">Guia definitivo para rodar a integração localmente.</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-slate-500 hover:text-white p-2 hover:bg-slate-800 rounded-full transition">
                        <X size={24} />
                    </button>
                </div>
                
                <div className="flex-1 overflow-y-auto p-0 bg-slate-950">
                    
                    {/* Diagrama Visual */}
                    <div className="bg-slate-900 p-8 border-b border-slate-800 flex flex-col items-center justify-center">
                        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-6">Arquitetura da Solução</h4>
                        <div className="flex items-center gap-4 text-slate-400 text-sm flex-wrap justify-center">
                             <div className="flex flex-col items-center gap-2">
                                 <div className="w-12 h-12 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center">
                                     <Phone size={20} />
                                 </div>
                                 <span>Celular</span>
                             </div>
                             <div className="h-px w-8 bg-slate-700"></div>
                             <div className="flex flex-col items-center gap-2">
                                 <div className="w-12 h-12 rounded-full bg-red-900/20 border border-red-500/30 flex items-center justify-center text-red-400">
                                     <span className="font-bold">Twilio</span>
                                 </div>
                                 <span>Telefonia</span>
                             </div>
                             <div className="h-px w-8 bg-slate-700"></div>
                             <div className="flex flex-col items-center gap-2">
                                 <div className="w-12 h-12 rounded-full bg-blue-900/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
                                     <Globe size={20} />
                                 </div>
                                 <span>Ngrok (Túnel)</span>
                             </div>
                             <div className="h-px w-8 bg-slate-700"></div>
                             <div className="flex flex-col items-center gap-2">
                                 <div className="w-12 h-12 rounded-full bg-indigo-600 text-white flex items-center justify-center shadow-lg shadow-indigo-500/20">
                                     <Cpu size={20} />
                                 </div>
                                 <span className="font-bold text-white">Seu PC</span>
                             </div>
                             <div className="h-px w-8 bg-slate-700"></div>
                             <div className="flex flex-col items-center gap-2">
                                 <div className="w-12 h-12 rounded-full bg-gradient-to-br from-green-400 to-emerald-500 text-white flex items-center justify-center">
                                     <span className="font-bold text-xs">AI</span>
                                 </div>
                                 <span>OpenAI GPT-4o</span>
                             </div>
                        </div>
                    </div>

                    <div className="p-8 space-y-10">

                        {/* SECTION 1: SETUP */}
                        <section>
                            <h4 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                                <span className="w-6 h-6 rounded-full bg-slate-800 text-slate-400 flex items-center justify-center text-xs border border-slate-700">1</span>
                                Preparação (Faça uma vez)
                            </h4>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="bg-slate-900 border border-slate-800 rounded-lg p-5">
                                    <h5 className="font-medium text-indigo-400 mb-3 flex items-center gap-2">
                                        <Terminal size={16} /> O Truque do CMD
                                    </h5>
                                    <p className="text-sm text-slate-400 mb-3">
                                        Para não se perder nas pastas:
                                    </p>
                                    <ol className="list-decimal ml-4 space-y-2 text-sm text-slate-300">
                                        <li>Abra a pasta do projeto no Windows Explorer.</li>
                                        <li>Clique na barra de endereço lá no topo.</li>
                                        <li>Apague tudo, digite <code className="bg-black px-1 rounded text-white">cmd</code> e dê Enter.</li>
                                    </ol>
                                    <div className="mt-3 text-xs bg-slate-950 p-2 rounded border border-slate-800 text-slate-500">
                                        Isso abre o terminal preto já no lugar certo.
                                    </div>
                                </div>

                                <div className="bg-slate-900 border border-slate-800 rounded-lg p-5">
                                    <h5 className="font-medium text-green-400 mb-3 flex items-center gap-2">
                                        <ShieldAlert size={16} /> O Arquivo .env
                                    </h5>
                                    <p className="text-sm text-slate-400 mb-3">
                                        O servidor precisa da sua chave OpenAI.
                                    </p>
                                    <ul className="space-y-2 text-sm text-slate-300">
                                        <li>1. Crie um arquivo chamado <code className="text-white">.env</code> na pasta.</li>
                                        <li>2. Abra no Bloco de Notas.</li>
                                        <li>3. Cole sua chave exatamente assim:</li>
                                    </ul>
                                    <code className="block mt-2 bg-black p-2 rounded text-xs text-green-300 font-mono">
                                        OPENAI_API_KEY=sk-proj-...
                                    </code>
                                </div>
                            </div>
                        </section>

                        {/* SECTION 2: EXECUÇÃO */}
                        <section>
                            <h4 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                                <span className="w-6 h-6 rounded-full bg-slate-800 text-slate-400 flex items-center justify-center text-xs border border-slate-700">2</span>
                                Rodando o Sistema (Sempre que for usar)
                            </h4>
                            
                            <div className="space-y-4">
                                {/* Terminal 1 */}
                                <div className="flex gap-4">
                                    <div className="w-8 flex flex-col items-center pt-2">
                                        <div className="h-full w-px bg-slate-800"></div>
                                    </div>
                                    <div className="flex-1 bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
                                        <div className="bg-slate-800 px-4 py-2 text-xs font-bold text-slate-300 flex justify-between">
                                            <span>TERMINAL 1: O SERVIDOR (Use o truque do cmd)</span>
                                            <span className="text-indigo-400">Janela A</span>
                                        </div>
                                        <div className="p-4 font-mono text-sm space-y-4">
                                            <div>
                                                <p className="text-slate-500 mb-1"># Passo 1: Instalar dependências (Só na primeira vez)</p>
                                                <div className="bg-black p-3 rounded border border-slate-700 text-white">
                                                    npm install fastify @fastify/websocket @fastify/formbody ws dotenv
                                                </div>
                                            </div>
                                            <div>
                                                <p className="text-slate-500 mb-1"># Passo 2: Ligar o servidor</p>
                                                <div className="bg-black p-3 rounded border border-slate-700 text-green-400">
                                                    node server.js
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Terminal 2 */}
                                <div className="flex gap-4">
                                    <div className="w-8 flex flex-col items-center pt-2">
                                        <div className="h-full w-px bg-slate-800"></div>
                                    </div>
                                    <div className="flex-1 bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
                                        <div className="bg-slate-800 px-4 py-2 text-xs font-bold text-slate-300 flex justify-between">
                                            <span>TERMINAL 2: O NGROK (Abra OUTRO cmd)</span>
                                            <span className="text-blue-400">Janela B</span>
                                        </div>
                                        <div className="p-4 font-mono text-sm space-y-4">
                                            <div>
                                                <p className="text-slate-500 mb-1"># Comando Mágico (Se ngrok falhar, use npx ngrok)</p>
                                                <div className="bg-black p-3 rounded border border-slate-700 text-blue-400">
                                                    npx ngrok http 5000
                                                </div>
                                            </div>
                                            <div className="bg-blue-900/20 p-3 rounded border border-blue-500/30 text-slate-300 text-xs">
                                                Copie o link que aparece em <strong>Forwarding</strong> (ex: <code>https://xyz.ngrok-free.app</code>)
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </section>

                        {/* SECTION 3: TROUBLESHOOTING */}
                        <section className="pb-8">
                            <h4 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                                <AlertTriangle size={18} className="text-yellow-500" />
                                Solução de Problemas
                            </h4>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="bg-red-950/20 border border-red-900/30 p-4 rounded-lg">
                                    <h5 className="font-bold text-red-400 text-sm mb-2">Ngrok pede "Authtoken"</h5>
                                    <p className="text-xs text-slate-400">
                                        O Ngrok agora exige login. 
                                        1. Crie conta em <a href="https://dashboard.ngrok.com" target="_blank" className="underline text-white">dashboard.ngrok.com</a>.
                                        2. Copie o comando <code>ngrok config add-authtoken...</code> do site deles.
                                        3. Cole no terminal e dê Enter.
                                    </p>
                                </div>
                                <div className="bg-yellow-950/20 border border-yellow-900/30 p-4 rounded-lg">
                                    <h5 className="font-bold text-yellow-400 text-sm mb-2">Erro: Address in use (Porta ocupada)</h5>
                                    <p className="text-xs text-slate-400">
                                        Você já tem um servidor rodando. Feche a janela do terminal antigo ou aperte <code>Ctrl + C</code> nele para parar antes de rodar de novo.
                                    </p>
                                </div>
                                <div className="bg-slate-800 p-4 rounded-lg">
                                    <h5 className="font-bold text-white text-sm mb-2">Servidor fecha logo após abrir?</h5>
                                    <p className="text-xs text-slate-400">
                                        Verifique se você criou o arquivo <code>.env</code> corretamente com a chave <code>OPENAI_API_KEY</code>.
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
