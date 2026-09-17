import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import type { InfrastructureDataset } from '../types/infrastructure';
import { simulateCascade, getWhyPath, type CascadeResult, type WhyStep } from '../utils/cascade';
import { computeGraphLayout } from '../utils/graphLayout';
import { useGraphViewport } from '../hooks/useGraphViewport';
import { GraphControls } from './GraphControls';
import { NetworkNodeCard } from './NetworkNodeCard';
import { X, Zap, RotateCcw } from 'lucide-react';

interface FailureTestScreenProps {
  dataset: InfrastructureDataset;
  initialAssetId?: string | null;
}

export const FailureTestScreen: React.FC<FailureTestScreenProps> = ({
  dataset,
  initialAssetId,
}) => {
  // Currently selected asset to fail (defaults to passed asset or first in dataset)
  const [failedAssetId, setFailedAssetId] = useState<string>(
    initialAssetId || dataset.assets[0]?.id || ''
  );

  // Simulation states
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [activeStep, setActiveStep] = useState<number>(-1); // -1 = show all reached steps
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [whyNodeId, setWhyNodeId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // If initialAssetId changes from outside (e.g. clicked TEST FAILURE in S4):
  useEffect(() => {
    if (initialAssetId) {
      setFailedAssetId(initialAssetId);
      setIsSimulating(false);
      setWhyNodeId(null);
    }
  }, [initialAssetId]);

  // Calculate cascade deterministically
  const cascadeResult: CascadeResult = useMemo(() => {
    return simulateCascade(dataset, failedAssetId);
  }, [dataset, failedAssetId]);

  // Layout calculation
  const layoutNodes = useMemo(() => {
    return computeGraphLayout(dataset);
  }, [dataset]);

  // Unified Graph Viewport Hook
  const {
    zoom,
    pan,
    isDragging,
    fitGraph,
    zoomIn,
    zoomOut,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleWheel,
  } = useGraphViewport(containerRef, layoutNodes, {
    padding: 28,
    minZoom: 0.25,
    maxZoom: 2.5,
    targetMaxZoom: 1.85,
    targetOccupancy: 0.88,
  });

  // Animation interval ticker
  useEffect(() => {
    if (!isPlaying) return;

    const timer = window.setInterval(() => {
      setActiveStep((prev) => {
        if (prev < 0) return 0;
        if (prev >= cascadeResult.totalSteps) {
          setIsPlaying(false);
          return -1; // Show full impact
        }
        return prev + 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isPlaying, cascadeResult]);

  const handleStartCascade = () => {
    setIsSimulating(true);
    setActiveStep(0);
    setIsPlaying(true);
    setWhyNodeId(null);
  };

  const handleNextStep = () => {
    setIsSimulating(true);
    setIsPlaying(false);
    setActiveStep((prev) => {
      if (prev < 0) return 1;
      return Math.min(cascadeResult.totalSteps, prev + 1);
    });
  };

  const handleShowComplete = () => {
    setIsSimulating(true);
    setIsPlaying(false);
    setActiveStep(-1);
  };

  const handleReset = () => {
    setIsSimulating(false);
    setActiveStep(-1);
    setIsPlaying(false);
    setWhyNodeId(null);
  };

  const getNodeVisualState = useCallback(
    (assetId: string) => {
      if (!isSimulating) return 'normal';
      const info = cascadeResult.affectedNodes.get(assetId);
      if (!info) return 'dimmed';
      if (info.step === 0) return 'failed';

      if (activeStep === -1 || info.step <= activeStep) {
        return 'affected';
      }
      return 'dimmed';
    },
    [isSimulating, cascadeResult, activeStep]
  );

  // Causation chain: Root -> Target
  const whyPath: WhyStep[] = useMemo(() => {
    if (!whyNodeId) return [];
    return [...getWhyPath(dataset, cascadeResult, whyNodeId)].reverse();
  }, [dataset, cascadeResult, whyNodeId]);

  const whyAsset = whyNodeId ? dataset.assets.find((a) => a.id === whyNodeId) : null;


  return (
    <div className="w-full h-full flex-1 flex flex-col bg-[#061019] text-[#f2f4f0] overflow-hidden relative">
      {/* 1. Standardized Fixed-Height Header matching City Network (h-14) */}
      <div className="h-14 px-6 border-b border-[#182c3f] bg-[#071321]/90 flex items-center justify-between shrink-0 z-10 backdrop-blur-md">
        <div className="flex items-center gap-4 min-w-0">
          <div>
            <div className="flex items-center gap-1.5 text-[9px] font-medium tracking-[0.2em] text-[#b9cecf] uppercase">
              <span className="w-3 h-px bg-[#addcd7]" />
              <span>Simulation Lab</span>
            </div>
            <div className="flex items-center gap-3">
              <h1 className="text-xs font-semibold text-[#f2f4f0] uppercase tracking-wider">
                Failure Cascade Analysis
              </h1>
              {/* Trigger Outage Dropdown */}
              <div className="flex items-center gap-1.5 text-xs text-[#a9b9c3]">
                <span className="text-[11px] text-[#8096a4]">Trigger:</span>
                <select
                  value={failedAssetId}
                  onChange={(e) => {
                    setFailedAssetId(e.target.value);
                    handleReset();
                  }}
                  className="bg-[#0a1726] text-[#f2f4f0] font-medium text-xs rounded-lg px-2 py-0.5 border border-[#182c3f] focus:outline-none focus:border-[#a8e2dc]/60 cursor-pointer max-w-[200px] truncate"
                >
                  {dataset.assets.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.sector})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Simulation Stats Badge (inline, never shifts header height) */}
          {isSimulating && (
            <div className="hidden lg:flex items-center gap-2.5 text-[11px] font-mono bg-[#0a1726] border border-[#182c3f] px-3 py-1 rounded-xl">
              <span className="text-red-400 font-semibold">
                {cascadeResult.affectedNodes.size} Affected
              </span>
              <span className="text-[#182c3f]">•</span>
              <span className="text-amber-400 font-semibold">
                {cascadeResult.sectorsReached.length} Sectors
              </span>
              <span className="text-[#182c3f]">•</span>
              <span className="text-[#a8e2dc] font-semibold">
                {cascadeResult.totalSteps} Steps
              </span>
            </div>
          )}
        </div>

        {/* Buttons: START CASCADE, NEXT STEP, SHOW COMPLETE, RESET */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleStartCascade}
            className="px-3 py-1.5 bg-gradient-to-r from-red-600 to-amber-600 hover:from-red-500 hover:to-amber-500 text-white font-semibold text-xs tracking-wider uppercase rounded-xl shadow-md shadow-red-950/30 flex items-center gap-1.5 cursor-pointer transition-all active:scale-98"
          >
            <Zap className="w-3.5 h-3.5 fill-current" />
            <span>START CASCADE</span>
          </button>

          <button
            onClick={handleNextStep}
            className="px-3 py-1.5 bg-[#0a1726] hover:bg-[#0d1e2e] text-[#f2f4f0] font-medium text-xs rounded-xl border border-[#182c3f] hover:border-[#84979a40] cursor-pointer transition-colors"
          >
            NEXT STEP
          </button>

          <button
            onClick={handleShowComplete}
            className="px-3 py-1.5 bg-[#0a1726] hover:bg-[#0d1e2e] text-[#f2f4f0] font-medium text-xs rounded-xl border border-[#182c3f] hover:border-[#84979a40] cursor-pointer transition-colors hidden sm:block"
          >
            SHOW COMPLETE
          </button>

          <button
            onClick={handleReset}
            className="px-2.5 py-1.5 bg-transparent hover:bg-[#0a1726] text-[#a9b9c3] hover:text-[#f2f4f0] font-medium text-xs rounded-xl border border-[#182c3f] cursor-pointer flex items-center gap-1 transition-colors"
            title="Reset Simulation"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="hidden md:inline">RESET</span>
          </button>
        </div>
      </div>

      {/* Main Full Viewport Graph */}
      <div
        ref={containerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        className={`flex-1 w-full h-full relative select-none overflow-hidden bg-[#061019] bg-[radial-gradient(#182c3f_1px,transparent_1px)] [background-size:24px_24px] ${
          isDragging ? 'cursor-grabbing' : 'cursor-grab'
        }`}
      >
        <svg className="w-full h-full pointer-events-auto">
          <defs>
            {/* Dotted Grid Pattern */}
            <pattern
              id="fail-dot-grid"
              width="24"
              height="24"
              patternUnits="userSpaceOnUse"
            >
              <circle cx="2" cy="2" r="1.1" fill="#1e3850" opacity="0.75" />
            </pattern>

            <marker
              id="fail-arrow-dim"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#182c3f" />
            </marker>
            <marker
              id="fail-arrow-active"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#f59e0b" />
            </marker>
            <marker
              id="fail-arrow-initial"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#ef4444" />
            </marker>
          </defs>

          {/* Dotted Canvas Grid Background */}
          <rect width="100%" height="100%" fill="url(#fail-dot-grid)" className="pointer-events-none" />

          <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
            {/* Dependencies */}
            {dataset.dependencies.map((dep, idx) => {
              const src = layoutNodes.get(dep.source);
              const tgt = layoutNodes.get(dep.target);
              if (!src || !tgt) return null;

              const x1 = src.x + src.width;
              const y1 = src.y + src.height / 2;
              const x2 = tgt.x;
              const y2 = tgt.y + tgt.height / 2;

              const dx = Math.abs(x2 - x1);
              const c1x = x1 + Math.max(dx * 0.45, 35);
              const c1y = y1;
              const c2x = x2 - Math.max(dx * 0.45, 35);
              const c2y = y2;
              const pathD = `M ${x1} ${y1} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${x2} ${y2}`;

              const isCascadeActive =
                isSimulating &&
                cascadeResult.affectedEdges.has(`${dep.source}->${dep.target}`);
              const srcVisual = getNodeVisualState(dep.source);
              const tgtVisual = getNodeVisualState(dep.target);

              const isActive =
                isCascadeActive &&
                (srcVisual === 'failed' || srcVisual === 'affected') &&
                (tgtVisual === 'failed' || tgtVisual === 'affected');

              const edgeColor = isActive
                ? srcVisual === 'failed'
                  ? '#ef4444'
                  : '#f59e0b'
                : isSimulating
                ? '#142232'
                : '#182c3f';

              return (
                <path
                  key={`dep-${idx}`}
                  d={pathD}
                  fill="none"
                  stroke={edgeColor}
                  strokeWidth={isActive ? 2.2 : 1.3}
                  strokeOpacity={isActive ? 1 : isSimulating ? 0.3 : 0.65}
                  strokeDasharray={isActive ? '5 3' : undefined}
                  markerEnd={
                    isActive
                      ? srcVisual === 'failed'
                        ? 'url(#fail-arrow-initial)'
                        : 'url(#fail-arrow-active)'
                      : 'url(#fail-arrow-dim)'
                  }
                  className="transition-colors duration-200"
                />
              );
            })}

            {/* Asset Nodes with Shared Node Presentation */}
            {Array.from(layoutNodes.values()).map((node) => {
              const { asset } = node;
              const visualState = getNodeVisualState(asset.id);
              const info = cascadeResult.affectedNodes.get(asset.id);

              let badgeText = '';
              let badgeBg = '';

              if (visualState === 'failed') {
                badgeText = 'FAILED';
                badgeBg = 'bg-red-600 text-white font-bold';
              } else if (visualState === 'affected') {
                badgeText = `STEP ${info?.step ?? 1}`;
                badgeBg = 'bg-amber-500 text-slate-950 font-bold';
              }

              return (
                <NetworkNodeCard
                  key={asset.id}
                  node={node}
                  asset={asset}
                  status={visualState}
                  badgeText={badgeText}
                  badgeBg={badgeBg}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (visualState === 'affected') {
                      setWhyNodeId(asset.id);
                    }
                  }}
                />
              );
            })}
          </g>
        </svg>

        {/* Graph Controls */}
        <GraphControls
          onZoomIn={zoomIn}
          onZoomOut={zoomOut}
          onFit={() => fitGraph()}
          fitLabel="Fit Cascade"
          className="absolute right-6 bottom-6 z-20"
        />

        {/* Modal: WHY WAS THIS AFFECTED? (when orange node is clicked) */}
        {whyNodeId && whyAsset && (
          <div className="fixed inset-0 z-50 bg-[#061019]/80 backdrop-blur-md flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-[#0a1726] border border-[#182c3f] rounded-2xl p-6 sm:p-8 shadow-2xl shadow-black/80 animate-fade-in relative text-center">
              <button
                onClick={() => setWhyNodeId(null)}
                className="absolute right-4 top-4 text-[#a9b9c3] hover:text-[#f2f4f0] p-1.5 rounded-xl hover:bg-[#071321] cursor-pointer transition-colors"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="flex items-center justify-center gap-2 mb-2">
                <span className="text-[10px] font-mono tracking-[0.2em] text-[#fbbf24] uppercase">Causation Trace</span>
                <span className="w-3 h-px bg-[#fbbf24]/40"></span>
              </div>
              <h3 className="text-base font-semibold text-[#f2f4f0] mb-3">
                {whyAsset.name}
              </h3>

              {/* Plain English explanation sentence */}
              {whyPath.length >= 2 ? (
                <div className="text-xs text-[#a9b9c3] mb-6 bg-[#071321] p-3.5 rounded-xl border border-[#182c3f] text-center leading-relaxed">
                  <span className="text-[#f2f4f0] font-medium">{whyPath[whyPath.length - 1].assetName}</span> was affected because it depends on{' '}
                  <span className="text-[#fbbf24] font-medium">{whyPath[whyPath.length - 2].assetName}</span>.
                </div>
              ) : (
                <div className="text-xs text-[#a9b9c3] mb-6 bg-[#071321] p-3.5 rounded-xl border border-[#182c3f] text-center">
                  <span className="text-[#f2f4f0] font-medium">{whyAsset.name}</span> is the initial failure point.
                </div>
              )}

              {/* Causation Chain: Vertical path */}
              <div className="space-y-2 my-6">
                {whyPath.map((step, idx) => (
                  <React.Fragment key={step.assetId}>
                    <div
                      className={`p-3 rounded-xl border text-sm font-medium ${
                        step.isInitialFailure
                          ? 'bg-[#2a0e14] border-red-500/40 text-red-300'
                          : idx === whyPath.length - 1
                          ? 'bg-[#261405] border-amber-500/40 text-amber-300'
                          : 'bg-[#071321] border-[#182c3f] text-[#f2f4f0]'
                      }`}
                    >
                      <div>{step.assetName}</div>
                      <div className="text-[10px] text-[#a9b9c3] font-mono uppercase mt-0.5">
                        {step.sector}
                      </div>
                    </div>

                    {idx < whyPath.length - 1 && (
                      <div className="text-[#a8e2dc]/60 font-mono text-center text-xs my-1">
                        ↓
                      </div>
                    )}
                  </React.Fragment>
                ))}
              </div>

              <button
                onClick={() => setWhyNodeId(null)}
                className="w-full py-2.5 rounded-xl bg-[#071321] hover:bg-[#0d1e2e] text-[#f2f4f0] text-xs font-medium uppercase tracking-wider border border-[#182c3f] hover:border-[#84979a40] cursor-pointer transition-colors"
              >
                Close Trace
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
