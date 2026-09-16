import React from 'react';
import type { Sector } from '../types/infrastructure';
import { getSectorConfig } from '../utils/sectorConfig';

interface SectorBadgeProps {
  sector: Sector;
  count?: number;
  size?: 'sm' | 'md' | 'lg';
}

export const SectorBadge: React.FC<SectorBadgeProps> = ({ sector, count, size = 'md' }) => {
  const config = getSectorConfig(sector);
  const Icon = config.icon;

  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5 gap-1.5',
    md: 'text-sm px-2.5 py-1 gap-2',
    lg: 'text-base px-3.5 py-1.5 gap-2.5 font-medium',
  }[size];

  const iconSizes = {
    sm: 'w-3 h-3',
    md: 'w-4 h-4',
    lg: 'w-5 h-5',
  }[size];

  return (
    <span
      className={`inline-flex items-center rounded-md border ${config.color} ${sizeClasses} transition-all`}
    >
      <Icon className={iconSizes} />
      <span>{sector}</span>
      {typeof count === 'number' && (
        <span className="ml-1 px-1.5 py-0.2 rounded-full bg-white/10 text-xs font-semibold">
          {count}
        </span>
      )}
    </span>
  );
};
