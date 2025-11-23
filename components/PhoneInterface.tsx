
import React, { useState, useEffect } from 'react';
import { Phone, Settings, Delete, Loader2, Server, X, Terminal, CheckCircle2, AlertTriangle, Globe, Cpu, ShieldAlert } from 'lucide-react';
import { TwilioConfig, AssistantConfig, CallLogEntry } from '../types';
import { makeTwilioCall } from '../services/twilioService';

interface PhoneInterfaceProps {
  assistantConfig: AssistantConfig;
  onCallLog: (log: CallLogEntry) => void;
  n8nWebhookUrl?: string;
}

const PhoneInterface: React.FC<PhoneInterfaceProps> = ({ assistantConfig, onCallLog, n8nWebhookUrl }) => {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [showServerGuide, setShowServerGuide] = useState(false);
  const [isCalling, setIsCalling] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{type: 'success'|'error', text: string} | null>(null);
  
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

  const saveSettings = () => {
    // Smart Fix: Automatically append /incoming if missing
    let url = twilioConfig.webhookUrl?.trim() || '';
    if (url.length > 0) {
        if (url.endsWith('/')) {
            url = url.slice(0, -1); // Remove trailing slash
        }
        if (!url.endsWith('/incoming')) {
            url = `${url}/incoming`; // Auto-append
        }
    }

    const finalConfig = { ...twilioConfig, webhookUrl: url };
    setTwilioConfig(finalConfig);
    localStorage.setItem('twilio_config', JSON.stringify(finalConfig));
    
    setShowSettings(false);
    setStatusMsg({ type: 'success', text: 'Configuração salva! (URL ajustada automaticamente)' });
    setTimeout(() => setStatusMsg(null), 3000);
  };

  const handleNumberClick = (num: string) => {
    if (phoneNumber.length < 15) {
      setPhoneNumber(prev => prev + num);
    }
  };

  const handleDelete = () => {
    setPhoneNumber(prev => prev.slice(0, -1));
  };

  const handleCall = async () => {
    if (!phoneNumber) return;
    
    setIsCalling(true);
    setStatusMsg(null);

    const result = await makeTwilioCall(twilioConfig, phoneNumber, assistantConfig.firstMessage, n8nWebhookUrl);
    
    // Create Log Entry
    const logEntry: CallLogEntry = {
        id: Date.now().toString(),
        timestamp: new Date().toISOString(),
        type: 'pstn',
        to: phoneNumber,
        from: twilioConfig.fromNumber || 'Unknown',
        status: result.success ? 'success' : 'failed',
        assistantName: assistantConfig.name,
        errorMessage: result.error
    };
    onCallLog(logEntry);

    setIsCalling(false);
    if (result.success) {
      setStatusMsg({ type: 'success', text: 'Call initiated successfully!' });
    } else {
      setStatusMsg({ type: 'error', text: `Call failed: ${result.error}` });
    }
  };

  return (
    <div className="flex-1 bg-slate-950 h-screen overflow-y-auto flex flex-col items-center justify-center p-4 relative">
      
      {/* Header */}
      <div className="absolute top-0 left-0 w-full p-6 border-b border-slate-800 flex justify-between items-center bg-slate-900/50 backdrop-blur-sm z-10">
        <h2 className="text-xl font-semibold text-white">Phone Interface</h2>
        <div className="flex gap-2">
            <button 
            onClick={() => setShowServerGuide(true)}
            className="px-3 py-2 rounded-lg bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 text-sm font-medium hover:bg-indigo-600/30 transition flex items-center gap-2"
            >
            <Server size={16} /> Manual de Instalação
            </button>
            <button 
            onClick={() => setShowSettings(!showSettings)}
            className={`p-2 rounded-lg transition ${showSettings ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}
            >
            <Settings size={20} />
            </button>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-8 w-full max-w-4xl items-start justify-center mt-16">
        
        {/* Dialer Section */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl w-full max-w-sm mx-auto">
          <div className="mb-8">
             <input 
               type="text" 
               value={phoneNumber}
               onChange={(e) => setPhoneNumber(e.target.value)}
               placeholder="+1..."
               className="w-full bg-transparent text-center text-3xl font-mono text-white outline-none placeholder:text-slate-700"
             />
             <div className="h-6 text-center mt-2">
               {statusMsg && (
                 <span className={`text-xs ${statusMsg.type === 'success' ? 'text-green-400' : 'text-red-400'}`}>
                   {statusMsg.text}
                 </span>
               )}
             </div>
          </div>

          <div className="grid grid-cols-3 gap-4 mb-8">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, '*', 0, '#'].map((key) => (
              <button 
                key={key}
                onClick={() => handleNumberClick(key.toString())}
                className="w-16 h-16 rounded-full bg-slate-800 hover:bg-slate-700 text-white text-xl font-semibold flex items-center justify-center mx-auto transition active:scale-95"
              >
                {key}
              </button>
            ))}
          </div>

          <div className="flex justify-center gap-6 items-center">
             <button onClick={handleDelete} className="p-4 text-slate-500 hover:text-white transition">
               <Delete size={24} />
             </button>
             <button 
               onClick={handleCall}
               disabled={isCalling || !phoneNumber}
               className="w-16 h-16 rounded-full bg-green-600 hover:bg-green-500 text-white flex items-center justify-center shadow-lg shadow-green-900/50 transition transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
             >
               {isCalling ? <Loader2 className="animate-spin" /> : <Phone size={28} fill="currentColor" />}
             </button>
          </div>
          
          <div className="mt-6 text-center px-4">
             <p className="text-xs text-slate-500">
               Ligando como <span className="text-blue-400">{assistantConfig.name}</span>
             </p>
             <p className="text-[10px] text-slate-600 mt-2">
               {twilioConfig.webhookUrl 
                 ? "Backend Conectado (IA Real)." 
                 : "Modo Demo (Sem áudio)."
               }
             </p>
          </div>
        </div>

        {/* Settings Panel (Visible if toggled) */}
        {showSettings && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 w-full max-w-sm animate-in fade-in slide-in-from-right-4">
            <h3 className="text-lg font-semibold text-white mb-4">Configuração Twilio</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Account SID</label>
                <input 
                  type="text" 
                  value={twilioConfig.accountSid}
                  onChange={(e) => setTwilioConfig({...twilioConfig, accountSid: e.target.value})}
                  className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-sm text-white focus:border-blue-500 outline-none"
                  placeholder="AC..."
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Auth Token</label>
                <input 
                  type="password" 
                  value={twilioConfig.authToken}
                  onChange={(e) => setTwilioConfig({...twilioConfig, authToken: e.target.value})}
                  className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-sm text-white focus:border-blue-500 outline-none"
                  placeholder="Auth Token"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">From Number</label>
                <input 
                  type="text" 
                  value={twilioConfig.fromNumber}
                  onChange={(e) => setTwilioConfig({...twilioConfig, fromNumber: e.target.value})}
                  className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-sm text-white focus:border-blue-500 outline-none"
                  placeholder="+1234567890"
                />
              </div>
              
              <div className="pt-4 border-t border-slate-800">
                <label className="block text-xs font-medium text-slate-400 mb-1 flex items-center gap-2">
                  <Globe size={12} /> Webhook URL (Ngrok)
                </label>
                <input 
                  type="text" 
                  value={twilioConfig.webhookUrl || ''}
                  onChange={(e) => setTwilioConfig({...twilioConfig, webhookUrl: e.target.value})}
                  className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-sm text-white focus:border-blue-500 outline-none"
                  placeholder="https://.../incoming"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                   Cole a URL HTTPS do Ngrok. Nós adicionamos <code>/incoming</code> automaticamente.
                </p>
              </div>

              <button 
                onClick={saveSettings}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white py-2 rounded font-medium text-sm transition mt-2"
              >
                Salvar Credenciais
              </button>
            </div>
          </div>
        )}
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
            <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-4xl h-[90vh] flex flex-col shadow-2xl">
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

export default PhoneInterface;
