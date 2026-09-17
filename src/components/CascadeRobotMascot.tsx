import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';

interface CascadeRobotMascotProps {
  onClick: () => void;
  isOpen: boolean;
  contextMessage?: string;
}

export const CascadeRobotMascot: React.FC<CascadeRobotMascotProps> = ({
  onClick,
  isOpen,
  contextMessage = 'Ask me about this scenario!',
}) => {
  const [showBubble, setShowBubble] = useState<boolean>(true);
  const [hasDismissed, setHasDismissed] = useState<boolean>(false);

  // Auto-dismiss speech bubble after 8 seconds, or immediately if panel opened
  useEffect(() => {
    if (isOpen) {
      setShowBubble(false);
      return;
    }
    if (hasDismissed) return;
    setShowBubble(true);
    const timer = window.setTimeout(() => {
      setShowBubble(false);
    }, 8000);
    return () => window.clearTimeout(timer);
  }, [contextMessage, hasDismissed, isOpen]);

  const handleDismissBubble = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowBubble(false);
    setHasDismissed(true);
  };

  return (
    <div className="absolute left-6 bottom-6 z-40 flex flex-col items-start select-none pointer-events-auto">
      {/* Speech Bubble — Positioned neatly above the robot */}
      {showBubble && !isOpen && (
        <div className="mb-2.5 max-w-[220px] bg-slate-900/95 border border-cyan-500/50 rounded-2xl p-2.5 shadow-xl shadow-cyan-950/50 text-xs text-slate-100 animate-in fade-in slide-in-from-bottom-2 duration-300 relative backdrop-blur-md">
          <button
            onClick={handleDismissBubble}
            className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-slate-800 border border-slate-700 text-slate-400 hover:text-white flex items-center justify-center cursor-pointer text-[10px]"
            title="Dismiss"
          >
            <X className="w-2.5 h-2.5" />
          </button>
          <div className="flex items-center gap-1.5 text-[10px] font-black text-cyan-400 uppercase tracking-widest mb-0.5">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
            <span>CASCADE AI</span>
          </div>
          <p className="text-[11px] leading-snug font-medium text-slate-200">
            {contextMessage}
          </p>
          {/* Arrow pointing down to robot */}
          <div className="absolute left-6 -bottom-1.5 w-3 h-3 bg-slate-900 border-r border-b border-cyan-500/50 rotate-45" />
        </div>
      )}

      {/* Robot Trigger Button */}
      <button
        onClick={onClick}
        aria-label="Open CASCADE AI Copilot"
        className={`group relative flex flex-col items-center justify-center cursor-pointer transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-cyan-400/80 rounded-full ${
          isOpen ? 'scale-90 opacity-60 hover:opacity-100' : 'hover:scale-110 active:scale-95'
        }`}
        title="Open CASCADE AI Copilot"
      >
        {/* Ambient Cyan Aura Halo */}
        <div className="absolute -inset-2 bg-gradient-to-t from-cyan-500/30 to-blue-500/20 rounded-full blur-md group-hover:from-cyan-400/50 group-hover:to-blue-400/30 transition-all duration-300 animate-pulse" />

        {/* Robot Visual Body Container */}
        <div className="relative w-16 h-18 flex flex-col items-center justify-center animate-robot-float">
          {/* SVG Futuristic Robot Mascot */}
          <svg
            viewBox="0 0 100 115"
            className="w-16 h-18 drop-shadow-[0_8px_16px_rgba(6,182,212,0.35)] transition-transform duration-300 group-hover:-rotate-3"
          >
            <defs>
              {/* White/Silver Shell Gradient */}
              <linearGradient id="robotShell" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#ffffff" />
                <stop offset="60%" stopColor="#f1f5f9" />
                <stop offset="100%" stopColor="#cbd5e1" />
              </linearGradient>

              {/* Dark Shading Gradient */}
              <linearGradient id="robotDark" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#334155" />
                <stop offset="100%" stopColor="#0f172a" />
              </linearGradient>

              {/* Cyan Glow Gradient */}
              <linearGradient id="cyanGlow" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#22d3ee" />
                <stop offset="100%" stopColor="#0891b2" />
              </linearGradient>

              {/* Eye Gradient */}
              <radialGradient id="eyeIris" cx="45%" cy="45%" r="55%">
                <stop offset="0%" stopColor="#67e8f9" />
                <stop offset="65%" stopColor="#06b6d4" />
                <stop offset="100%" stopColor="#0e7490" />
              </radialGradient>

              {/* Thruster Beam Gradient */}
              <linearGradient id="thrusterBeam" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="rgba(34, 211, 238, 0.9)" />
                <stop offset="70%" stopColor="rgba(6, 182, 212, 0.4)" />
                <stop offset="100%" stopColor="rgba(6, 182, 212, 0)" />
              </linearGradient>
            </defs>

            {/* Antennas / Sensors */}
            <line x1="36" y1="14" x2="30" y2="4" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round" />
            <circle cx="29" cy="3" r="2.5" fill="#22d3ee" className="animate-ping" style={{ animationDuration: '3s' }} />
            <circle cx="29" cy="3" r="2.5" fill="#06b6d4" />

            <line x1="64" y1="14" x2="70" y2="4" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round" />
            <circle cx="71" cy="3" r="2.5" fill="#22d3ee" className="animate-ping" style={{ animationDuration: '3s', animationDelay: '1.5s' }} />
            <circle cx="71" cy="3" r="2.5" fill="#06b6d4" />

            {/* Bottom Antigravity Thruster Glow Beam */}
            <polygon points="40,94 60,94 66,112 34,112" fill="url(#thrusterBeam)" className="animate-pulse" />
            <ellipse cx="50" cy="112" rx="14" ry="3" fill="rgba(34, 211, 238, 0.6)" className="animate-ping" style={{ animationDuration: '2s' }} />

            {/* Robot Body / Torso */}
            <ellipse cx="50" cy="80" rx="22" ry="18" fill="url(#robotShell)" stroke="#94a3b8" strokeWidth="1.5" />

            {/* Shoulder Ball Joints & Cute Arms */}
            {/* Left Arm (Waving subtly) */}
            <circle cx="25" cy="74" r="5" fill="#64748b" />
            <path d="M25,74 Q14,64 12,52" fill="none" stroke="url(#robotShell)" strokeWidth="6" strokeLinecap="round" />
            <circle cx="12" cy="50" r="4.5" fill="#475569" />
            {/* Waving Hand Fingers */}
            <circle cx="9" cy="46" r="2" fill="#06b6d4" />
            <circle cx="13" cy="44" r="2" fill="#06b6d4" />
            <circle cx="17" cy="47" r="2" fill="#06b6d4" />

            {/* Right Arm */}
            <circle cx="75" cy="74" r="5" fill="#64748b" />
            <path d="M75,74 Q84,80 82,90" fill="none" stroke="url(#robotShell)" strokeWidth="6" strokeLinecap="round" />
            <circle cx="82" cy="91" r="4.5" fill="#475569" />

            {/* Chest CASCADE Core "C" Emblem */}
            <circle cx="50" cy="79" r="9" fill="url(#robotDark)" />
            <circle cx="50" cy="79" r="8" fill="none" stroke="#22d3ee" strokeWidth="1.5" className="animate-pulse" />
            {/* Glowing "C" for CASCADE */}
            <path
              d="M54,74.5 A5.5,5.5 0 1,0 54,83.5"
              fill="none"
              stroke="#22d3ee"
              strokeWidth="2.4"
              strokeLinecap="round"
            />

            {/* Neck Joint */}
            <ellipse cx="50" cy="62" rx="10" ry="4" fill="#475569" />

            {/* Robot Head */}
            <rect x="18" y="12" width="64" height="52" rx="26" fill="url(#robotShell)" stroke="#cbd5e1" strokeWidth="1.5" />
            {/* Ear Cap Sensors */}
            <ellipse cx="18" cy="38" rx="3.5" ry="8" fill="#475569" />
            <ellipse cx="18" cy="38" rx="2" ry="5" fill="#06b6d4" />
            <ellipse cx="82" cy="38" rx="3.5" ry="8" fill="#475569" />
            <ellipse cx="82" cy="38" rx="2" ry="5" fill="#06b6d4" />

            {/* Head Gloss / Highlight Curve */}
            <path d="M28,18 Q50,14 72,18" fill="none" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" opacity="0.8" />

            {/* Eye Sockets */}
            <ellipse cx="37" cy="38" rx="13" ry="14" fill="#0f172a" />
            <ellipse cx="63" cy="38" rx="13" ry="14" fill="#0f172a" />

            {/* Cyan Digital Glowing Irises */}
            <ellipse cx="37" cy="38" rx="10.5" ry="11.5" fill="url(#eyeIris)" />
            <ellipse cx="63" cy="38" rx="10.5" ry="11.5" fill="url(#eyeIris)" />

            {/* Pupils */}
            <circle cx="37" cy="38" r="6" fill="#083344" />
            <circle cx="63" cy="38" r="6" fill="#083344" />

            {/* Specular Glints (Cute Big Eyed Look) */}
            <circle cx="34" cy="34" r="3.5" fill="#ffffff" />
            <circle cx="40" cy="41" r="1.5" fill="#ffffff" />
            <circle cx="60" cy="34" r="3.5" fill="#ffffff" />
            <circle cx="66" cy="41" r="1.5" fill="#ffffff" />

            {/* Friendly Gentle Smile */}
            <path d="M44,52 Q50,56 56,52" fill="none" stroke="#334155" strokeWidth="2.2" strokeLinecap="round" />
          </svg>

          {/* Bottom Shadow / Pulse ring */}
          <div className="w-10 h-1.5 rounded-full bg-cyan-400/30 blur-[2px] mt-1 animate-pulse" />
        </div>
      </button>

      {/* Global CSS for lightweight floating animation */}
      <style>{`
        @keyframes robotFloat {
          0%, 100% {
            transform: translateY(0px);
          }
          50% {
            transform: translateY(-5px);
          }
        }
        .animate-robot-float {
          animation: robotFloat 3.2s ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .animate-robot-float {
            animation: none !important;
          }
        }
      `}</style>
    </div>
  );
};
