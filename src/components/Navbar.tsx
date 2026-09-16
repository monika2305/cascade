import React from 'react';
import type { UserRole } from '../types/infrastructure';
import { ROLES } from '../types/roles';
import { GitFork, RotateCcw, ArrowLeft } from 'lucide-react';

export type AppStep = 'home' | 'role' | 'upload' | 'workspace';

interface NavbarProps {
  currentStep: AppStep;
  selectedRole: UserRole;
  onReset: () => void;
  onBack?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentStep,
  selectedRole,
  onReset,
  onBack,
}) => {
  const roleConfig = ROLES.find((r) => r.id === selectedRole);

  return (
    <header className="w-full border-b border-slate-800/80 bg-slate-950/90 backdrop-blur-md sticky top-0 z-50 shrink-0">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
        {/* Left: Back Button & Logo */}
        <div className="flex items-center gap-2 sm:gap-3">
          {onBack && currentStep !== 'home' && (
            <button
              onClick={onBack}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-300 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-800 transition-colors cursor-pointer"
              title="Go back"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Back</span>
            </button>
          )}

          <button
            onClick={onReset}
            className="flex items-center gap-2 text-left group cursor-pointer"
          >
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-slate-950 shadow-md shadow-cyan-500/20 group-hover:shadow-cyan-400/30 transition-all">
              <GitFork className="w-3.5 h-3.5 rotate-90" />
            </div>
            <span className="font-black text-sm tracking-wider text-white group-hover:text-cyan-400 transition-colors">
              CASCADE
            </span>
          </button>
        </div>

        {/* Center: Stage Title */}
        <div className="text-xs font-bold text-slate-400 tracking-wider uppercase">
          {currentStep === 'role' && 'Step 2: Choose Perspective'}
          {currentStep === 'upload' && 'Step 3: Load City Infrastructure Data'}
          {currentStep === 'home' && 'City Infrastructure Cascade Analysis'}
        </div>

        {/* Right: Role indicator & Reset */}
        <div className="flex items-center gap-2">
          {currentStep !== 'home' && roleConfig && (
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-900 border border-slate-800 text-[11px] text-slate-300">
              <span>{roleConfig.icon}</span>
              <span className="font-medium text-slate-200">{roleConfig.name}</span>
            </div>
          )}

          {currentStep !== 'home' && (
            <button
              onClick={onReset}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-800 transition-all cursor-pointer"
              title="Start Over"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Start Over</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
