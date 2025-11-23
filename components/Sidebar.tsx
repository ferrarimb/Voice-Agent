
import React from 'react';
import { Phone, Settings, Activity, Bot, PhoneCall, Zap } from 'lucide-react';
import { View } from '../types';

interface SidebarProps {
  currentView: View;
  onViewChange: (view: View) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ currentView, onViewChange }) => {
  return (
    <div className="w-16 md:w-64 h-screen bg-slate-900 border-r border-slate-800 flex flex-col">
      <div className="p-4 flex items-center gap-3 border-b border-slate-800 h-16">
        <div className="w-8 h-8 flex items-center justify-center">
            <img src="https://xtkorgedlxwfuaqyxguq.supabase.co/storage/v1/object/public/template-images/logo.png" alt="Bianca Voice Agent" className="w-full h-full object-contain" />
        </div>
        <span className="text-white font-bold text-xl hidden md:block">Bianca Voice Agent</span>
      </div>

      <nav className="flex-1 py-6 space-y-2 px-2">
        <SidebarItem 
          icon={<Bot size={20} />} 
          label="Agente" 
          active={currentView === 'assistants'} 
          onClick={() => onViewChange('assistants')}
        />
        <SidebarItem 
          icon={<Phone size={20} />} 
          label="Ligação" 
          active={currentView === 'phone'} 
          onClick={() => onViewChange('phone')}
        />
        <SidebarItem 
          icon={<Zap size={20} />} 
          label="Ponte SDR->Lead" 
          active={currentView === 'speed-dial'} 
          onClick={() => onViewChange('speed-dial')}
        />
        <SidebarItem 
          icon={<Activity size={20} />} 
          label="Logs" 
          active={currentView === 'logs'} 
          onClick={() => onViewChange('logs')}
        />
        <SidebarItem 
          icon={<Settings size={20} />} 
          label="Configurações" 
          active={currentView === 'settings'} 
          onClick={() => onViewChange('settings')}
        />
      </nav>
    </div>
  );
};

const SidebarItem: React.FC<{ icon: React.ReactNode; label: string; active?: boolean; onClick: () => void }> = ({ icon, label, active, onClick }) => {
  return (
    <div 
      onClick={onClick}
      className={`flex items-center gap-3 px-3 py-2 rounded-md cursor-pointer transition-colors ${active ? 'bg-blue-600/10 text-blue-400' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'}`}
    >
      {icon}
      <span className="hidden md:block font-medium">{label}</span>
    </div>
  );
};

export default Sidebar;