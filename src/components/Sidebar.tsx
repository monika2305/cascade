import React from 'react';
import type { UserRole } from '../types/infrastructure';
import { ROLES } from '../types/roles';
import {
  Home,
  Network,
  AlertTriangle,
  Zap,
  Wrench,
  ShieldCheck,
  GitFork,
  LogOut,
  Radio,
} from 'lucide-react';

export type ScreenId =
  | 'upload'
  | 'network'
  | 'weak-points'
  | 'failure-test'
  | 'command'
  | 'recovery-planner'
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
    { id: 'recovery-planner', label: 'Recovery Planner', icon: <ShieldCheck className="w-4 h-4" />, requiresData: true },
    { id: 'action-lab', label: 'Action Lab', icon: <Wrench className="w-4 h-4" />, requiresData: true },
  ];

  return (
    <aside className="w-60 h-full bg-slate-950 border-r border-slate-800/80 flex flex-col shrink-0 select-none z-20">
      {/* Brand */}
      <div className="h-16 px-5 border-b border-slate-800/80 flex items-center gap-3 shrink-0">
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-slate-950 shadow-md shadow-cyan-500/20">
          <GitFork className="w-4 h-4 rotate-90" />
        </div>
        <div>
          <div className="font-black text-sm tracking-wider text-white">CASCADE</div>
          <div className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold">
            Infrastructure MVP
          </div>
        </div>
      </div>

      {/* Nav list */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = activeScreen === item.id;
          const isDisabled = item.requiresData && !hasData;

          return (
            <button
              key={item.id}
              disabled={isDisabled}
              onClick={() => onSelectScreen(item.id)}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all text-left ${
                isActive
                  ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/40 shadow-sm'
                  : isDisabled
                  ? 'text-slate-600 opacity-50 cursor-not-allowed'
                  : 'text-slate-400 hover:text-white hover:bg-slate-900 cursor-pointer'
              }`}
            >
              <span className={isActive ? 'text-cyan-400' : 'text-slate-500'}>{item.icon}</span>
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* User profile & Logout */}
      <div className="p-3 border-t border-slate-800/80 bg-slate-900/40 shrink-0 space-y-2">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <div className="text-xs font-bold text-white truncate">{userName}</div>
            <div className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
              <span>{roleConfig.icon}</span>
              <span className="truncate">{roleConfig.name}</span>
            </div>
          </div>

          <button
            onClick={onLogout}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            title="Log Out"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </aside>
  );
};
