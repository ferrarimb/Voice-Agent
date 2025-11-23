
import React, { useState } from 'react';
import { Zap, User, Phone, Clock, AlertTriangle, Play, CheckCircle2 } from 'lucide-react';
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
        // Tenta extrair a origem (protocolo + dominio) da URL salva, ignorando caminhos como /incoming
        const urlObj = new URL(twilioConfig.webhookUrl);
        originUrl = urlObj.origin; // ex: https://xyz.ngrok-free.dev
        backendUrl = `${originUrl}/trigger-call`;
    } catch (e) {
        console.warn("Invalid Webhook URL format", e);
        // Fallback para string simples se falhar
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

      <div className="p-8 max-w-3xl mx-auto">
        
        {/* Intro Box */}
        <div className="bg-gradient-to-r from-slate-900 to-slate-800 border border-slate-700 rounded-xl p-6 mb-8 shadow-lg">
            <h2 className="text-white font-medium mb-2 flex items-center gap-2">
                Como funciona?
            </h2>
            <p className="text-slate-400 text-sm leading-relaxed">
                Este sistema conecta seu SDR ao Lead instantaneamente.
                1. O sistema liga primeiro para o <strong>SDR</strong>.
                2. Verifica se é humano (ignora Caixa Postal).
                3. "Sussurra" os dados do Lead no ouvido do SDR.
                4. Conecta a chamada ao <strong>Lead</strong>.
            </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Form */}
            <div className="space-y-6">
                <h3 className="text-slate-300 font-medium border-b border-slate-800 pb-2">Dados do Lead</h3>
                
                <div className="space-y-2">
                    <label className="text-xs font-medium text-slate-400">Nome do Lead</label>
                    <div className="relative">
                        <User className="absolute left-3 top-2.5 text-slate-500" size={16} />
                        <input 
                            type="text" 
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg py-2 pl-10 pr-4 text-slate-200 outline-none focus:border-orange-500 transition"
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
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg py-2 pl-10 pr-4 text-slate-200 outline-none focus:border-orange-500 transition"
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
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg py-2 pl-10 pr-4 text-slate-200 outline-none focus:border-orange-500 transition"
                            placeholder="Ex: 15:30"
                            value={lead.context}
                            onChange={(e) => setLead({...lead, context: e.target.value})}
                        />
                    </div>
                </div>

                 <h3 className="text-slate-300 font-medium border-b border-slate-800 pb-2 pt-4">Configuração SDR</h3>
                 <div className="space-y-2">
                    <label className="text-xs font-medium text-slate-400">Telefone do SDR (Você)</label>
                    <div className="relative">
                        <Phone className="absolute left-3 top-2.5 text-slate-500" size={16} />
                        <input 
                            type="text" 
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg py-2 pl-10 pr-4 text-slate-200 outline-none focus:border-blue-500 transition"
                            placeholder="+55..."
                            value={sdrPhone}
                            onChange={(e) => setSdrPhone(e.target.value)}
                        />
                    </div>
                    <p className="text-[10px] text-slate-500">Puxado das configurações da Twilio.</p>
                </div>
            </div>

            {/* Action Panel */}
            <div className="flex flex-col justify-between bg-slate-900 rounded-xl p-6 border border-slate-800">
                <div>
                    <h3 className="text-white font-medium mb-4">Preview da Ação</h3>
                    <div className="space-y-4">
                        <div className="flex items-center gap-3 text-sm text-slate-400">
                            <div className="w-8 h-8 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold">1</div>
                            <span>Liga para <strong>{sdrPhone || '...'}</strong></span>
                        </div>
                        <div className="h-4 border-l border-dashed border-slate-700 ml-4"></div>
                        <div className="flex items-center gap-3 text-sm text-slate-400">
                             <div className="w-8 h-8 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center font-bold">2</div>
                             <span>IA detecta voz humana</span>
                        </div>
                        <div className="h-4 border-l border-dashed border-slate-700 ml-4"></div>
                        <div className="flex items-center gap-3 text-sm text-slate-400">
                             <div className="w-8 h-8 rounded-full bg-orange-500/20 text-orange-400 flex items-center justify-center font-bold">3</div>
                             <span>Sussurra: <em>"Novo lead {lead.name}..."</em></span>
                        </div>
                        <div className="h-4 border-l border-dashed border-slate-700 ml-4"></div>
                        <div className="flex items-center gap-3 text-sm text-slate-400">
                             <div className="w-8 h-8 rounded-full bg-green-500/20 text-green-400 flex items-center justify-center font-bold">4</div>
                             <span>Conecta com <strong>{lead.phone || '...'}</strong></span>
                        </div>
                    </div>
                </div>

                <div className="mt-8 space-y-4">
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
                                <Play size={20} fill="currentColor" /> Disparar Bridge
                            </>
                        )}
                    </button>
                    {!twilioConfig?.webhookUrl && (
                         <div className="p-3 bg-red-500/10 border border-red-500/20 rounded text-center text-xs text-red-400 mt-2">
                            ⚠️ Configure a URL do Ngrok em <strong>Configurações</strong>
                        </div>
                    )}
                </div>
            </div>
        </div>

      </div>
    </div>
  );
};

export default SpeedDialInterface;
