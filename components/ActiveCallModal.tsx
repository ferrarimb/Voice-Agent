import React, { useEffect, useRef, useState } from 'react';
import { X, Mic, MicOff, PhoneOff } from 'lucide-react';
import { AssistantConfig, LogEntry, ConnectionStatus } from '../types';
import { GeminiLiveService } from '../services/geminiLive';

interface ActiveCallModalProps {
  config: AssistantConfig;
  onClose: (logs: LogEntry[]) => void;
}

const ActiveCallModal: React.FC<ActiveCallModalProps> = ({ config, onClose }) => {
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [volume, setVolume] = useState(0);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const serviceRef = useRef<GeminiLiveService | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const checkKey = async () => {
        if (!(window as any).aistudio) { }

        try {
             if ((window as any).aistudio && !(await (window as any).aistudio.hasSelectedApiKey())) {
                await (window as any).aistudio.openSelectKey();
            }
        } catch (e) {
            console.warn("AI Studio Key selection skipped", e);
        }
        initService();
    }
    checkKey();
    
    return () => {
      if (serviceRef.current) {
        serviceRef.current.stop();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const initService = async () => {
      const key = process.env.API_KEY || ''; 
      serviceRef.current = new GeminiLiveService(
          (role, message) => {
              setLogs(prev => [...prev, { id: Date.now().toString(), timestamp: new Date(), role, message }]);
          },
          (newStatus) => setStatus(newStatus),
          (vol) => setVolume(vol)
      );
      await serviceRef.current.connect(key, config);
  };

  const handleHangup = () => {
    if (serviceRef.current) serviceRef.current.stop();
    onClose(logs);
  };

  useEffect(() => {
    if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  // Visualizer Math
  const scale = 1 + Math.min(volume * 6, 0.8); 
  const glowOpacity = 0.4 + Math.min(volume * 4, 0.6);

  // Get last message for display
  const lastMsg = logs.length > 0 ? logs[logs.length - 1] : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Immersive Dark Glass Background */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-3xl transition-all duration-700 animate-in fade-in"></div>

      {/* Main Container */}
      <div className="relative w-full h-full md:max-w-[480px] md:h-[800px] flex flex-col items-center justify-between p-10 z-10 md:rounded-[3rem] md:border md:border-white/10 md:shadow-2xl md:shadow-black/80 md:bg-black/40 overflow-hidden">
        
        {/* Header */}
        <div className="w-full flex justify-between items-center text-white/50 relative z-20">
           <div className="flex items-center gap-3 glass-panel px-4 py-2 rounded-full">
               <span className={`w-2 h-2 rounded-full ${status === 'connected' ? 'bg-emerald-400 shadow-[0_0_10px_#34d399]' : 'bg-yellow-400 animate-pulse'}`}></span>
               <span className="text-[10px] font-bold tracking-widest uppercase">{status === 'connected' ? 'Live Call' : status}</span>
           </div>
           <button onClick={() => onClose(logs)} className="hover:text-white transition p-3 rounded-full hover:bg-white/10 glass-panel">
               <X size={20} />
           </button>
        </div>

        {/* Central Orb (Siri Style) */}
        <div className="relative flex-1 w-full flex flex-col items-center justify-center min-h-[400px]">
           
           {/* The Orb */}
           <div className="relative w-64 h-64 flex items-center justify-center">
              {/* Outer Glows */}
              <div 
                className="absolute inset-0 rounded-full bg-gradient-to-r from-blue-600 via-indigo-500 to-purple-600 blur-[80px] transition-all duration-100 ease-out will-change-transform"
                style={{ opacity: glowOpacity, transform: `scale(${scale * 1.2})` }}
              />
              <div 
                className="absolute inset-0 rounded-full bg-gradient-to-t from-cyan-400 to-blue-600 blur-[40px] mix-blend-screen transition-all duration-100 ease-out will-change-transform"
                style={{ opacity: 0.8, transform: `scale(${scale})` }}
              />
              {/* Core */}
              <div className="relative w-56 h-56 bg-black rounded-full flex items-center justify-center z-10 shadow-[inset_0_0_60px_rgba(255,255,255,0.2)] overflow-hidden">
                   <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent opacity-50"></div>
                   <div className="w-full h-full rounded-full bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-30 mix-blend-overlay"></div>
                   {/* Inner spinning ring */}
                   <div className="absolute inset-0 rounded-full border border-white/10 animate-[spin_10s_linear_infinite]"></div>
              </div>
           </div>

           {/* Dynamic Text Output (Subtitle style) */}
           <div className="mt-16 min-h-[100px] w-full flex items-center justify-center px-4">
              {lastMsg ? (
                  <p className={`text-center font-medium text-xl leading-relaxed transition-all duration-300 animate-in slide-in-from-bottom-4 ${lastMsg.role === 'user' ? 'text-white' : 'text-transparent bg-clip-text bg-gradient-to-r from-blue-200 to-purple-200'}`}>
                      "{lastMsg.message}"
                  </p>
              ) : (
                  <p className="text-white/30 text-sm animate-pulse font-medium tracking-widest uppercase">Listening...</p>
              )}
           </div>

        </div>

        {/* Controls */}
        <div className="w-full flex justify-center gap-10 items-center pb-8 md:pb-4 relative z-20">
            <button 
                onClick={() => setIsMicMuted(!isMicMuted)}
                className={`w-20 h-20 rounded-full flex items-center justify-center backdrop-blur-md transition-all duration-300 border border-white/10 shadow-lg ${isMicMuted ? 'bg-white text-black scale-105' : 'bg-white/5 text-white hover:bg-white/15'}`}
            >
                {isMicMuted ? <MicOff size={28} /> : <Mic size={28} />}
            </button>
            <button 
                onClick={handleHangup}
                className="w-24 h-24 rounded-full bg-red-500 text-white flex items-center justify-center shadow-[0_0_40px_rgba(239,68,68,0.4)] hover:scale-105 active:scale-95 transition-all duration-300 border border-red-400"
            >
                <PhoneOff size={36} fill="currentColor" />
            </button>
        </div>

        {/* Hidden Log Saver (functional) */}
        <div ref={scrollRef} className="hidden"></div>
      </div>
    </div>
  );
};

export default ActiveCallModal;