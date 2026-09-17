import React from 'react';
import type { Asset } from '../types/infrastructure';
import type { LayoutNode } from '../utils/graphLayout';
import { getSectorConfig } from '../utils/sectorConfig';

export type NodeVisualStatus =
  | 'normal'
  | 'failed'
  | 'affected'
  | 'recovered'
  | 'protected'
  | 'dimmed'
  | 'backup_source';

export interface NetworkNodeCardProps {
  node: LayoutNode;
  asset: Asset;
  status?: NodeVisualStatus;
  badgeText?: string;
  badgeBg?: string;
  isSelected?: boolean;
  isHovered?: boolean;
  onClick?: (e: React.MouseEvent) => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  className?: string;
}

export const NetworkNodeCard: React.FC<NetworkNodeCardProps> = ({
  node,
  asset,
  status = 'normal',
  badgeText,
  badgeBg,
  isSelected = false,
  isHovered = false,
  onClick,
  onMouseEnter,
  onMouseLeave,
  className = '',
}) => {
  const sectorCfg = getSectorConfig(asset.sector);
  const SectorIcon = sectorCfg.icon;

  let bgColor = '#08131e';
  let borderColor = sectorCfg.borderHex;
  let glowColor = '';
  let glowOpacity = 0;
  let isDimmed = status === 'dimmed';
  let iconBg = sectorCfg.bgHex;
  let iconColor = sectorCfg.hex;
  let nameColor = '#f2f4f0';
  let subColor = '#8096a4';
  let pulseAnimation = false;

  // Status-driven visual overrides
  switch (status) {
    case 'failed':
      bgColor = '#22080d';
      borderColor = '#ef4444';
      glowColor = 'rgba(239, 68, 68, 0.65)';
      glowOpacity = 0.85;
      iconBg = 'rgba(239, 68, 68, 0.18)';
      iconColor = '#ef4444';
      nameColor = '#fee2e2';
      subColor = '#fca5a5';
      break;

    case 'affected':
      bgColor = '#1e1106';
      borderColor = '#f59e0b';
      glowColor = 'rgba(245, 158, 11, 0.65)';
      glowOpacity = 0.85;
      iconBg = 'rgba(245, 158, 11, 0.18)';
      iconColor = '#f59e0b';
      nameColor = '#fef3c7';
      subColor = '#fde68a';
      break;

    case 'recovered':
    case 'protected':
      bgColor = '#07261e';
      borderColor = '#10b981';
      glowColor = 'rgba(16, 185, 129, 0.7)';
      glowOpacity = 0.9;
      iconBg = 'rgba(16, 185, 129, 0.2)';
      iconColor = '#10b981';
      nameColor = '#d1fae5';
      subColor = '#a7f3d0';
      pulseAnimation = true;
      break;

    case 'backup_source':
      bgColor = '#08252a';
      borderColor = '#a8e2dc';
      glowColor = 'rgba(168, 226, 220, 0.65)';
      glowOpacity = 0.8;
      iconBg = 'rgba(168, 226, 220, 0.18)';
      iconColor = '#a8e2dc';
      nameColor = '#e6fffa';
      subColor = '#a8e2dc';
      break;

    case 'dimmed':
      bgColor = '#08131e';
      borderColor = '#182c3f';
      iconBg = '#0a1726';
      iconColor = sectorCfg.hex;
      nameColor = '#64748b';
      subColor = '#475569';
      break;

    case 'normal':
    default:
      if (isSelected || isHovered) {
        glowColor = sectorCfg.glowHex;
        glowOpacity = isSelected ? 0.85 : 0.45;
      }
      break;
  }

  // Hover or selection overrides
  if (isSelected) {
    borderColor = '#ffffff';
    glowColor = sectorCfg.glowHex;
    glowOpacity = 0.85;
  } else if (isHovered && status === 'normal') {
    glowColor = sectorCfg.glowHex;
    glowOpacity = 0.55;
  }

  // Determine badge dimensions & truncation limits
  const hasBadge = Boolean(badgeText);
  const badgeWidth = badgeText && badgeText.length > 8 ? 72 : 54;
  const maxNameLen = hasBadge ? (badgeWidth > 60 ? 11 : 13) : 17;
  const displayName =
    asset.name.length > maxNameLen
      ? asset.name.substring(0, maxNameLen - 2) + '...'
      : asset.name;

  return (
    <g
      transform={`translate(${node.x}, ${node.y})`}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={`group ${onClick ? 'cursor-pointer' : 'cursor-default'} ${className}`}
    >
      {/* Outer Glow Halo on Focus / State Alert */}
      {glowColor && glowOpacity > 0 && (
        <rect
          x={-3}
          y={-3}
          width={node.width + 6}
          height={node.height + 6}
          rx={17}
          fill="none"
          stroke={borderColor}
          strokeWidth={isSelected ? 2.5 : 1.8}
          strokeOpacity={glowOpacity}
          style={{ filter: `drop-shadow(0 0 10px ${glowColor})` }}
          className={pulseAnimation ? 'animate-pulse' : undefined}
        />
      )}

      {/* Main Node Card Surface */}
      <rect
        x={0}
        y={0}
        width={node.width}
        height={node.height}
        rx={14}
        fill={bgColor}
        stroke={borderColor}
        strokeWidth={isSelected ? 2 : status !== 'normal' && status !== 'dimmed' ? 1.8 : 1.3}
        strokeOpacity={isDimmed ? 0.35 : 1}
        className="transition-all duration-200"
      />

      {/* Left Icon Container Box */}
      <rect
        x={10}
        y={10}
        width={36}
        height={36}
        rx={9}
        fill={iconBg}
        stroke={borderColor}
        strokeWidth={1}
        strokeOpacity={isDimmed ? 0.2 : 0.45}
      />

      <foreignObject x={10} y={10} width={36} height={36} className="pointer-events-none">
        <div
          className="w-full h-full flex items-center justify-center transition-opacity"
          style={{ color: iconColor, opacity: isDimmed ? 0.35 : 1 }}
        >
          <SectorIcon className="w-4 h-4" />
        </div>
      </foreignObject>

      {/* Asset Name Label */}
      <text
        x={56}
        y={26}
        fill={nameColor}
        fontSize="12.5"
        fontWeight="600"
        className="pointer-events-none tracking-tight select-none"
      >
        {displayName}
      </text>

      {/* Sector Subtitle Label */}
      <text
        x={56}
        y={43}
        fill={subColor}
        fontSize="10"
        fontWeight="400"
        className="pointer-events-none tracking-wide select-none"
      >
        {asset.sector}
      </text>

      {/* Status Badge (Top-Right) */}
      {hasBadge && (
        <foreignObject
          x={node.width - badgeWidth - 8}
          y={8}
          width={badgeWidth}
          height={20}
          className="pointer-events-none"
        >
          <div
            className={`text-[8.5px] font-bold px-1.5 py-0.5 rounded text-center tracking-wider uppercase truncate ${
              badgeBg || 'bg-[#071321] text-[#a9b9c3] border border-[#182c3f]'
            }`}
          >
            {badgeText}
          </div>
        </foreignObject>
      )}
    </g>
  );
};
