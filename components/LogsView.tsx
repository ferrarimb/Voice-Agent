import React, { useState } from 'react';
import { CallLogEntry, LogEntry } from '../types';
import { PhoneOutgoing, AlertCircle, CheckCircle2, Clock, Globe, FileText, X } from 'lucide-react';

interface LogsViewProps {
  logs: CallLogEntry[];
}

const LogsView: React.FC<LogsViewProps> = ({ logs }) => {
  const [selectedLog, setSelectedLog] = useState<CallLogEntry | null>(null);

  return (
    <div className="flex-1 bg-slate-950 h-screen overflow-y-auto relative">
      <header className="h-16 border-b border-slate-800 bg-slate-900/50 flex items-center justify-between px-8 sticky top-0 backdrop-blur-sm z-10">
        <h1 className="text-white font-semibold text-lg">Call Logs</h1>
        <div className="text-xs text-slate-400">
          {logs.length} Total Calls
        </div>
      </header>

      <div className="p-8 max-w-6xl mx-auto">
        {logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-slate-500 border border-dashed border-slate-800 rounded-xl">
             <Clock size={48} className="mb-4 opacity-20" />
             <p>No calls have been made yet.</p>
          </div>
        ) : (
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-800/50 border-b border-slate-800 text-xs uppercase text-slate-400 tracking-wider">
                  <th className="px-6 py-4 font-medium">Type</th>
                  <th className="px-6 py-4 font-medium">Status</th>
                  <th className="px-6 py-4 font-medium">Time</th>
                  <th className="px-6 py-4 font-medium">Assistant</th>
                  <th className="px-6 py-4 font-medium">Target</th>
                  <th className="px-6 py-4 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-800/30 transition-colors text-sm text-slate-300">
                     <td className="px-6 py-4">
                         {log.type === 'pstn' ? (
                            <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-indigo-500/10 text-indigo-400 text-xs font-medium border border-indigo-500/20">
                                <PhoneOutgoing size={12} /> PSTN
                            </span>
                         ) : (
                            <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-sky-500/10 text-sky-400 text-xs font-medium border border-sky-500/20">
                                <Globe size={12} /> Web
                            </span>
                         )}
                     </td>
                    <td className="px-6 py-4">
                      {log.status === 'success' ? (
                        <div className="flex items-center gap-2 text-green-400">
                           <CheckCircle2 size={16} />
                           <span>Success</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-red-400">
                           <AlertCircle size={16} />
                           <span>Failed</span>
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-slate-400 font-mono text-xs">
                      {new Date(log.timestamp).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 font-medium text-white">
                      {log.assistantName}
                    </td>
                    <td className="px-6 py-4 font-mono text-xs text-slate-400">
                      {log.type === 'pstn' ? (
                          <div className="flex flex-col">
                            <span className="text-slate-300">{log.to}</span>
                            <span className="text-[10px] opacity-60">From: {log.from}</span>
                          </div>
                      ) : (
                          <span className="text-slate-500 italic">Browser Demo</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                       {log.transcript && log.transcript.length > 0 ? (
                           <button 
                             onClick={() => setSelectedLog(log)}
                             className="text-blue-400 hover:text-blue-300 hover:underline text-xs flex items-center gap-1 justify-end w-full"
                           >
                             <FileText size={14} /> View Transcript
                           </button>
                       ) : log.errorMessage ? (
                         <span className="text-red-400 truncate max-w-[150px] block" title={log.errorMessage}>
                           {log.errorMessage}
                         </span>
                       ) : (
                         <span className="text-slate-600">-</span>
                       )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Transcript Modal */}
      {selectedLog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
             <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl">
                 <div className="flex items-center justify-between p-4 border-b border-slate-800">
                     <div>
                        <h3 className="text-white font-semibold">Conversation Transcript</h3>
                        <div className="text-xs text-slate-400 mt-1">{new Date(selectedLog.timestamp).toLocaleString()} • {selectedLog.assistantName}</div>
                     </div>
                     <button onClick={() => setSelectedLog(null)} className="text-slate-500 hover:text-white">
                         <X size={20} />
                     </button>
                 </div>
                 <div className="flex-1 overflow-y-auto p-6 space-y-4">
                     {selectedLog.transcript?.map((entry) => (
                         <div key={entry.id} className={`flex flex-col ${entry.role === 'user' ? 'items-end' : 'items-start'}`}>
                             <span className="text-[10px] uppercase text-slate-500 mb-1 font-bold tracking-wider">{entry.role}</span>
                             <div className={`p-3 rounded-lg text-sm max-w-[85%] ${
                                  entry.role === 'user' 
                                  ? 'bg-blue-600/20 text-blue-100 border border-blue-500/30 rounded-tr-none' 
                                  : entry.role === 'system'
                                  ? 'bg-slate-800 text-slate-400 border border-slate-700 w-full text-center italic'
                                  : 'bg-slate-800 text-slate-200 border border-slate-700 rounded-tl-none'
                             }`}>
                                  {entry.message}
                             </div>
                         </div>
                     ))}
                 </div>
                 <div className="p-4 border-t border-slate-800 bg-slate-900/50 text-center">
                    <button onClick={() => setSelectedLog(null)} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-sm rounded-md transition">
                        Close
                    </button>
                 </div>
             </div>
          </div>
      )}
    </div>
  );
};

export default LogsView;