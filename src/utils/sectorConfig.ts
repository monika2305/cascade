import type { Sector } from '../types/infrastructure';
import { Zap, Droplets, Car, Activity, Radio, AlertTriangle, Box } from 'lucide-react';

export interface SectorConfig {
  icon: React.ElementType;
  hex: string;
  borderHex: string;
  bgHex: string;
  glowHex: string;
  darkHex: string;
  color: string;
  dotColor: string;
}

export const getSectorConfig = (sector: Sector | string): SectorConfig => {
  const s = (sector || '').toLowerCase();

  if (s.includes('power') || s.includes('energy') || s.includes('electric')) {
    return {
      icon: Zap,
      hex: '#f59e0b',
      borderHex: '#f59e0b',
      bgHex: 'rgba(245, 158, 11, 0.12)',
      glowHex: 'rgba(245, 158, 11, 0.45)',
      darkHex: '#78350f',
      color: 'text-amber-400 bg-amber-400/10 border-amber-400/30',
      dotColor: 'bg-amber-400',
    };
  }

  if (s.includes('water') || s.includes('hydro') || s.includes('sewer') || s.includes('treatment')) {
    return {
      icon: Droplets,
      hex: '#3b82f6',
      borderHex: '#3b82f6',
      bgHex: 'rgba(59, 130, 246, 0.12)',
      glowHex: 'rgba(59, 130, 246, 0.45)',
      darkHex: '#1e40af',
      color: 'text-blue-400 bg-blue-400/10 border-blue-400/30',
      dotColor: 'bg-blue-400',
    };
  }

  if (s.includes('transport') || s.includes('transit') || s.includes('road') || s.includes('corridor') || s.includes('bridge') || s.includes('overpass')) {
    return {
      icon: Car,
      hex: '#10b981',
      borderHex: '#10b981',
      bgHex: 'rgba(16, 185, 129, 0.12)',
      glowHex: 'rgba(16, 185, 129, 0.45)',
      darkHex: '#065f46',
      color: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/30',
      dotColor: 'bg-emerald-400',
    };
  }

  if (s.includes('comm') || s.includes('telecom') || s.includes('radio') || s.includes('network') || s.includes('relay')) {
    return {
      icon: Radio,
      hex: '#a855f7',
      borderHex: '#a855f7',
      bgHex: 'rgba(168, 85, 247, 0.12)',
      glowHex: 'rgba(168, 85, 247, 0.45)',
      darkHex: '#581c87',
      color: 'text-purple-400 bg-purple-400/10 border-purple-400/30',
      dotColor: 'bg-purple-400',
    };
  }

  if (s.includes('health') || s.includes('hospital') || s.includes('clinic') || s.includes('medical')) {
    return {
      icon: Activity,
      hex: '#ec4899',
      borderHex: '#ec4899',
      bgHex: 'rgba(236, 72, 153, 0.12)',
      glowHex: 'rgba(236, 72, 153, 0.45)',
      darkHex: '#831843',
      color: 'text-pink-400 bg-pink-400/10 border-pink-400/30',
      dotColor: 'bg-pink-400',
    };
  }

  if (s.includes('emerg') || s.includes('fire') || s.includes('police') || s.includes('safety') || s.includes('ambulance')) {
    return {
      icon: AlertTriangle,
      hex: '#ef4444',
      borderHex: '#ef4444',
      bgHex: 'rgba(239, 68, 68, 0.12)',
      glowHex: 'rgba(239, 68, 68, 0.45)',
      darkHex: '#7f1d1d',
      color: 'text-red-400 bg-red-400/10 border-red-400/30',
      dotColor: 'bg-red-400',
    };
  }

  return {
    icon: Box,
    hex: '#94a3b8',
    borderHex: '#475569',
    bgHex: 'rgba(148, 163, 184, 0.12)',
    glowHex: 'rgba(148, 163, 184, 0.45)',
    darkHex: '#334155',
    color: 'text-slate-300 bg-slate-800 border-slate-700',
    dotColor: 'bg-slate-400',
  };
};

export const SECTOR_ORDER: Record<string, number> = {
  power: 0,
  water: 1,
  transport: 2,
  communication: 3,
  health: 4,
  emergency: 5,
  'emergency services': 5,
};

export const getSectorOrderIndex = (sector?: string): number => {
  if (!sector) return 99;
  const s = sector.toLowerCase();
  for (const [key, idx] of Object.entries(SECTOR_ORDER)) {
    if (s.includes(key)) return idx;
  }
  return 99;
};

