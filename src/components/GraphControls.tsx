import React from 'react';
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';

export interface GraphControlsProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  fitLabel?: string;
  extraActions?: React.ReactNode;
  className?: string;
}

export const GraphControls: React.FC<GraphControlsProps> = ({
  onZoomIn,
  onZoomOut,
  onFit,
  fitLabel = 'Fit Network',
  extraActions,
  className = '',
}) => {
  return (
    <div
      className={`flex items-center gap-1 bg-[#0a1726]/95 border border-[#84979a40] rounded-xl p-1 backdrop-blur-md shadow-2xl z-20 select-none ${className}`}
    >
      <button
        onClick={onZoomIn}
        className="px-2.5 py-1 rounded-lg flex items-center gap-1.5 text-xs font-medium text-[#c0d0dc] hover:text-white hover:bg-[#071321] transition-colors cursor-pointer"
        title="Zoom In (+)"
      >
        <ZoomIn className="w-3.5 h-3.5 text-[#a8e2dc]" />
        <span>Zoom In</span>
      </button>

      <button
        onClick={onZoomOut}
        className="px-2.5 py-1 rounded-lg flex items-center gap-1.5 text-xs font-medium text-[#c0d0dc] hover:text-white hover:bg-[#071321] transition-colors cursor-pointer"
        title="Zoom Out (−)"
      >
        <ZoomOut className="w-3.5 h-3.5 text-[#a8e2dc]" />
        <span>Zoom Out</span>
      </button>

      <div className="w-[1px] h-3.5 bg-[#182c3f] my-auto" />

      <button
        onClick={onFit}
        className="px-2.5 py-1 rounded-lg flex items-center gap-1.5 text-xs font-medium text-[#c0d0dc] hover:text-white hover:bg-[#071321] transition-colors cursor-pointer"
        title={fitLabel}
      >
        <Maximize2 className="w-3.5 h-3.5 text-[#a8e2dc]" />
        <span>{fitLabel}</span>
      </button>

      {extraActions && (
        <>
          <div className="w-[1px] h-3.5 bg-[#182c3f] my-auto" />
          {extraActions}
        </>
      )}
    </div>
  );
};
