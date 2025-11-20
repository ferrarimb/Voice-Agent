import React, { useState } from 'react';
import { Save, Workflow, BellRing, Zap } from 'lucide-react';
import { AppSettings } from '../types';

interface SettingsViewProps {
  settings: AppSettings;
  onSave: (settings: AppSettings) => void;
}

const SettingsView: React.FC<SettingsViewProps> = ({ settings, onSave }) => {
  const [localSettings, setLocalSettings] = useState<AppSettings>(settings);
  const [showSuccess, setShowSuccess] = useState(false);

  const handleSave = () => {
    onSave(localSettings);
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 3000);
  };

  return (
    <div className="flex-1 bg-slate-950 h-screen overflow-y-auto">
      <header className="h-16 border-b border-slate-800 bg-slate-900/50 flex items-center justify-between px-8 sticky top-0 backdrop-blur-sm z-10">
        <h1 className="text-white font-semibold text-lg">Global Settings</h1>
        <button 
          onClick={handleSave}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-500 transition flex items-center gap-2"
        >
           <Save size={16} /> Save Changes
        </button>
      </header>

      <div className="p-8 max-w-4xl mx-auto space-y-8">
        
        {showSuccess && (
            <div className="bg-green-500/10 border border-green-500/20 text-green-400 px-4 py-3 rounded-lg flex items-center gap-3 animate-in fade-in slide-in-from-top-2">
                <BellRing size={18} />
                <span>Settings saved successfully!</span>
            </div>
        )}

        {/* n8n Integration */}
        <section className="bg-slate-900 border border-slate-800 rounded-xl p-6">
           <div className="flex items-start gap-4 mb-6">
              <div className="w-10 h-10 rounded-lg bg-[#FF6D5A]/10 flex items-center justify-center text-[#FF6D5A]">
                 <Workflow size={24} />
              </div>
              <div>
                  <h2 className="text-lg font-medium text-white">n8n Automation</h2>
                  <p className="text-sm text-slate-400">
                      Automatically send call data and transcripts to your n8n workflow when a conversation ends.
                  </p>
              </div>
           </div>

           <div className="space-y-4">
              <div>
                 <label className="block text-xs font-medium text-slate-400 mb-1">Webhook URL (POST)</label>
                 <div className="flex gap-2">
                    <input 
                        type="text" 
                        value={localSettings.n8nWebhookUrl || ''}
                        onChange={(e) => setLocalSettings({ ...localSettings, n8nWebhookUrl: e.target.value })}
                        className="flex-1 bg-slate-950 border border-slate-700 rounded-md px-3 py-2 text-slate-200 focus:ring-2 focus:ring-[#FF6D5A] outline-none placeholder:text-slate-600"
                        placeholder="https://your-n8n-instance.com/webhook/..."
                    />
                 </div>
                 <p className="text-[11px] text-slate-500 mt-2">
                    We will send a POST request with JSON body: <code>{`{ assistantName, transcript: [...], duration, timestamp }`}</code>
                 </p>
              </div>

              <div className="bg-slate-950 border border-slate-800 rounded p-4">
                  <h4 className="text-xs font-semibold text-slate-300 mb-2 flex items-center gap-2">
                      <Zap size={12} className="text-yellow-400" /> How to use in n8n:
                  </h4>
                  <ol className="list-decimal list-inside text-xs text-slate-400 space-y-1 ml-1">
                      <li>Create a new Workflow.</li>
                      <li>Add a <strong>Webhook</strong> node.</li>
                      <li>Set method to <strong>POST</strong>.</li>
                      <li>Copy the Test URL and paste it above.</li>
                      <li>Make a test call in the browser to trigger it.</li>
                  </ol>
              </div>
           </div>
        </section>

        {/* API Keys Section */}
        <section className="bg-slate-900 border border-slate-800 rounded-xl p-6">
           <div className="mb-4">
              <h2 className="text-lg font-medium text-white">API Keys</h2>
              <p className="text-sm text-slate-400">Manage external service connections.</p>
           </div>
           <div className="space-y-2">
              <label className="block text-xs font-medium text-slate-400">OpenAI API Key</label>
              <input 
                type="password" 
                value={localSettings.openaiApiKey || ''}
                onChange={(e) => setLocalSettings({ ...localSettings, openaiApiKey: e.target.value })}
                className="w-full bg-slate-950 border border-slate-700 rounded-md px-3 py-2 text-slate-200 focus:ring-2 focus:ring-blue-500 outline-none placeholder:text-slate-600"
                placeholder="sk-..."
              />
              <p className="text-[10px] text-slate-500">
                Stored locally. Ensure your backend <code>.env</code> is also configured for production.
              </p>
           </div>
        </section>

      </div>
    </div>
  );
};

export default SettingsView;