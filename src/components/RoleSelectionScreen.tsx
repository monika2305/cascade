import React from 'react';
import type { UserRole } from '../types/infrastructure';
import { ROLES } from '../types/roles';
import { Check, Sparkles, ArrowRight } from 'lucide-react';

interface RoleSelectionScreenProps {
  selectedRole: UserRole;
  onSelectRole: (role: UserRole) => void;
  onConfirm: () => void;
}

export const RoleSelectionScreen: React.FC<RoleSelectionScreenProps> = ({
  selectedRole,
  onSelectRole,
  onConfirm,
}) => {
  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      {/* Premium Portal Header */}
      <div className="text-center mb-10">
        <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
          Welcome to CASCADE
        </h2>
        <p className="text-slate-400 text-base sm:text-lg mt-2">
          Choose your view
        </p>
      </div>

      {/* 4 Clean Visual Role Choices */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10">
        {ROLES.map((role) => {
          const isSelected = selectedRole === role.id;
          return (
            <button
              key={role.id}
              onClick={() => onSelectRole(role.id)}
              className={`relative text-left p-6 rounded-2xl border transition-all duration-200 cursor-pointer flex flex-col justify-between ${
                isSelected
                  ? 'bg-gradient-to-b from-slate-900 to-slate-900/90 border-cyan-400 shadow-xl shadow-cyan-950/50 ring-2 ring-cyan-400/40'
                  : 'bg-slate-900/40 border-slate-800 hover:border-slate-700 hover:bg-slate-900/70'
              }`}
            >
              <div>
                <div className="flex items-start justify-between mb-4">
                  <div className="w-14 h-14 rounded-2xl bg-slate-800/90 border border-slate-700/60 flex items-center justify-center text-3xl shadow-inner">
                    {role.icon}
                  </div>

                  <div className="flex items-center gap-2">
                    {role.badge && (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-400 bg-emerald-950/90 border border-emerald-700/60 px-2.5 py-0.5 rounded-full shadow-sm">
                        <Sparkles className="w-3 h-3" />
                        {role.badge}
                      </span>
                    )}
                    <div
                      className={`w-6 h-6 rounded-full border flex items-center justify-center transition-all ${
                        isSelected
                          ? 'border-cyan-400 bg-cyan-500 text-slate-950'
                          : 'border-slate-700 bg-slate-800'
                      }`}
                    >
                      {isSelected && <Check className="w-4 h-4 stroke-[3]" />}
                    </div>
                  </div>
                </div>

                <h3 className="text-lg font-bold text-white tracking-wide">
                  {role.name}
                </h3>
                <p className="text-slate-300 text-sm font-medium mt-1">
                  {role.subtitle}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Primary Action Button */}
      <div className="flex justify-center">
        <button
          onClick={onConfirm}
          className="px-8 py-4 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-slate-950 font-bold text-base shadow-xl shadow-cyan-500/25 hover:shadow-cyan-400/35 transition-all flex items-center gap-3 cursor-pointer active:scale-98"
        >
          <span>Enter Dashboard</span>
          <ArrowRight className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};
