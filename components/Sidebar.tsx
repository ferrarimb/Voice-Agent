import React, { useState } from 'react';
import { Phone, Settings, Activity, Bot, ChevronRight } from 'lucide-react';
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
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div 
      className={`h-screen z-30 flex flex-col py-6 relative border-r border-white/5 bg-black/20 backdrop-blur-2xl
        transition-all duration-500 ease-[cubic-bezier(0.25,0.8,0.25,1)]
        ${isExpanded ? 'w-72' : 'w-20'}
      `}
    >
       {/* Background gradient/glass adjustments */}
       <div className="absolute inset-0 bg-gradient-to-b from-white/[0.02] to-transparent pointer-events-none" />

      {/* Toggle Button - Perfectly centered on border */}
      <button 
        onClick={() => setIsExpanded(!isExpanded)}
        className={`absolute -right-3 top-10 z-50 w-6 h-6 rounded-full bg-[#0a0a0a] border border-white/10 flex items-center justify-center text-white/40 hover:text-white transition-all duration-300 hover:scale-110 shadow-[0_0_10px_rgba(0,0,0,0.5)] group`}
      >
         <ChevronRight size={12} className={`transition-transform duration-500 ease-[cubic-bezier(0.25,0.8,0.25,1)] ${isExpanded ? 'rotate-180' : 'rotate-0'}`} />
      </button>

      {/* Logo Area - Fixed padding left ensures icon doesn't jump */}
      <div 
        className={`relative z-10 mb-10 flex items-center pl-5
          transition-all duration-500 ease-[cubic-bezier(0.25,0.8,0.25,1)]
        `}
      >
          <div 
            onClick={() => !isExpanded && setIsExpanded(true)}
            className={`relative flex-shrink-0 cursor-pointer group transition-all duration-500 flex items-center justify-center w-10 h-10`}
          >
             <img src="https://xtkorgedlxwfuaqyxguq.supabase.co/storage/v1/object/public/template-images/logo.png" alt="Bianca" className="w-full h-full object-contain opacity-90 group-hover:opacity-100 transition-all duration-300" />
             <div className="absolute inset-0 bg-white/20 blur-xl opacity-0 group-hover:opacity-30 transition-opacity duration-500 rounded-full"></div>
          </div>
          
          <div className={`flex flex-col justify-center overflow-hidden whitespace-nowrap transition-all duration-500 ease-[cubic-bezier(0.25,0.8,0.25,1)]
            ${isExpanded ? 'max-w-[150px] opacity-100 ml-3 translate-x-0' : 'max-w-0 opacity-0 ml-0 -translate-x-4'}
          `}>
              <h1 className="text-white font-semibold tracking-tight text-lg leading-none">Bianca</h1>
              <p className="text-[10px] text-white/40 uppercase tracking-[0.2em] font-medium mt-1">Voice AI</p>
          </div>
      </div>

      {/* Nav Items */}
      <nav className="flex-1 flex flex-col gap-2 w-full px-3">
        <SidebarItem 
          icon={<Bot size={20} />} 
          label="Agente" 
          active={currentView === 'assistants'} 
          onClick={() => onViewChange('assistants')}
          expanded={isExpanded}
        />
        <SidebarItem 
          icon={<Phone size={20} />} 
          label="Ligação" 
          active={currentView === 'phone'} 
          onClick={() => onViewChange('phone')}
          expanded={isExpanded}
        />
        <SidebarItem 
          icon={<BridgeIcon size={20} />} 
          label="Ponte" 
          active={currentView === 'speed-dial'} 
          onClick={() => onViewChange('speed-dial')}
          expanded={isExpanded}
        />
        <SidebarItem 
          icon={<Activity size={20} />} 
          label="Logs" 
          active={currentView === 'logs'} 
          onClick={() => onViewChange('logs')}
          expanded={isExpanded}
        />
      </nav>
      
      {/* Bottom Actions */}
      <div className="w-full px-3 pb-6">
        <div className={`h-px w-full bg-gradient-to-r from-transparent via-white/10 to-transparent mb-4 transition-all duration-500 ease-out
             ${isExpanded ? 'opacity-100 scale-100' : 'opacity-0 scale-90'}
        `} />
        <SidebarItem 
            icon={<Settings size={20} />} 
            label="Config" 
            active={currentView === 'settings'} 
            onClick={() => onViewChange('settings')}
            expanded={isExpanded}
        />
      </div>
    </div>
  );
};

const SidebarItem: React.FC<{ 
    icon: React.ReactNode; 
    label: string; 
    active?: boolean; 
    onClick: () => void;
    expanded: boolean; 
}> = ({ icon, label, active, onClick, expanded }) => {
  return (
    <div 
      onClick={onClick}
      className={`group relative flex items-center rounded-xl cursor-pointer border border-transparent min-h-[52px]
        transition-all duration-300
        ${active 
          ? 'bg-white/10 border-white/5 shadow-lg shadow-black/20' 
          : 'hover:bg-white/5 hover:border-white/5 text-white/40 hover:text-white'
        }
        /* Fixed padding-left keeps icon stable during expansion */
        pl-4
      `}
    >
      {/* Icon Wrapper - Fixed width container ensures exact alignment */}
      <div className={`relative z-10 flex items-center justify-center w-6 h-6 flex-shrink-0 transition-transform duration-300 ${active ? 'text-white scale-110' : 'group-hover:scale-110'}`}>
          {icon}
      </div>

      {/* Label - Max Width Transition for smooth reveal */}
      <div className={`
         overflow-hidden whitespace-nowrap transition-all duration-500 ease-[cubic-bezier(0.25,0.8,0.25,1)]
         ${expanded 
            ? 'max-w-[200px] opacity-100 ml-4 translate-x-0' 
            : 'max-w-0 opacity-0 ml-0 -translate-x-2'
         }
      `}>
          <span className={`text-sm font-medium tracking-wide ${active ? 'text-white' : 'text-white/80'}`}>{label}</span>
      </div>
      
      {/* Active Indicator */}
      {active && (
         <div className={`absolute bg-white transition-all duration-500 ease-[cubic-bezier(0.25,0.8,0.25,1)] shadow-[0_0_10px_rgba(255,255,255,0.5)]
            ${expanded 
                ? 'left-0 top-1/2 -translate-y-1/2 w-1 h-8 rounded-r-full opacity-100' // Vertical bar
                : 'left-1/2 -translate-x-1/2 bottom-1.5 w-1 h-1 rounded-full opacity-80' // Dot under icon
            }
         `}></div>
      )}

      {/* Tooltip (Collapsed only) */}
       <div className={`
          absolute left-full ml-4 px-3 py-2 glass-panel rounded-lg text-xs font-medium text-white 
          pointer-events-none transition-all duration-200 z-50 backdrop-blur-xl bg-black/80 border border-white/10 shadow-xl
          ${!expanded ? 'group-hover:opacity-100 group-hover:translate-x-0 opacity-0 -translate-x-2' : 'opacity-0 hidden'}
      `}>
          {label}
      </div>
    </div>
  );
};

export default Sidebar;