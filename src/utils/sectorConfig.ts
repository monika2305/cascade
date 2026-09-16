import type { Sector } from '../types/infrastructure';
import { Zap, Droplets, Car, Activity, Radio, ShieldAlert, Box } from 'lucide-react';

export const getSectorConfig = (sector: Sector) => {
  switch (sector) {
    case 'Power':
      return {
        icon: Zap,
        color: 'text-amber-400 bg-amber-400/10 border-amber-400/30',
        dotColor: 'bg-amber-400',
      };
    case 'Water':
      return {
        icon: Droplets,
        color: 'text-cyan-400 bg-cyan-400/10 border-cyan-400/30',
        dotColor: 'bg-cyan-400',
      };
    case 'Transport':
      return {
        icon: Car,
        color: 'text-blue-400 bg-blue-400/10 border-blue-400/30',
        dotColor: 'bg-blue-400',
      };
    case 'Health':
      return {
        icon: Activity,
        color: 'text-rose-400 bg-rose-400/10 border-rose-400/30',
        dotColor: 'bg-rose-400',
      };
    case 'Communication':
      return {
        icon: Radio,
        color: 'text-purple-400 bg-purple-400/10 border-purple-400/30',
        dotColor: 'bg-purple-400',
      };
    case 'Emergency Services':
      return {
        icon: ShieldAlert,
        color: 'text-red-400 bg-red-400/10 border-red-400/30',
        dotColor: 'bg-red-400',
      };
    default:
      return {
        icon: Box,
        color: 'text-slate-300 bg-slate-800 border-slate-700',
        dotColor: 'bg-slate-400',
      };
  }
};
