import React from 'react';
import { Phone, Settings, Activity, Bot } from 'lucide-react';
import { View } from '../types';

// Custom Bridge Icon
const BridgeIcon = ({ size = 24, className = "" }: { size?: number, className?: string }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="1.5" 
    strokeLinecap="round" 
    strokeLinejoin="round"
    className={className}
  >
    <path d="M3 21h18" />
    <path d="M6 21V7" />
    <path d="M18 21V7" />
    <path d="M6 7Q12 16 18 7" />
    <path d="M9 10v11" />
    <path d="M12 12v9" />
    <path d="M15 10v11" />
  </svg>
);

interface SidebarProps {
  currentView: View;
  onViewChange: (view: View) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ currentView, onViewChange }) => {
  return (
    <div className="w-20 md:w-24 h-screen z-30 flex flex-col items-center py-6 relative">
      {/* Background Strip - Adjusted to skip the Logo area */}
      <div className="absolute right-0 top-0 bottom-0 w-px bg-white/5 z-0" />
      <div className="absolute left-0 top-28 bottom-0 w-full bg-white/[0.02] backdrop-blur-md border-t border-white/5 z-0" />

      {/* Logo Area - No background, no border */}
      <div className="relative z-10 w-12 h-12 mb-10 group cursor-pointer flex items-center justify-center bg-transparent">
          <img src="https://xtkorgedlxwfuaqyxguq.supabase.co/storage/v1/object/public/template-images/logo.png" alt="Bianca" className="w-full h-full object-contain opacity-80 group-hover:opacity-100 transition-opacity duration-500" />
          <div className="absolute inset-0 bg-white/20 blur-xl opacity-0 group-hover:opacity-40 transition-opacity duration-700 rounded-full"></div>
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
          icon={<BridgeIcon size={22} />} 
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
      className={`group relative flex items-center justify-center w-full aspect-square rounded-2xl cursor-pointer transition-all duration-500 ease-[cubic-bezier(0.25,1,0.5,1)] 
        ${active ? 'bg-white/10 text-white shadow-[0_4px_20px_rgba(0,0,0,0.2)] border border-white/10' : 'text-white/40 hover:text-white hover:bg-white/5 border border-transparent hover:border-white/5'}`}
      title={label}
    >
      {active && (
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-b from-white/10 to-transparent opacity-100 animate-in fade-in duration-300" />
      )}
      
      {/* Icon Wrapper for smoother transform */}
      <div className={`relative z-10 transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${active ? 'scale-110 drop-shadow-[0_0_8px_rgba(255,255,255,0.3)]' : 'group-hover:scale-110 group-hover:drop-shadow-[0_0_5px_rgba(255,255,255,0.2)]'}`}>
          {icon}
      </div>
      
      {/* Active Indicator Dot */}
      {active && (
         <div className="absolute -left-1 top-1/2 -translate-y-1/2 w-1 h-8 bg-white rounded-r-full shadow-[0_0_10px_white] opacity-60"></div>
      )}

      {/* Tooltip on hover */}
      <div className="absolute left-full ml-4 px-3 py-1.5 glass-panel rounded-lg text-xs font-medium text-white opacity-0 -translate-x-2 pointer-events-none group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300 ease-out whitespace-nowrap z-50 backdrop-blur-xl bg-black/40 border border-white/10">
        {label}
      </div>
    </div>
  );
};

export default Sidebar;