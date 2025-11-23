import React from 'react';
import { Phone, Settings, Activity, Bot, Zap } from 'lucide-react';
import { View } from '../types';

interface SidebarProps {
  currentView: View;
  onViewChange: (view: View) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ currentView, onViewChange }) => {
  return (
    <div className="w-20 md:w-24 h-screen z-30 flex flex-col items-center py-6 relative">
      {/* Background Glass Strip */}
      <div className="absolute left-0 top-0 bottom-0 w-full glass-panel border-r border-white/5 border-y-0 border-l-0" />

      {/* Logo Area */}
      <div className="relative z-10 w-12 h-12 mb-10 rounded-2xl overflow-hidden shadow-lg shadow-indigo-500/20 ring-1 ring-white/10 group cursor-pointer">
          <img src="https://xtkorgedlxwfuaqyxguq.supabase.co/storage/v1/object/public/template-images/logo.png" alt="Bianca" className="w-full h-full object-contain opacity-80 group-hover:opacity-100 transition-opacity" />
          <div className="absolute inset-0 bg-gradient-to-tr from-indigo-500/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
      </div>

      {/* Nav Items */}
      <nav className="relative z-10 flex-1 flex flex-col gap-6 w-full px-3">
        <SidebarItem 
          icon={<Bot size={22} />} 
          label="Agente" 
          active={currentView === 'assistants'} 
          onClick={() => onViewChange('assistants')}
        />
        <SidebarItem 
          icon={<Phone size={22} />} 
          label="Ligação" 
          active={currentView === 'phone'} 
          onClick={() => onViewChange('phone')}
        />
        <SidebarItem 
          icon={<Zap size={22} />} 
          label="Ponte" 
          active={currentView === 'speed-dial'} 
          onClick={() => onViewChange('speed-dial')}
        />
        <SidebarItem 
          icon={<Activity size={22} />} 
          label="Logs" 
          active={currentView === 'logs'} 
          onClick={() => onViewChange('logs')}
        />
      </nav>
      
      {/* Bottom Actions */}
      <div className="relative z-10 px-3 pb-4">
        <SidebarItem 
            icon={<Settings size={22} />} 
            label="Config" 
            active={currentView === 'settings'} 
            onClick={() => onViewChange('settings')}
        />
      </div>
    </div>
  );
};

const SidebarItem: React.FC<{ icon: React.ReactNode; label: string; active?: boolean; onClick: () => void }> = ({ icon, label, active, onClick }) => {
  return (
    <div 
      onClick={onClick}
      className={`group relative flex items-center justify-center w-full aspect-square rounded-2xl cursor-pointer transition-all duration-500 ease-out 
        ${active ? 'bg-white/10 text-white shadow-[0_0_20px_rgba(255,255,255,0.1)]' : 'text-white/40 hover:text-white hover:bg-white/5'}`}
      title={label}
    >
      {active && (
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-tr from-white/10 to-transparent opacity-50" />
      )}
      <div className={`relative z-10 transition-transform duration-300 ${active ? 'scale-110' : 'group-hover:scale-110'}`}>
          {icon}
      </div>
      
      {/* Tooltip on hover */}
      <div className="absolute left-full ml-4 px-3 py-1.5 glass-panel rounded-lg text-xs font-medium text-white opacity-0 -translate-x-2 pointer-events-none group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200 whitespace-nowrap z-50">
        {label}
      </div>
    </div>
  );
};

export default Sidebar;