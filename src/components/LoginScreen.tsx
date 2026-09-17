import React, { useState } from 'react';
import type { UserRole } from '../types/infrastructure';
import { ROLES } from '../types/roles';
import { GitFork, ArrowRight, User } from 'lucide-react';

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
    <div className="w-full h-full min-h-screen flex items-center justify-center p-6 bg-slate-950 text-slate-100 relative overflow-hidden">
      {/* Subtle background glow */}
      <div className="absolute w-96 h-96 rounded-full bg-cyan-500/10 blur-3xl pointer-events-none -top-20 -left-20" />
      <div className="absolute w-96 h-96 rounded-full bg-blue-600/10 blur-3xl pointer-events-none -bottom-20 -right-20" />

      <div className="w-full max-w-md bg-slate-900/90 border border-slate-800 rounded-3xl p-8 shadow-2xl backdrop-blur-xl relative z-10 animate-fade-in">
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-slate-950 shadow-lg shadow-cyan-500/25 mb-4">
            <GitFork className="w-7 h-7 rotate-90" />
          </div>
          <h1 className="text-2xl font-black text-white tracking-wider">CASCADE</h1>
          <p className="text-xs text-slate-400 mt-1">City Infrastructure Analysis</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Name input */}
          <div>
            <label htmlFor="login-name" className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
              Name
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
              <input
                id="login-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter your name"
                required
                className="w-full bg-slate-950 border border-slate-700 rounded-xl py-2.5 pl-10 pr-4 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500 transition-colors"
              />
            </div>
          </div>

          {/* Role Dropdown */}
          <div>
            <label htmlFor="login-role" className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
              Role
            </label>
            <select
              id="login-role"
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value as UserRole)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl py-2.5 px-4 text-sm text-white focus:outline-none focus:border-cyan-500 transition-colors cursor-pointer"
            >
              <option value="" disabled className="text-slate-500">
                Select your role
              </option>
              {ROLES.map((r) => (
                <option key={r.id} value={r.id} className="bg-slate-900 text-white">
                  {r.name}
                </option>
              ))}
            </select>
          </div>

          {/* Submit button */}
          <button
            type="submit"
            disabled={!isValid}
            className={`w-full py-3.5 rounded-xl font-black text-sm uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${
              isValid
                ? 'bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 shadow-lg shadow-cyan-500/25 cursor-pointer active:scale-98 group'
                : 'bg-slate-800 text-slate-500 cursor-not-allowed opacity-50'
            }`}
          >
            <span>CONTINUE</span>
            <ArrowRight className={`w-4 h-4 ${isValid ? 'group-hover:translate-x-1 transition-transform' : ''}`} />
          </button>

          {/* Back to Overview / Landing Page */}
          {onBackToLanding && (
            <div className="pt-1 text-center">
              <button
                type="button"
                onClick={onBackToLanding}
                className="text-xs font-semibold text-slate-400 hover:text-cyan-400 transition-colors cursor-pointer"
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
