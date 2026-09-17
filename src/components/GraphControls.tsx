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
      className={`flex flex-col items-center gap-1 bg-[#0a1726]/90 border border-[#182c3f] hover:border-[#84979a40] rounded-xl p-1.5 backdrop-blur-md shadow-2xl z-20 select-none transition-colors ${className}`}
    >
      <button
        type="button"
        onClick={onZoomIn}
        className="p-2 rounded-lg text-[#c0d0dc] hover:text-white hover:bg-[#0f2338] transition-colors cursor-pointer"
        title="Zoom In"
        aria-label="Zoom In"
      >
        <ZoomIn className="w-4 h-4 text-[#a8e2dc]" />
      </button>

      <button
        type="button"
        onClick={onZoomOut}
        className="p-2 rounded-lg text-[#c0d0dc] hover:text-white hover:bg-[#0f2338] transition-colors cursor-pointer"
        title="Zoom Out"
        aria-label="Zoom Out"
      >
        <ZoomOut className="w-4 h-4 text-[#a8e2dc]" />
      </button>

      <div className="w-4 h-[1px] bg-[#182c3f] my-0.5" />

      <button
        type="button"
        onClick={onFit}
        className="p-2 rounded-lg text-[#c0d0dc] hover:text-white hover:bg-[#0f2338] transition-colors cursor-pointer"
        title={fitLabel}
        aria-label={fitLabel}
      >
        <Maximize2 className="w-4 h-4 text-[#a8e2dc]" />
      </button>

      {extraActions && (
        <>
          <div className="w-4 h-[1px] bg-[#182c3f] my-0.5" />
          {extraActions}
        </>
      )}
    </div>
  );
};

