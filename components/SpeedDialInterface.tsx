import React, { useState } from 'react';
import { User, Phone, Clock, AlertTriangle, Play, CheckCircle2, Loader2 } from 'lucide-react';
import { TwilioConfig, CallLogEntry } from '../types';

export interface SpeedDialState {
  lead: { name: string; phone: string; context: string; };
  sdrPhone: string;
}

interface SpeedDialInterfaceProps {
  onCallLog: (log: CallLogEntry) => void;
  n8nWebhookUrl?: string;
  twilioConfig: TwilioConfig;
  savedState?: SpeedDialState;
  onStateChange?: (state: SpeedDialState) => void;
}

// Custom Bridge Icon
const BridgeIcon = ({ size = 24, className = "" }: { size?: number, className?: string }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="1.5" 
    strokeLinecap="round" 
    strokeLinejoin="round"
    className={className}
  >
    <path d="M3 21h18" />
    <path d="M6 21V7" />
    <path d="M18 21V7" />
    <path d="M6 7Q12 16 18 7" />
    <path d="M9 10v11" />
    <path d="M12 12v9" />
    <path d="M15 10v11" />
  </svg>
);

const SpeedDialInterface: React.FC<SpeedDialInterfaceProps> = ({ 
  onCallLog, 
  n8nWebhookUrl, 
  twilioConfig,
  savedState,
  onStateChange
}) => {
  const [localLead, setLocalLead] = useState({ name: '', phone: '', context: 'Imóvel Centro' });
  const [localSdrPhone, setLocalSdrPhone] = useState(twilioConfig.fromNumber || '');
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error', msg: string } | null>(null);

  // Use props if available, otherwise local state
  const lead = savedState ? savedState.lead : localLead;
  const sdrPhone = savedState ? savedState.sdrPhone : localSdrPhone;

  const updateLead = (newLead: typeof lead) => {
    if (onStateChange && savedState) {
      onStateChange({ ...savedState, lead: newLead });
    } else {
      setLocalLead(newLead);
    }
  };

  const updateSdrPhone = (newPhone: string) => {
    if (onStateChange && savedState) {
      onStateChange({ ...savedState, sdrPhone: newPhone });
    } else {
      setLocalSdrPhone(newPhone);
    }
  };

  const handleTrigger = async () => {
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

    let backendUrl = 'http://localhost:5000/trigger-call';
    let originUrl = '';

    try {
        const urlObj = new URL(twilioConfig.webhookUrl);
        originUrl = urlObj.origin; 
        backendUrl = `${originUrl}/trigger-call`;
    } catch (e) {
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
           assistantName: 'Ponte SDR',
           to: lead.phone,
           from: sdrPhone,
           errorMessage: 'Ponte Iniciada'
        });
      } else {
        setStatus({ type: 'error', msg: data.error || 'Failed to trigger call.' });
      }
    } catch (e: any) {
      setStatus({ 
        type: 'error', 
        msg: `Erro ao conectar no servidor. Verifique o console.` 
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex-1 h-screen overflow-y-auto custom-scrollbar">
       <header className="h-24 flex items-center justify-between px-10 sticky top-0 z-20 backdrop-blur-xl bg-transparent border-b border-white/5">
        <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-orange-500/20 flex items-center justify-center border border-orange-500/30 shadow-[0_0_15px_rgba(249,115,22,0.3)]">
                <BridgeIcon size={20} className="text-orange-400" />
            </div>
            <h1 className="text-white font-semibold text-2xl tracking-tight text-glow">Ponte SDR</h1>
        </div>
      </header>

      <div className="p-10 max-w-6xl mx-auto space-y-8">
        
        {/* Intro Glass Box */}
        <div className="glass-panel rounded-[2rem] p-8 relative overflow-hidden">
            {/* Background Accent */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-orange-500/10 rounded-full blur-[80px] -translate-y-1/2 translate-x-1/2 pointer-events-none"></div>

            <div className="flex justify-between items-start relative z-10">
                <div>
                    <h2 className="text-white text-xl font-medium mb-3 flex items-center gap-2">
                        Speed-to-Lead
                    </h2>
                    <p className="text-white/60 text-sm leading-relaxed max-w-2xl">
                        Este sistema conecta seu SDR ao Lead instantaneamente.
                        <br/><br/>
                        1. O sistema liga primeiro para o <strong className="text-white">SDR</strong>.
                        <br/>
                        2. "Sussurra" os dados do Lead no ouvido do SDR.
                        <br/>
                        3. Conecta a chamada ao <strong className="text-white">Lead</strong>.
                    </p>
                </div>
                <div className="hidden md:block">
                   <div className="glass-panel px-6 py-4 rounded-xl flex items-center gap-4">
                      <div className={`w-3 h-3 rounded-full shadow-[0_0_10px_currentColor] ${twilioConfig.webhookUrl ? 'bg-emerald-500 text-emerald-500' : 'bg-red-500 text-red-500'}`}></div>
                      <div>
                        <span className="block text-[10px] font-bold text-white/40 uppercase tracking-widest">Tunnel Status</span>
                        <span className="text-sm font-medium text-white">{twilioConfig.webhookUrl ? 'Active' : 'Disconnected'}</span>
                      </div>
                   </div>
                </div>
            </div>
        </div>

        <div className="max-w-3xl mx-auto">
            {/* Form Section */}
            <div className="glass-panel rounded-[2rem] p-10">
                <h3 className="text-white/80 font-medium border-b border-white/10 pb-6 mb-8 flex items-center gap-2">
                    <span className="w-1.5 h-6 bg-orange-500 rounded-full"></span>
                    Teste Manual (Frontend)
                </h3>
                
                <div className="space-y-6">
                    <div className="space-y-2">
                        <label className="text-xs uppercase font-bold tracking-widest text-white/30 ml-1">Nome do Lead</label>
                        <div className="relative group">
                            <User className="absolute left-4 top-3.5 text-white/30 group-focus-within:text-white/80 transition" size={18} />
                            <input 
                                type="text" 
                                className="w-full glass-input rounded-xl py-3.5 pl-12 pr-4 text-sm font-medium placeholder:text-white/20"
                                placeholder="Ex: João Silva"
                                value={lead.name}
                                onChange={(e) => updateLead({...lead, name: e.target.value})}
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs uppercase font-bold tracking-widest text-white/30 ml-1">Telefone do Lead</label>
                        <div className="relative group">
                            <Phone className="absolute left-4 top-3.5 text-white/30 group-focus-within:text-white/80 transition" size={18} />
                            <input 
                                type="text" 
                                className="w-full glass-input rounded-xl py-3.5 pl-12 pr-4 text-sm font-medium placeholder:text-white/20"
                                placeholder="+55..."
                                value={lead.phone}
                                onChange={(e) => updateLead({...lead, phone: e.target.value})}
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs uppercase font-bold tracking-widest text-white/30 ml-1">Contexto</label>
                        <div className="relative group">
                            <Clock className="absolute left-4 top-3.5 text-white/30 group-focus-within:text-white/80 transition" size={18} />
                            <input 
                                type="text" 
                                className="w-full glass-input rounded-xl py-3.5 pl-12 pr-4 text-sm font-medium placeholder:text-white/20"
                                placeholder="Ex: 15:30"
                                value={lead.context}
                                onChange={(e) => updateLead({...lead, context: e.target.value})}
                            />
                        </div>
                    </div>

                    <div className="pt-4">
                        <label className="text-xs uppercase font-bold tracking-widest text-white/30 ml-1 block mb-2">SDR (Você)</label>
                        <div className="relative group">
                            <Phone className="absolute left-4 top-3.5 text-white/30 group-focus-within:text-blue-400 transition" size={18} />
                            <input 
                                type="text" 
                                className="w-full glass-input rounded-xl py-3.5 pl-12 pr-4 text-sm font-medium placeholder:text-white/20 border-white/10 focus:border-blue-500/50"
                                placeholder="+55..."
                                value={sdrPhone}
                                onChange={(e) => updateSdrPhone(e.target.value)}
                            />
                        </div>
                    </div>
                </div>

                <div className="mt-10 space-y-4">
                    {status && (
                        <div className={`p-4 rounded-xl text-sm font-medium flex items-center gap-3 animate-in slide-in-from-top-2 ${status.type === 'success' ? 'glass-panel bg-emerald-500/10 text-emerald-300 border-emerald-500/20' : 'glass-panel bg-red-500/10 text-red-300 border-red-500/20'}`}>
                            {status.type === 'success' ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
                            {status.msg}
                        </div>
                    )}

                    <button 
                        onClick={handleTrigger}
                        disabled={isLoading || !lead.phone || !sdrPhone}
                        className="w-full py-4 glass-button bg-orange-600/20 hover:bg-orange-600/40 border-orange-500/30 text-white font-bold rounded-2xl shadow-[0_0_20px_rgba(249,115,22,0.1)] transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed group"
                    >
                        {isLoading ? (
                            <span className="flex items-center gap-2"><Loader2 className="animate-spin" size={20} /> Connecting...</span>
                        ) : (
                            <>
                                <Play size={20} fill="currentColor" className="group-hover:scale-110 transition-transform" /> Disparar Ponte Manual
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};

export default SpeedDialInterface;