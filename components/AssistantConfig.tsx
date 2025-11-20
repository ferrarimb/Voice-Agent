import React from 'react';
import { AssistantConfig, VoiceName } from '../types';
import { Save, Play } from 'lucide-react';

interface AssistantConfigProps {
  config: AssistantConfig;
  setConfig: (config: AssistantConfig) => void;
  onStartDemo: () => void;
}

// OpenAI Realtime Voices
const OPENAI_VOICES = [
    'alloy',
    'ash',
    'ballad',
    'coral',
    'echo',
    'sage',
    'shimmer',
    'verse'
];

const AssistantConfigPanel: React.FC<AssistantConfigProps> = ({ config, setConfig, onStartDemo }) => {
  
  const handleChange = (field: keyof AssistantConfig, value: string) => {
    setConfig({ ...config, [field]: value });
  };

  return (
    <div className="flex-1 bg-slate-950 h-screen overflow-y-auto">
      <header className="h-16 border-b border-slate-800 bg-slate-900/50 flex items-center justify-between px-8 sticky top-0 backdrop-blur-sm z-10">
        <div>
          <h1 className="text-white font-semibold text-lg">{config.name}</h1>
          <div className="text-xs text-slate-400 flex gap-2 items-center">
             <span className="w-2 h-2 rounded-full bg-green-500"></span>
             Published
          </div>
        </div>
        <div className="flex gap-3">
          <button className="px-4 py-2 bg-slate-800 text-white text-sm font-medium rounded hover:bg-slate-700 border border-slate-700 transition flex items-center gap-2">
             <Save size={16} /> Save
          </button>
          <button 
            onClick={onStartDemo}
            className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-sm font-bold rounded hover:opacity-90 transition shadow-lg shadow-blue-900/20 flex items-center gap-2"
          >
             <Play size={16} fill="currentColor" /> Start Demo
          </button>
        </div>
      </header>

      <div className="p-8 max-w-5xl mx-auto space-y-8">
        {/* Model Configuration */}
        <section className="space-y-4">
           <h2 className="text-slate-100 font-medium text-lg border-b border-slate-800 pb-2">Model Configuration</h2>
           <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                 <label className="text-sm text-slate-400 font-medium">Provider & Model</label>
                 <select 
                    className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
                    value={config.model}
                    onChange={(e) => handleChange('model', e.target.value)}
                 >
                    <option value="gpt-4o-realtime-preview">OpenAI / gpt-4o-realtime-preview</option>
                 </select>
                 <p className="text-xs text-slate-500">The brain behind the assistant.</p>
              </div>
              <div className="space-y-2">
                 <label className="text-sm text-slate-400 font-medium">System Prompt</label>
                 <textarea 
                    className="w-full h-32 bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-slate-200 focus:ring-2 focus:ring-blue-500 outline-none font-mono text-sm"
                    value={config.systemInstruction}
                    onChange={(e) => handleChange('systemInstruction', e.target.value)}
                 />
                 <p className="text-xs text-slate-500">Define the personality and instructions.</p>
              </div>
           </div>
        </section>

        {/* Voice Configuration */}
        <section className="space-y-4">
           <h2 className="text-slate-100 font-medium text-lg border-b border-slate-800 pb-2">Voice Configuration</h2>
           <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                 <label className="text-sm text-slate-400 font-medium">Voice Provider</label>
                 <select 
                    className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
                    disabled
                 >
                    <option>OpenAI Native</option>
                 </select>
              </div>
              <div className="space-y-2">
                 <label className="text-sm text-slate-400 font-medium">Voice ID</label>
                 <select 
                    className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-slate-200 focus:ring-2 focus:ring-blue-500 outline-none uppercase"
                    value={config.voice}
                    onChange={(e) => handleChange('voice', e.target.value.toLowerCase() as any)}
                 >
                    {OPENAI_VOICES.map(v => (
                        <option key={v} value={v}>{v}</option>
                    ))}
                 </select>
                 <p className="text-xs text-slate-500">Select the vocal tone.</p>
              </div>
           </div>
        </section>

        {/* Transcriber */}
        <section className="space-y-4">
           <h2 className="text-slate-100 font-medium text-lg border-b border-slate-800 pb-2">Transcriber</h2>
           <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                 <label className="text-sm text-slate-400 font-medium">Provider</label>
                 <select 
                    className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
                    value={config.transcriberModel}
                    onChange={(e) => handleChange('transcriberModel', e.target.value)}
                 >
                    <option value="whisper">OpenAI Whisper (Integrated)</option>
                 </select>
                 <p className="text-xs text-slate-500">Using Native Audio capabilities.</p>
              </div>
           </div>
        </section>

      </div>
    </div>
  );
};

export default AssistantConfigPanel;