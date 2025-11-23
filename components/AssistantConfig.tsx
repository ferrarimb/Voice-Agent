import React from 'react';
import { AssistantConfig } from '../types';
import { Save, Play, Sparkles, Mic2 } from 'lucide-react';

interface AssistantConfigProps {
  config: AssistantConfig;
  setConfig: (config: AssistantConfig) => void;
  onStartDemo: () => void;
}

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
    <div className="flex-1 h-screen overflow-y-auto custom-scrollbar relative">
       {/* Top Bar with Glass Blur */}
      <header className="h-24 flex items-center justify-between px-10 sticky top-0 z-20 backdrop-blur-xl bg-transparent border-b border-white/5">
        <div>
          <h1 className="text-white font-semibold text-2xl tracking-tight text-glow">{config.name}</h1>
          <div className="text-xs text-blue-200/60 flex gap-2 items-center mt-1 font-medium tracking-wide uppercase">
             <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.8)] animate-pulse"></span>
             Active Agent
          </div>
        </div>
        <div className="flex gap-4">
          <button className="glass-button px-6 py-3 rounded-2xl text-white/80 text-sm font-medium hover:text-white transition flex items-center gap-2">
             <Save size={16} /> <span className="hidden sm:inline">Save Changes</span>
          </button>
          <button 
            onClick={onStartDemo}
            className="px-8 py-3 bg-white text-black text-sm font-bold rounded-2xl hover:bg-gray-100 transition shadow-[0_0_30px_rgba(255,255,255,0.2)] flex items-center gap-2 transform hover:scale-105 active:scale-95 duration-200"
          >
             <Play size={16} fill="currentColor" /> Live Demo
          </button>
        </div>
      </header>

      <div className="p-10 max-w-6xl mx-auto space-y-10 pb-40">
        
        {/* Model Section - Glass Card */}
        <div className="glass-panel rounded-[2rem] p-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
           <div className="flex items-center gap-4 mb-8">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 flex items-center justify-center border border-indigo-500/30 shadow-[0_0_15px_rgba(99,102,241,0.2)]">
                  <Sparkles size={20} className="text-indigo-300" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-white">Intelligence Configuration</h2>
                <p className="text-sm text-white/40">Define the brain and behavior of the assistant.</p>
              </div>
           </div>

           <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
              <div className="space-y-4">
                 <label className="text-xs uppercase tracking-widest font-bold text-white/30 ml-1">AI Model</label>
                 <div className="relative group">
                    <select 
                        className="w-full glass-input rounded-2xl px-5 py-4 text-sm appearance-none cursor-pointer font-medium"
                        value={config.model}
                        onChange={(e) => handleChange('model', e.target.value)}
                    >
                        <option value="gpt-4o-realtime-preview" className="bg-slate-900 text-white">OpenAI / gpt-4o-realtime-preview</option>
                    </select>
                    <div className="absolute right-5 top-4.5 text-white/30 pointer-events-none group-hover:text-white/60 transition">▼</div>
                 </div>
              </div>
              
              <div className="col-span-1 md:col-span-2 space-y-4">
                 <label className="text-xs uppercase tracking-widest font-bold text-white/30 ml-1">System Persona</label>
                 <textarea 
                    className="w-full h-48 glass-input rounded-2xl px-6 py-5 font-mono text-sm leading-relaxed resize-none focus:ring-1 focus:ring-white/20 transition-all"
                    value={config.systemInstruction}
                    onChange={(e) => handleChange('systemInstruction', e.target.value)}
                    placeholder="Describe how the assistant should behave..."
                 />
              </div>
           </div>
        </div>

        {/* Voice Section - Glass Card */}
        <div className="glass-panel rounded-[2rem] p-10 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-100">
           <div className="flex items-center gap-4 mb-8 border-b border-white/5 pb-6">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 flex items-center justify-center border border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.2)]">
                    <Mic2 size={20} className="text-emerald-300" />
                </div>
                <div>
                    <h2 className="text-xl font-semibold text-white">Voice Synthesis</h2>
                    <p className="text-sm text-white/40">Configure voice tone and recognition.</p>
                </div>
           </div>

           <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
              <div className="space-y-4">
                 <label className="text-xs uppercase tracking-widest font-bold text-white/30 ml-1">Voice ID</label>
                 <div className="relative group">
                    <select 
                        className="w-full glass-input rounded-2xl px-5 py-4 text-sm uppercase appearance-none cursor-pointer font-medium tracking-wide"
                        value={config.voice}
                        onChange={(e) => handleChange('voice', e.target.value.toLowerCase() as any)}
                    >
                        {OPENAI_VOICES.map(v => (
                            <option key={v} value={v} className="bg-slate-900 text-white">{v}</option>
                        ))}
                    </select>
                    <div className="absolute right-5 top-4.5 text-white/30 pointer-events-none group-hover:text-white/60 transition">▼</div>
                 </div>
              </div>
              <div className="space-y-4">
                 <label className="text-xs uppercase tracking-widest font-bold text-white/30 ml-1">Transcriber</label>
                 <div className="glass-input rounded-2xl px-5 py-4 text-sm text-white/50 flex justify-between items-center opacity-70 cursor-not-allowed">
                    <span>Whisper-1 (Integrated)</span>
                    <span className="text-[10px] bg-white/10 px-2 py-1 rounded text-white/60 font-semibold uppercase tracking-wider">Fixed</span>
                 </div>
              </div>
           </div>
        </div>

      </div>
    </div>
  );
};

export default AssistantConfigPanel;