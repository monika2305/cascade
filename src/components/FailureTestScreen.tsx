import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import type { InfrastructureDataset } from '../types/infrastructure';
import { simulateCascade, getWhyPath, type CascadeResult, type WhyStep } from '../utils/cascade';
import { computeGraphLayout } from '../utils/graphLayout';
import { getSectorConfig } from '../utils/sectorConfig';
import { useGraphViewport } from '../hooks/useGraphViewport';
import { GraphControls } from './GraphControls';
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
      {/* Top Header & Controls */}
      <div className="px-6 py-4 border-b border-[#182c3f] bg-[#071321]/90 backdrop-blur-md flex flex-wrap items-center justify-between gap-4 shrink-0 z-10">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono tracking-[0.2em] text-[#a8e2dc] uppercase">Simulation Lab</span>
            <span className="w-3 h-px bg-[#a8e2dc]/40"></span>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-sm font-medium tracking-tight text-[#f2f4f0]">
              Failure Cascade Analysis
            </h2>

            <div className="flex items-center gap-2 bg-[#0a1726] border border-[#182c3f] rounded-xl px-3 py-1 text-xs">
              <span className="text-[#a9b9c3] font-medium">Trigger Asset:</span>
              <select
                value={failedAssetId}
                onChange={(e) => {
                  setFailedAssetId(e.target.value);
                  handleReset();
                }}
                className="bg-[#071321] text-[#f2f4f0] font-semibold rounded-lg px-2 py-0.5 border border-[#182c3f] focus:outline-none focus:border-[#a8e2dc]/60 cursor-pointer"
              >
                {dataset.assets.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.sector})
                  </option>
                ))}
              </select>
            </div>

            {isSimulating && (
              <div className="flex items-center gap-3 text-xs font-mono bg-[#0a1726]/80 border border-[#182c3f] px-3 py-1 rounded-xl">
                <span className="text-red-400 font-semibold">
                  {cascadeResult.affectedNodes.size} Services Affected
                </span>
                <span className="text-[#182c3f]">•</span>
                <span className="text-amber-400 font-semibold">
                  {cascadeResult.sectorsReached.length} Sectors Reached
                </span>
                <span className="text-[#182c3f]">•</span>
                <span className="text-[#a8e2dc] font-semibold">
                  {cascadeResult.totalSteps} Steps
                </span>
              </div>
            )}
          </div>

          <div className="text-xs text-[#a9b9c3] font-normal">
            Select an infrastructure node to trigger an outage and observe deterministic cross-sector propagation.
          </div>
        </div>

        {/* Buttons: START CASCADE, NEXT STEP, SHOW COMPLETE CASCADE, RESET */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleStartCascade}
            className="px-3.5 py-2 bg-gradient-to-r from-red-600 to-amber-600 hover:from-red-500 hover:to-amber-500 text-white font-semibold text-xs tracking-wider uppercase rounded-xl shadow-lg shadow-red-950/30 flex items-center gap-1.5 cursor-pointer transition-all active:scale-98"
          >
            <Zap className="w-3.5 h-3.5 fill-current" />
            <span>START CASCADE</span>
          </button>

          <button
            onClick={handleNextStep}
            className="px-3.5 py-2 bg-[#0a1726] hover:bg-[#0d1e2e] text-[#f2f4f0] font-medium text-xs rounded-xl border border-[#182c3f] hover:border-[#84979a40] cursor-pointer transition-colors"
          >
            NEXT STEP
          </button>

          <button
            onClick={handleShowComplete}
            className="px-3.5 py-2 bg-[#0a1726] hover:bg-[#0d1e2e] text-[#f2f4f0] font-medium text-xs rounded-xl border border-[#182c3f] hover:border-[#84979a40] cursor-pointer transition-colors"
          >
            SHOW COMPLETE
          </button>

          <button
            onClick={handleReset}
            className="px-3 py-2 bg-transparent hover:bg-[#0a1726] text-[#a9b9c3] hover:text-[#f2f4f0] font-medium text-xs rounded-xl border border-[#182c3f] cursor-pointer flex items-center gap-1.5 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>RESET</span>
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

            {/* Asset Nodes */}
            {Array.from(layoutNodes.values()).map((node) => {
              const { asset } = node;
              const visualState = getNodeVisualState(asset.id);
              const info = cascadeResult.affectedNodes.get(asset.id);
              const sectorCfg = getSectorConfig(asset.sector);
              const SectorIcon = sectorCfg.icon;

              let bgColor = '#08131e';
              let borderColor = sectorCfg.borderHex;
              let glowColor = '';
              let isDimmedNode = false;
              let badgeText = '';
              let badgeBg = '';

              if (visualState === 'failed') {
                bgColor = '#22080d';
                borderColor = '#ef4444';
                glowColor = 'rgba(239, 68, 68, 0.55)';
                badgeText = 'FAILED';
                badgeBg = 'bg-red-600 text-white';
              } else if (visualState === 'affected') {
                bgColor = '#1e1106';
                borderColor = '#f59e0b';
                glowColor = 'rgba(245, 158, 11, 0.55)';
                badgeText = `STEP ${info?.step}`;
                badgeBg = 'bg-amber-500 text-slate-950 font-bold';
              } else if (visualState === 'dimmed') {
                bgColor = '#07121c';
                borderColor = '#182c3f';
                isDimmedNode = true;
              }

              return (
                <g
                  key={asset.id}
                  transform={`translate(${node.x}, ${node.y})`}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (visualState === 'affected') {
                      setWhyNodeId(asset.id);
                    }
                  }}
                  className={`group ${visualState === 'affected' ? 'cursor-pointer' : 'cursor-default'}`}
                >
                  {/* Outer Glow for Failed or Affected */}
                  {glowColor && (
                    <rect
                      x={-3}
                      y={-3}
                      width={node.width + 6}
                      height={node.height + 6}
                      rx={17}
                      fill="none"
                      stroke={borderColor}
                      strokeWidth={2}
                      strokeOpacity={0.85}
                      style={{ filter: `drop-shadow(0 0 10px ${glowColor})` }}
                    />
                  )}

                  {/* Main Card Surface */}
                  <rect
                    x={0}
                    y={0}
                    width={node.width}
                    height={node.height}
                    rx={14}
                    fill={bgColor}
                    stroke={borderColor}
                    strokeWidth={visualState === 'failed' || visualState === 'affected' ? 1.8 : 1.3}
                    strokeOpacity={isDimmedNode ? 0.35 : 1}
                    className="transition-all duration-200"
                  />

                  {/* Left Icon Container Box */}
                  <rect
                    x={10}
                    y={10}
                    width={36}
                    height={36}
                    rx={9}
                    fill={
                      visualState === 'failed'
                        ? 'rgba(239, 68, 68, 0.15)'
                        : visualState === 'affected'
                        ? 'rgba(245, 158, 11, 0.15)'
                        : sectorCfg.bgHex
                    }
                    stroke={borderColor}
                    strokeWidth={1}
                    strokeOpacity={isDimmedNode ? 0.2 : 0.45}
                  />

                  <foreignObject x={10} y={10} width={36} height={36} className="pointer-events-none">
                    <div
                      className="w-full h-full flex items-center justify-center transition-opacity"
                      style={{
                        color:
                          visualState === 'failed'
                            ? '#ef4444'
                            : visualState === 'affected'
                            ? '#f59e0b'
                            : sectorCfg.hex,
                        opacity: isDimmedNode ? 0.35 : 1,
                      }}
                    >
                      <SectorIcon className="w-4 h-4" />
                    </div>
                  </foreignObject>

                  {/* Asset Name Label */}
                  <text
                    x={56}
                    y={26}
                    fill={isDimmedNode ? '#64748b' : '#f2f4f0'}
                    fontSize="12.5"
                    fontWeight="600"
                    className="pointer-events-none tracking-tight select-none"
                  >
                    {asset.name.length > 17
                      ? asset.name.substring(0, 15) + '...'
                      : asset.name}
                  </text>

                  {/* Sector Subtitle */}
                  <text
                    x={56}
                    y={43}
                    fill={isDimmedNode ? '#475569' : '#8096a4'}
                    fontSize="10"
                    fontWeight="400"
                    className="pointer-events-none tracking-wide select-none"
                  >
                    {asset.sector}
                  </text>

                  {/* Status Badge */}
                  {badgeText && (
                    <foreignObject
                      x={node.width - 66}
                      y={8}
                      width={58}
                      height={20}
                    >
                      <div
                        className={`text-[9px] font-semibold px-1.5 py-0.5 rounded text-center tracking-wider uppercase ${badgeBg}`}
                      >
                        {badgeText}
                      </div>
                    </foreignObject>
                  )}
                </g>
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
