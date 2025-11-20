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
    // Check for API key
    const checkKey = async () => {
        if (!(window as any).aistudio) {
            // Fallback if running outside standard ai studio environment shim
        }

        try {
             if ((window as any).aistudio && !(await (window as any).aistudio.hasSelectedApiKey())) {
                await (window as any).aistudio.openSelectKey();
            }
        } catch (e) {
            console.warn("AI Studio Key selection skipped/failed", e);
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
    if (serviceRef.current) {
      serviceRef.current.stop();
    }
    onClose(logs);
  };

  useEffect(() => {
    if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  // Visualizer rings
  const ringScale = 1 + (volume * 2); 

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-4xl h-[80vh] flex overflow-hidden flex-col md:flex-row">
        
        {/* Left Side: Visualizer */}
        <div className="flex-1 flex flex-col items-center justify-center bg-gradient-to-b from-slate-900 to-slate-950 relative p-8 border-b md:border-b-0 md:border-r border-slate-800">
           <button onClick={() => onClose(logs)} className="absolute top-4 left-4 text-slate-500 hover:text-white">
             <X size={24} />
           </button>

           <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-white mb-2">{config.name}</h2>
              <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                status === 'connected' ? 'bg-green-500/20 text-green-400' :
                status === 'connecting' ? 'bg-yellow-500/20 text-yellow-400' :
                'bg-red-500/20 text-red-400'
              }`}>
                {status === 'connected' ? 'Live' : status}
              </span>
           </div>

           {/* Orb Visualizer */}
           <div className="relative w-48 h-48 flex items-center justify-center mb-12">
              <div 
                className="absolute inset-0 bg-blue-500/20 rounded-full blur-xl transition-transform duration-75"
                style={{ transform: `scale(${ringScale})` }}
              ></div>
              <div 
                className="absolute inset-0 bg-blue-400/10 rounded-full transition-transform duration-100"
                style={{ transform: `scale(${ringScale * 0.8})` }}
              ></div>
               <div className="w-32 h-32 bg-gradient-to-tr from-blue-600 to-indigo-500 rounded-full flex items-center justify-center shadow-inner shadow-white/20 z-10 relative overflow-hidden">
                   <div className="absolute inset-0 opacity-50 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] mix-blend-overlay"></div>
               </div>
           </div>

           <div className="flex gap-6">
              <button 
                onClick={() => setIsMicMuted(!isMicMuted)}
                className={`p-4 rounded-full transition ${isMicMuted ? 'bg-red-500/20 text-red-400' : 'bg-slate-800 text-white hover:bg-slate-700'}`}
              >
                 {isMicMuted ? <MicOff size={24} /> : <Mic size={24} />}
              </button>
              <button 
                onClick={handleHangup}
                className="p-4 rounded-full bg-red-600 text-white hover:bg-red-700 transition shadow-lg shadow-red-900/30"
              >
                 <PhoneOff size={24} />
              </button>
           </div>
        </div>

        {/* Right Side: Real-time Logs */}
        <div className="w-full md:w-96 bg-slate-950 flex flex-col">
           <div className="p-4 border-b border-slate-800 bg-slate-900/50">
              <h3 className="font-semibold text-slate-200">Live Transcripts</h3>
           </div>
           <div className="flex-1 overflow-y-auto p-4 space-y-4" ref={scrollRef}>
              {logs.length === 0 && (
                <div className="text-center text-slate-600 mt-10 text-sm">
                    Waiting for conversation to start...
                </div>
              )}
              {logs.map((log) => (
                  <div key={log.id} className={`flex flex-col ${log.role === 'user' ? 'items-end' : 'items-start'}`}>
                      <span className="text-[10px] uppercase text-slate-500 mb-1 font-bold tracking-wider">{log.role}</span>
                      <div className={`p-3 rounded-lg text-sm max-w-[90%] ${
                          log.role === 'user' 
                          ? 'bg-blue-600/20 text-blue-100 border border-blue-500/30 rounded-tr-none' 
                          : log.role === 'system'
                          ? 'bg-slate-800 text-slate-400 border border-slate-700 w-full text-center italic'
                          : 'bg-slate-800 text-slate-200 border border-slate-700 rounded-tl-none'
                      }`}>
                          {log.message}
                      </div>
                  </div>
              ))}
           </div>
        </div>

      </div>
    </div>
  );
};

export default ActiveCallModal;