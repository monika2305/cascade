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
      className={`flex items-center gap-1.5 bg-slate-900/95 border border-slate-700/80 rounded-2xl p-1.5 backdrop-blur-md shadow-2xl z-20 ${className}`}
    >
      <button
        onClick={onZoomIn}
        className="px-2.5 py-1.5 rounded-xl flex items-center gap-1.5 text-xs font-bold text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
        title="Zoom In (+)"
      >
        <ZoomIn className="w-3.5 h-3.5 text-cyan-400" />
        <span>Zoom In</span>
      </button>

      <button
        onClick={onZoomOut}
        className="px-2.5 py-1.5 rounded-xl flex items-center gap-1.5 text-xs font-bold text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
        title="Zoom Out (−)"
      >
        <ZoomOut className="w-3.5 h-3.5 text-cyan-400" />
        <span>Zoom Out</span>
      </button>

      <div className="w-[1px] h-4 bg-slate-800 my-auto" />

      <button
        onClick={onFit}
        className="px-2.5 py-1.5 rounded-xl flex items-center gap-1.5 text-xs font-bold text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
        title={fitLabel}
      >
        <Maximize2 className="w-3.5 h-3.5 text-emerald-400" />
        <span>{fitLabel}</span>
      </button>

      {extraActions && (
        <>
          <div className="w-[1px] h-4 bg-slate-800 my-auto" />
          {extraActions}
        </>
      )}
    </div>
  );
};
