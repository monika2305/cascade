import type { RoleConfig } from './infrastructure';

export const ROLES: RoleConfig[] = [
  {
    id: 'general',
    name: 'GENERAL VIEW',
    subtitle: 'See the complete city system.',
    icon: '🏙️',
    badge: 'Best for Demo',
    focusDescription: 'Complete overview of all interconnected city systems.',
    primarySectors: ['Power', 'Water', 'Transport', 'Health', 'Communication', 'Emergency Services'],
  },
  {
    id: 'authority',
    name: 'CITY AUTHORITY',
    subtitle: 'See city-wide impact and priorities.',
    icon: '🏛️',
    focusDescription: 'Focus on city-wide impact, hospital capacity and public services.',
    primarySectors: ['Health', 'Emergency Services', 'Power', 'Water'],
  },
  {
    id: 'emergency',
    name: 'EMERGENCY TEAM',
    subtitle: 'Focus on critical services and response.',
    icon: '🚨',
    focusDescription: 'Focus on trauma centers, dispatch towers, and emergency routes.',
    primarySectors: ['Health', 'Emergency Services', 'Communication'],
  },
  {
    id: 'operator',
    name: 'INFRASTRUCTURE OPERATOR',
    subtitle: 'Focus on infrastructure operations.',
    icon: '🔧',
    focusDescription: 'Focus on power grids, water networks, and transit lines.',
    primarySectors: ['Power', 'Water', 'Transport'],
  },
];
