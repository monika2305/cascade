import React, { useState } from 'react';
import type { UserRole } from '../types/infrastructure';
import { ROLES } from '../types/roles';
import { BrandMark } from '../landing/components/Icons';
import { ArrowRight, User } from 'lucide-react';

interface LoginScreenProps {
  onLogin: (name: string, role: UserRole) => void;
  onBackToLanding?: () => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin, onBackToLanding }) => {
  const [name, setName] = useState('');
  const [selectedRole, setSelectedRole] = useState<UserRole | ''>('');

  const isValid = name.trim().length > 0 && selectedRole !== '';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isValid && selectedRole) {
      onLogin(name.trim(), selectedRole);
    }
  };

  return (
    <div className="w-full h-full min-h-screen flex items-center justify-center p-6 bg-[#061019] text-[#f2f4f0] relative overflow-hidden select-none">
      {/* Subtle atmospheric ambient glow matching landing page */}
      <div className="absolute w-[600px] h-[600px] rounded-full bg-radial from-[#0e2a3d]/25 to-transparent blur-3xl pointer-events-none -top-32 -left-32" />
      <div className="absolute w-[500px] h-[500px] rounded-full bg-radial from-[#0d2233]/20 to-transparent blur-3xl pointer-events-none -bottom-28 -right-28" />

      <div className="w-full max-w-md bg-[#0a1726]/90 border border-[#84979a35] rounded-2xl p-8 shadow-2xl backdrop-blur-xl relative z-10 animate-in fade-in zoom-in-95 duration-200">
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center mb-7">
          <div className="w-12 h-12 rounded-xl bg-[#071321] border border-[#84979a40] flex items-center justify-center text-[#a8e2dc] shadow-sm mb-3.5">
            <BrandMark />
          </div>
          <div className="flex items-center justify-center gap-2 text-[10px] font-medium tracking-[0.2em] text-[#b9cecf] uppercase mb-1">
            <span className="w-4 h-px bg-[#addcd7]" />
            <span>Infrastructure Intelligence</span>
            <span className="w-4 h-px bg-[#addcd7]" />
          </div>
          <h1 className="text-xl font-semibold text-[#f2f4f0] tracking-[0.18em] uppercase">CASCADE</h1>
          <p className="text-xs text-[#8096a4] mt-1 font-normal">
            Enter your credentials to access resilience analysis
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Name input */}
          <div>
            <label htmlFor="login-name" className="block text-[11px] font-medium uppercase tracking-[0.14em] text-[#a9b9c3] mb-1.5">
              Operator Name
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-[#536f82] absolute left-3.5 top-3" />
              <input
                id="login-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Sarah Connor"
                required
                className="w-full bg-[#061019] border border-[#182c3f] rounded-lg py-2.5 pl-10 pr-4 text-xs text-[#f2f4f0] placeholder-[#4e6475] focus:outline-none focus:border-[#a8e2dc] focus:ring-1 focus:ring-[#a8e2dc]/40 transition-colors"
              />
            </div>
          </div>

          {/* Role Dropdown */}
          <div>
            <label htmlFor="login-role" className="block text-[11px] font-medium uppercase tracking-[0.14em] text-[#a9b9c3] mb-1.5">
              Command Role
            </label>
            <select
              id="login-role"
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value as UserRole)}
              className="w-full bg-[#061019] border border-[#182c3f] rounded-lg py-2.5 px-3.5 text-xs text-[#f2f4f0] focus:outline-none focus:border-[#a8e2dc] focus:ring-1 focus:ring-[#a8e2dc]/40 transition-colors cursor-pointer"
            >
              <option value="" disabled className="text-slate-500">
                Select your role
              </option>
              {ROLES.map((r) => (
                <option key={r.id} value={r.id} className="bg-[#0a1726] text-white">
                  {r.name}
                </option>
              ))}
            </select>
          </div>

          {/* Submit button */}
          <button
            type="submit"
            disabled={!isValid}
            className={`w-full py-3 rounded-lg font-semibold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${
              isValid
                ? 'bg-[#e1ede6] hover:bg-white text-[#112826] shadow-md shadow-cyan-950/20 cursor-pointer active:scale-98 group'
                : 'bg-[#0d1e2e] text-[#4a6375] border border-[#182c3f] cursor-not-allowed opacity-60'
            }`}
          >
            <span>CONTINUE TO DASHBOARD</span>
            <ArrowRight className={`w-3.5 h-3.5 ${isValid ? 'group-hover:translate-x-0.5 transition-transform' : ''}`} />
          </button>

          {/* Back to Overview / Landing Page */}
          {onBackToLanding && (
            <div className="pt-2 text-center">
              <button
                type="button"
                onClick={onBackToLanding}
                className="text-xs font-medium text-[#8096a4] hover:text-[#a8e2dc] transition-colors cursor-pointer"
              >
                ← Back to Overview
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
};

