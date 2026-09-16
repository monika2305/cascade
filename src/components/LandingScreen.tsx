import React from 'react';
import { ArrowRight, Zap, Droplets, Activity, ShieldAlert, GitFork } from 'lucide-react';

interface LandingScreenProps {
  onStart: () => void;
}

export const LandingScreen: React.FC<LandingScreenProps> = ({ onStart }) => {
  return (
    <div className="relative min-h-[80vh] flex flex-col items-center justify-center text-center px-4 py-16">
      {/* Background visual grid accents */}
      <div className="absolute inset-0 -z-10 flex items-center justify-center opacity-30 pointer-events-none">
        <div className="w-[600px] h-[600px] rounded-full bg-gradient-to-tr from-cyan-500/10 via-indigo-500/10 to-transparent blur-3xl" />
      </div>

      {/* Floating interconnected 4-step sequence preview */}
      <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-4 mb-8">
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-400/10 border border-amber-400/30 text-amber-300 shadow-md">
          <Zap className="w-4 h-4 text-amber-400" />
          <span className="text-xs font-semibold">⚡ Failure</span>
        </div>
        <div className="text-slate-600 font-bold">→</div>
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-cyan-400/10 border border-cyan-400/30 text-cyan-300 shadow-md">
          <Droplets className="w-4 h-4 text-cyan-400" />
          <span className="text-xs font-semibold">💧 Connected Service</span>
        </div>
        <div className="text-slate-600 font-bold">→</div>
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-rose-400/10 border border-rose-400/30 text-rose-300 shadow-md">
          <Activity className="w-4 h-4 text-rose-400" />
          <span className="text-xs font-semibold">🏥 Critical Service</span>
        </div>
        <div className="text-slate-600 font-bold">→</div>
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-400/10 border border-emerald-400/30 text-emerald-300 shadow-md">
          <ShieldAlert className="w-4 h-4 text-emerald-400" />
          <span className="text-xs font-semibold">🛡 Test a Fix</span>
        </div>
      </div>

      {/* Badge */}
      <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-900 border border-slate-800 text-xs text-slate-300 font-medium mb-6 shadow-sm">
        <GitFork className="w-3.5 h-3.5 text-cyan-400 rotate-90" />
        <span>Infrastructure Cascade Analysis</span>
      </div>

      {/* Main Question */}
      <h1 className="text-4xl sm:text-6xl font-extrabold text-white tracking-tight max-w-3xl leading-tight mb-5 uppercase">
        What happens when one city service fails?
      </h1>

      {/* Supporting Text */}
      <p className="text-base sm:text-lg text-slate-300 max-w-xl mb-9 font-normal leading-relaxed">
        CASCADE shows what gets affected, why it happens, and which action can reduce the impact.
      </p>

      {/* Primary Action Button */}
      <button
        onClick={onStart}
        className="group px-8 py-4 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-slate-950 font-bold text-lg shadow-xl shadow-cyan-500/25 hover:shadow-cyan-400/35 transition-all duration-200 flex items-center gap-3 cursor-pointer active:scale-98 tracking-wide"
      >
        <span>START ANALYSIS</span>
        <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
      </button>

      {/* Simple feature cues below button */}
      <div className="mt-12 flex flex-wrap items-center justify-center gap-6 text-xs text-slate-400">
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
          ① Find biggest risk
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
          ② Test failure cascade
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
          ③ See why it happened
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          ④ Try a defensive fix
        </span>
      </div>
    </div>
  );
};
