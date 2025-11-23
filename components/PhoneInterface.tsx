import React, { useState, useEffect } from 'react';
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
      setStatusMsg({ type: 'success', text: 'Call initiated' });
    } else {
      setStatusMsg({ type: 'error', text: 'Call failed' });
    }
  };

  // Enable Keyboard Support (Desktop)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // If the user is typing directly into the input (focused), let the browser/onChange handle it
      // to avoid double entries. We only handle global keys if the input is NOT focused.
      const isInputFocused = document.activeElement?.tagName === 'INPUT';
      
      if (isInputFocused) {
          if (e.key === 'Enter') {
              handleCall();
              (document.activeElement as HTMLElement).blur(); // Close mobile keyboard on enter
          }
          return;
      }

      // Check for digits, star, hash
      if (/^[0-9*#]$/.test(e.key)) {
          if (phoneNumber.length < 15) {
              setPhoneNumber(prev => prev + e.key);
          }
      } 
      // Check for deletion
      else if (e.key === 'Backspace' || e.key === 'Delete') {
          setPhoneNumber(prev => prev.slice(0, -1));
      } 
      // Check for Enter to call
      else if (e.key === 'Enter') {
          handleCall();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [phoneNumber, isCalling]); // Dependencies needed to access latest state

  // Handle direct typing (Mobile/Focused input)
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value.replace(/[^0-9*#]/g, ''); // Allow only phone chars
      if (val.length <= 15) {
          setPhoneNumber(val);
      }
  };

  return (
    <div className="flex-1 h-screen overflow-y-auto flex flex-col items-center justify-center p-4 relative">
      {/* Background radial glow for the phone */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-green-500/10 rounded-full blur-[100px] pointer-events-none"></div>

      {/* Glass Dialer Container - iOS Style */}
      <div className="glass-panel w-full max-w-[360px] rounded-[3rem] p-8 flex flex-col items-center relative shadow-2xl shadow-black/50 border border-white/10 bg-black/20 backdrop-blur-3xl">
        
        {/* Top Notch/Status */}
        <div className="w-16 h-1 bg-white/10 rounded-full mb-8"></div>
        <div className="absolute top-6 right-8 text-[10px] font-bold tracking-widest text-white/20 uppercase">
             {twilioConfig.webhookUrl ? "Connected" : "Demo"}
        </div>

        {/* Number Display */}
        <div className="mt-8 mb-10 w-full text-center h-24 flex flex-col justify-end">
           <input 
             type="tel" 
             value={phoneNumber}
             onChange={handleInputChange}
             placeholder=""
             className="w-full bg-transparent text-center text-4xl font-light text-white outline-none placeholder:text-white/10 tracking-widest"
           />
           <div className="h-6 mt-2 flex items-center justify-center">
             {statusMsg && (
               <span className={`text-xs font-semibold px-3 py-1 rounded-full ${statusMsg.type === 'success' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'}`}>
                 {statusMsg.text}
               </span>
             )}
           </div>
        </div>

        {/* Keypad */}
        <div className="grid grid-cols-3 gap-x-6 gap-y-6 mb-12">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, '*', 0, '#'].map((key) => (
            <button 
              key={key}
              onClick={() => handleNumberClick(key.toString())}
              className="w-20 h-20 rounded-full bg-white/5 hover:bg-white/15 backdrop-blur-md text-white text-3xl font-light flex items-center justify-center transition-all duration-200 active:scale-90 active:bg-white/20 border border-white/5 shadow-lg"
            >
              {key}
            </button>
          ))}
        </div>

        {/* Actions */}
        <div className="flex justify-center gap-8 items-center w-full px-4 mb-4">
           {/* Spacer or Back button if needed later */}
           <div className="w-16 flex justify-center"></div>

           <button 
             onClick={handleCall}
             disabled={isCalling || !phoneNumber}
             className="w-20 h-20 rounded-full bg-green-500 hover:bg-green-400 text-white flex items-center justify-center shadow-[0_0_30px_rgba(34,197,94,0.4)] transition-all transform hover:scale-110 active:scale-95 disabled:opacity-50 disabled:shadow-none disabled:transform-none"
           >
             {isCalling ? <Loader2 className="animate-spin" size={32} /> : <Phone size={36} fill="currentColor" />}
           </button>
           
           <div className="w-16 flex justify-center">
             {phoneNumber && (
                <button onClick={handleDelete} className="text-white/40 hover:text-white transition p-4">
                    <Delete size={24} />
                </button>
             )}
           </div>
        </div>
      </div>
    </div>
  );
};

export default PhoneInterface;