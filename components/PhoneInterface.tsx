
import React, { useState } from 'react';
import { Phone, Delete, Loader2 } from 'lucide-react';
import { TwilioConfig, AssistantConfig, CallLogEntry } from '../types';
import { makeTwilioCall } from '../services/twilioService';

interface PhoneInterfaceProps {
  assistantConfig: AssistantConfig;
  twilioConfig: TwilioConfig;
  onCallLog: (log: CallLogEntry) => void;
  n8nWebhookUrl?: string;
}

const PhoneInterface: React.FC<PhoneInterfaceProps> = ({ assistantConfig, twilioConfig, onCallLog, n8nWebhookUrl }) => {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [isCalling, setIsCalling] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{type: 'success'|'error', text: string} | null>(null);

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
        <div className="text-xs text-slate-500">
             {twilioConfig.webhookUrl 
                 ? "Backend Connected" 
                 : "Demo Mode"}
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
               Calling as <span className="text-blue-400">{assistantConfig.name}</span>
             </p>
          </div>
        </div>

      </div>
    </div>
  );
};

export default PhoneInterface;
