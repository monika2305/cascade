import React from 'react';
import type { UserRole } from '../types/infrastructure';
import { ROLES } from '../types/roles';
import { BrandMark } from '../landing/components/Icons';
import {
  Home,
  Network,
  AlertTriangle,
  Zap,
  Wrench,
  LogOut,
  Radio,
  Globe2,
} from 'lucide-react';

export type ScreenId =
  | 'upload'
  | 'network'
  | 'weak-points'
  | 'failure-test'
  | 'command'
  | 'city-twin'
  | 'action-lab';

interface SidebarProps {
  activeScreen: ScreenId;
  onSelectScreen: (screen: ScreenId) => void;
  userName: string;
  userRole: UserRole;
  hasData: boolean;
  onLogout: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeScreen,
  onSelectScreen,
  userName,
  userRole,
  hasData,
  onLogout,
}) => {
  const roleConfig = ROLES.find((r) => r.id === userRole) || ROLES[0];

  const navItems: { id: ScreenId; label: string; icon: React.ReactNode; requiresData: boolean }[] = [
    { id: 'upload', label: 'Home', icon: <Home className="w-4 h-4" />, requiresData: false },
    { id: 'network', label: 'City Network', icon: <Network className="w-4 h-4" />, requiresData: true },
    { id: 'weak-points', label: 'Weak Points', icon: <AlertTriangle className="w-4 h-4" />, requiresData: true },
    { id: 'failure-test', label: 'Failure Test', icon: <Zap className="w-4 h-4" />, requiresData: true },
    { id: 'command', label: 'Resilience Command', icon: <Radio className="w-4 h-4 text-rose-400" />, requiresData: true },
    { id: 'city-twin', label: 'City Twin', icon: <Globe2 className="w-4 h-4 text-cyan-400" />, requiresData: true },
    { id: 'action-lab', label: 'Action Lab', icon: <Wrench className="w-4 h-4" />, requiresData: true },
  ];

  return (
    <aside className="w-60 h-full bg-[#061019] border-r border-[#182c3f] flex flex-col shrink-0 select-none z-20">
      {/* Brand */}
      <div className="h-16 px-5 border-b border-[#182c3f] flex items-center gap-3 shrink-0">
        <div className="w-8 h-8 rounded-lg bg-[#0a1726] border border-[#84979a40] flex items-center justify-center text-[#a8e2dc] shadow-sm">
          <BrandMark />
        </div>
        <div>
          <div className="font-semibold text-xs tracking-[0.22em] text-[#f2f4f0] uppercase">CASCADE</div>
          <div className="text-[9px] text-[#8096a4] tracking-widest uppercase font-medium">
            Intelligence Platform
          </div>
        </div>
      </div>

      {/* Nav list */}
      <nav className="flex-1 p-3 space-y-1.5 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = activeScreen === item.id;
          const isDisabled = item.requiresData && !hasData;

          return (
            <button
              key={item.id}
              disabled={isDisabled}
              onClick={() => onSelectScreen(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-xs font-medium transition-all text-left ${
                isActive
                  ? 'bg-[#0d1e2e] text-[#f2f4f0] border-l-2 border-l-[#a8e2dc] border-y border-r border-[#1a3349] shadow-sm'
                  : isDisabled
                  ? 'text-slate-600 opacity-40 cursor-not-allowed'
                  : 'text-[#8da1af] hover:text-[#f2f4f0] hover:bg-[#0a1726] cursor-pointer'
              }`}
            >
              <span className={isActive ? 'text-[#a8e2dc]' : 'text-[#6b8294]'}>{item.icon}</span>
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* User profile & Logout */}
      <div className="p-3 border-t border-[#182c3f] bg-[#071321] shrink-0">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <div className="text-xs font-semibold text-[#f2f4f0] truncate">{userName}</div>
            <div className="text-[10px] text-[#8096a4] flex items-center gap-1 mt-0.5">
              <span>{roleConfig.icon}</span>
              <span className="truncate">{roleConfig.name}</span>
            </div>
          </div>

          <button
            onClick={onLogout}
            className="p-1.5 text-[#8096a4] hover:text-[#f2f4f0] hover:bg-[#0a1726] rounded-md transition-colors cursor-pointer"
            title="Log Out"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </aside>
  );
};

