
import React, { useState } from 'react';
import { Zap, User, Phone, Clock, AlertTriangle, Play, CheckCircle2, Webhook, Copy } from 'lucide-react';
import { TwilioConfig, CallLogEntry } from '../types';

interface SpeedDialInterfaceProps {
  onCallLog: (log: CallLogEntry) => void;
  n8nWebhookUrl?: string;
  twilioConfig: TwilioConfig;
}

const SpeedDialInterface: React.FC<SpeedDialInterfaceProps> = ({ onCallLog, n8nWebhookUrl, twilioConfig }) => {
  const [lead, setLead] = useState({ name: '', phone: '', context: 'Imóvel Centro' });
  const [sdrPhone, setSdrPhone] = useState(twilioConfig.fromNumber || '');
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error', msg: string } | null>(null);

  // Determinar a URL base do webhook com base na configuração do Ngrok
  let webhookBaseUrl = 'https://seu-ngrok.ngrok-free.app';
  if (twilioConfig.webhookUrl) {
      try {
          // Extrai a origem se for uma URL completa
          webhookBaseUrl = new URL(twilioConfig.webhookUrl).origin;
      } catch (e) {
          // Se for inválido, usa o valor bruto como fallback se parecer uma URL
          if(twilioConfig.webhookUrl.startsWith('http')) {
             webhookBaseUrl = twilioConfig.webhookUrl;
          }
      }
  }
  
  const webhookEndpoint = `${webhookBaseUrl}/webhook/speed-dial`;

  const copyToClipboard = (text: string) => {
      navigator.clipboard.writeText(text);
      setStatus({ type: 'success', msg: 'Copiado para a área de transferência!' });
      setTimeout(() => setStatus(null), 2000);
  };

  const handleTrigger = async () => {
    console.log("[Client DEBUG] Botão Disparar Pressionado");
    
    if (!twilioConfig || !twilioConfig.accountSid) {
      setStatus({ type: 'error', msg: 'Please configure Twilio credentials in Settings first.' });
      return;
    }
    if (!twilioConfig.webhookUrl) {
      setStatus({ type: 'error', msg: 'Webhook URL (Ngrok) is required in Settings.' });
      return;
    }

    setIsLoading(true);
    setStatus(null);

    // 1. Calcular Base URL de forma Robusta (usando classe URL)
    let backendUrl = 'http://localhost:5000/trigger-call';
    let originUrl = '';

    try {
        // Tenta extrair a origem (protocolo + dominio) da URL salva
        const urlObj = new URL(twilioConfig.webhookUrl);
        originUrl = urlObj.origin; 
        backendUrl = `${originUrl}/trigger-call`;
    } catch (e) {
        console.warn("Invalid Webhook URL format", e);
        if (twilioConfig.webhookUrl.includes('ngrok')) {
            backendUrl = `${twilioConfig.webhookUrl}/trigger-call`;
        }
    }

    const payload = {
      lead_name: lead.name,
      lead_phone: lead.phone,
      sdr_phone: sdrPhone,
      horario: lead.context,
      n8n_url: n8nWebhookUrl, 
      twilio_config: {
        accountSid: twilioConfig.accountSid,
        authToken: twilioConfig.authToken,
        fromNumber: twilioConfig.fromNumber,
        baseUrl: originUrl 
      }
    };

    console.log(`[Client DEBUG] Fetching: ${backendUrl}`);

    try {
      const response = await fetch(backendUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      const data = await response.json();

      if (data.success) {
        setStatus({ type: 'success', msg: `Chamada Iniciada! SID: ${data.sid}` });
        onCallLog({
           id: Date.now().toString(),
           timestamp: new Date().toISOString(),
           type: 'pstn',
           status: 'success',
           assistantName: 'Speed Dial Bridge',
           to: lead.phone,
           from: sdrPhone,
           errorMessage: 'Bridge Initiated'
        });
      } else {
        setStatus({ type: 'error', msg: data.error || 'Failed to trigger call.' });
      }
    } catch (e: any) {
      console.error("[Client DEBUG] Erro no Fetch:", e);
      setStatus({ 
        type: 'error', 
        msg: `Erro ao conectar no servidor (${backendUrl}). Verifique se o Ngrok está rodando.` 
      });
    } finally {
      setIsLoading(false);
    }
  };

  // JSON Example com os campos em Português e Credenciais
  const jsonExample = `{
  "nome_lead": "Maria Souza",
  "data_agendamento": "14:00",
  "telefone_lead": "+5511999998888",
  "telefone_sdr": "${sdrPhone || '+5511999997777'}",
  "TWILIO_ACCOUNT_SID": "${twilioConfig.accountSid || 'AC...'}",
  "TWILIO_AUTH_TOKEN": "${twilioConfig.authToken ? '*******' : '...'}",
  "TWILIO_FROM_NUMBER": "${twilioConfig.fromNumber || '+1...'}"
}`;

  return (
    <div className="flex-1 bg-slate-950 h-screen overflow-y-auto">
       <header className="h-16 border-b border-slate-800 bg-slate-900/50 flex items-center justify-between px-8 sticky top-0 backdrop-blur-sm z-10">
        <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-500/10 rounded-lg text-orange-500">
                <Zap size={20} />
            </div>
            <h1 className="text-white font-semibold text-lg">Speed-to-Lead Bridge</h1>
        </div>
      </header>

      <div className="p-8 max-w-6xl mx-auto">
        
        {/* Intro Box */}
        <div className="bg-gradient-to-r from-slate-900 to-slate-800 border border-slate-700 rounded-xl p-6 mb-8 shadow-lg">
            <div className="flex justify-between items-start">
                <div>
                    <h2 className="text-white font-medium mb-2 flex items-center gap-2">
                        Como funciona?
                    </h2>
                    <p className="text-slate-400 text-sm leading-relaxed max-w-2xl">
                        Este sistema conecta seu SDR ao Lead instantaneamente.
                        1. O sistema liga primeiro para o <strong>SDR</strong>.
                        2. Verifica se é humano (ignora Caixa Postal).
                        3. "Sussurra" os dados do Lead no ouvido do SDR.
                        4. Conecta a chamada ao <strong>Lead</strong>.
                    </p>
                </div>
                <div className="hidden md:block">
                   <div className="bg-slate-950 p-4 rounded-lg border border-slate-800">
                      <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Estado Atual</span>
                      <div className="flex items-center gap-2 mt-2">
                          <div className={`w-2 h-2 rounded-full ${twilioConfig.webhookUrl ? 'bg-green-500' : 'bg-red-500'}`}></div>
                          <span className="text-sm text-slate-300">{twilioConfig.webhookUrl ? 'Ngrok Configurado' : 'Ngrok Pendente'}</span>
                      </div>
                   </div>
                </div>
            </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Form Section */}
            <div className="space-y-6">
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
                    <h3 className="text-slate-300 font-medium border-b border-slate-800 pb-4 mb-4">Teste Manual (Frontend)</h3>
                    
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <label className="text-xs font-medium text-slate-400">Nome do Lead</label>
                            <div className="relative">
                                <User className="absolute left-3 top-2.5 text-slate-500" size={16} />
                                <input 
                                    type="text" 
                                    className="w-full bg-slate-950 border border-slate-700 rounded-lg py-2 pl-10 pr-4 text-slate-200 outline-none focus:border-orange-500 transition"
                                    placeholder="Ex: João Silva"
                                    value={lead.name}
                                    onChange={(e) => setLead({...lead, name: e.target.value})}
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-medium text-slate-400">Telefone do Lead</label>
                            <div className="relative">
                                <Phone className="absolute left-3 top-2.5 text-slate-500" size={16} />
                                <input 
                                    type="text" 
                                    className="w-full bg-slate-950 border border-slate-700 rounded-lg py-2 pl-10 pr-4 text-slate-200 outline-none focus:border-orange-500 transition"
                                    placeholder="+55..."
                                    value={lead.phone}
                                    onChange={(e) => setLead({...lead, phone: e.target.value})}
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-medium text-slate-400">Interesse / Horário</label>
                            <div className="relative">
                                <Clock className="absolute left-3 top-2.5 text-slate-500" size={16} />
                                <input 
                                    type="text" 
                                    className="w-full bg-slate-950 border border-slate-700 rounded-lg py-2 pl-10 pr-4 text-slate-200 outline-none focus:border-orange-500 transition"
                                    placeholder="Ex: 15:30"
                                    value={lead.context}
                                    onChange={(e) => setLead({...lead, context: e.target.value})}
                                />
                            </div>
                        </div>

                        <div className="pt-2">
                            <label className="text-xs font-medium text-slate-400 block mb-2">Telefone do SDR (Você)</label>
                            <div className="relative">
                                <Phone className="absolute left-3 top-2.5 text-slate-500" size={16} />
                                <input 
                                    type="text" 
                                    className="w-full bg-slate-950 border border-slate-700 rounded-lg py-2 pl-10 pr-4 text-slate-200 outline-none focus:border-blue-500 transition"
                                    placeholder="+55..."
                                    value={sdrPhone}
                                    onChange={(e) => setSdrPhone(e.target.value)}
                                />
                            </div>
                        </div>
                    </div>

                    <div className="mt-6 space-y-4">
                        {status && (
                            <div className={`p-3 rounded-lg text-sm flex items-center gap-2 ${status.type === 'success' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                                {status.type === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
                                {status.msg}
                            </div>
                        )}

                        <button 
                            onClick={handleTrigger}
                            disabled={isLoading || !lead.phone || !sdrPhone}
                            className="w-full py-4 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-lg shadow-lg shadow-orange-900/20 transition flex items-center justify-center gap-2"
                        >
                            {isLoading ? (
                                <span className="animate-pulse">Iniciando...</span>
                            ) : (
                                <>
                                    <Play size={20} fill="currentColor" /> Disparar Bridge Manual
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>

            {/* Webhook Info Panel */}
            <div className="space-y-6">
                 <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 h-full border-l-4 border-l-blue-500">
                    <div className="flex items-center gap-2 mb-4 pb-4 border-b border-slate-800 text-blue-400">
                        <Webhook size={20} />
                        <h3 className="font-medium">Integração via Webhook</h3>
                    </div>

                    <p className="text-sm text-slate-400 mb-6">
                        Para automatizar (ex: n8n, Zapier), envie uma requisição POST com o JSON abaixo.
                        As credenciais da Twilio podem ser enviadas no corpo para maior flexibilidade.
                    </p>

                    <div className="space-y-6">
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">URL do Endpoint</label>
                            <div className="flex gap-2">
                                <span className="bg-green-500/20 text-green-400 px-3 py-2 rounded text-sm font-mono border border-green-500/30 font-bold">POST</span>
                                <div className="flex-1 bg-black rounded border border-slate-700 flex items-center justify-between pl-3 pr-1 py-1">
                                    <code className="text-xs text-slate-300 truncate font-mono">{webhookEndpoint}</code>
                                    <button onClick={() => copyToClipboard(webhookEndpoint)} className="p-1.5 hover:bg-slate-800 rounded text-slate-500 hover:text-white transition">
                                        <Copy size={14} />
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Formato do JSON</label>
                            <div className="bg-black rounded border border-slate-700 p-4 relative group">
                                <button onClick={() => copyToClipboard(jsonExample)} className="absolute top-2 right-2 p-1.5 bg-slate-800 rounded text-slate-400 opacity-0 group-hover:opacity-100 transition hover:text-white">
                                    <Copy size={14} />
                                </button>
                                <pre className="text-xs text-blue-300 font-mono leading-relaxed whitespace-pre-wrap">
                                    {jsonExample}
                                </pre>
                            </div>
                            <p className="text-[10px] text-slate-500 mt-2">
                                * Se você não enviar as chaves TWILIO_*, o sistema tentará usar as configuradas no arquivo .env do servidor.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>

      </div>
    </div>
  );
};

export default SpeedDialInterface;
