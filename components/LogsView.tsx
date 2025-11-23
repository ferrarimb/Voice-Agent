import React, { useState } from 'react';
import { CallLogEntry } from '../types';
import { PhoneOutgoing, AlertCircle, CheckCircle2, Clock, Globe, FileText, X, ArrowRight } from 'lucide-react';

interface LogsViewProps {
  logs: CallLogEntry[];
}

const LogsView: React.FC<LogsViewProps> = ({ logs }) => {
  const [selectedLog, setSelectedLog] = useState<CallLogEntry | null>(null);

  return (
    <div className="flex-1 h-screen overflow-y-auto custom-scrollbar">
      <header className="h-24 flex items-center justify-between px-10 sticky top-0 z-20 backdrop-blur-xl bg-transparent border-b border-white/5">
        <div>
            <h1 className="text-white font-semibold text-2xl tracking-tight text-glow">Call Logs</h1>
            <p className="text-white/30 text-xs mt-1 uppercase tracking-widest font-medium">History & Analytics</p>
        </div>
        <div className="text-xs px-4 py-2 rounded-full glass-panel text-white/60 font-medium">
          {logs.length} Sessions
        </div>
      </header>

      <div className="p-10 max-w-7xl mx-auto pb-40">
        {logs.length === 0 ? (
          <div className="glass-panel flex flex-col items-center justify-center h-80 text-white/20 rounded-[2rem]">
             <div className="p-6 rounded-full bg-white/5 mb-6">
                <Clock size={48} className="opacity-50" />
             </div>
             <p className="text-lg font-light">No call history available yet.</p>
          </div>
        ) : (
          <div className="glass-panel rounded-[2rem] overflow-hidden border-white/10">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/5 text-[10px] uppercase text-white/30 tracking-widest font-bold bg-white/[0.02]">
                  <th className="px-8 py-6">Channel</th>
                  <th className="px-6 py-6">Status</th>
                  <th className="px-6 py-6">Time</th>
                  <th className="px-6 py-6">Assistant</th>
                  <th className="px-6 py-6">Destination</th>
                  <th className="px-8 py-6 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-white/[0.03] transition-colors group">
                     <td className="px-8 py-5">
                         {log.type === 'pstn' ? (
                            <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-orange-500/10 text-orange-400 border border-orange-500/20">
                                <PhoneOutgoing size={16} />
                            </div>
                         ) : (
                            <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
                                <Globe size={16} />
                            </div>
                         )}
                     </td>
                    <td className="px-6 py-5">
                      {log.status === 'success' ? (
                        <div className="flex items-center gap-2 text-emerald-400 text-xs font-medium bg-emerald-500/10 px-3 py-1.5 rounded-full w-fit border border-emerald-500/10 shadow-[0_0_10px_rgba(16,185,129,0.1)]">
                           <CheckCircle2 size={12} />
                           <span>Success</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-red-400 text-xs font-medium bg-red-500/10 px-3 py-1.5 rounded-full w-fit border border-red-500/10">
                           <AlertCircle size={12} />
                           <span>Failed</span>
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-5 text-white/50 font-medium text-xs">
                      {new Date(log.timestamp).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}
                    </td>
                    <td className="px-6 py-5 font-medium text-white text-sm">
                      {log.assistantName}
                    </td>
                    <td className="px-6 py-5 font-mono text-xs text-white/50">
                      {log.type === 'pstn' ? log.to : 'Web Browser'}
                    </td>
                    <td className="px-8 py-5 text-right">
                       <button 
                         onClick={() => setSelectedLog(log)}
                         className="text-white/30 hover:text-white transition group-hover:translate-x-1 duration-300"
                         title="View Transcript"
                       >
                         <ArrowRight size={20} />
                       </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Transcript Glass Modal */}
      {selectedLog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xl p-6 animate-in fade-in duration-300">
             <div className="glass-panel w-full max-w-3xl max-h-[85vh] flex flex-col rounded-[2.5rem] shadow-2xl overflow-hidden border border-white/10 bg-[#0a0a0a]/80">
                 <div className="flex items-center justify-between p-8 border-b border-white/5">
                     <div className="flex items-center gap-4">
                        <div className="p-3 bg-white/5 rounded-2xl">
                             <FileText size={20} className="text-white/70" />
                        </div>
                        <div>
                            <h3 className="text-white font-medium text-lg">Transcript</h3>
                            <div className="text-xs text-white/40 mt-1 uppercase tracking-wide">{selectedLog.assistantName} • {new Date(selectedLog.timestamp).toLocaleTimeString()}</div>
                        </div>
                     </div>
                     <button onClick={() => setSelectedLog(null)} className="w-10 h-10 rounded-full flex items-center justify-center bg-white/5 hover:bg-white/10 text-white/40 hover:text-white transition">
                         <X size={20} />
                     </button>
                 </div>
                 <div className="flex-1 overflow-y-auto p-8 space-y-6 custom-scrollbar">
                     {selectedLog.transcript?.map((entry, idx) => (
                         <div key={idx} className={`flex flex-col ${entry.role === 'user' ? 'items-end' : 'items-start'}`}>
                             <span className="text-[10px] uppercase text-white/20 mb-2 font-bold tracking-widest px-1">{entry.role}</span>
                             <div className={`p-5 rounded-2xl text-sm leading-relaxed max-w-[80%] backdrop-blur-sm border border-white/5 shadow-lg ${
                                  entry.role === 'user' 
                                  ? 'bg-blue-600/20 text-blue-50 rounded-tr-sm' 
                                  : 'bg-white/5 text-slate-200 rounded-tl-sm'
                             }`}>
                                  {entry.message}
                             </div>
                         </div>
                     ))}
                     {(!selectedLog.transcript || selectedLog.transcript.length === 0) && (
                         <div className="flex flex-col items-center justify-center h-40 opacity-30">
                            <p className="text-white italic">No audio transcript captured for this session.</p>
                         </div>
                     )}
                 </div>
             </div>
          </div>
      )}
    </div>
  );
};

export default LogsView;