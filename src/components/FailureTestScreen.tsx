import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import type { InfrastructureDataset } from '../types/infrastructure';
import { simulateCascade, getWhyPath, type CascadeResult, type WhyStep } from '../utils/cascade';
import { computeGraphLayout } from '../utils/graphLayout';
import { getSectorConfig } from '../utils/sectorConfig';
import {
  RotateCcw,
  ZoomIn,
  ZoomOut,
  Maximize2,
  X,
  Zap,
} from 'lucide-react';

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

  // If initialAssetId changes from outside (e.g. clicked TEST FAILURE in S4):
  useEffect(() => {
    if (initialAssetId) {
      setFailedAssetId(initialAssetId);
      setIsSimulating(false);
      setWhyNodeId(null);
    }
  }, [initialAssetId]);

  // Pan & Zoom
  const [zoom, setZoom] = useState<number>(0.9);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const panStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement | null>(null);
  const initializedRef = useRef<boolean>(false);

  // Calculate cascade deterministically
  const cascadeResult: CascadeResult = useMemo(() => {
    return simulateCascade(dataset, failedAssetId);
  }, [dataset, failedAssetId]);

  // Layout calculation
  const layoutNodes = useMemo(() => {
    return computeGraphLayout(dataset);
  }, [dataset]);

  // Graph bounding box
  const getGraphBounds = useCallback(() => {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    layoutNodes.forEach((node) => {
      minX = Math.min(minX, node.x);
      maxX = Math.max(maxX, node.x + node.width);
      minY = Math.min(minY, node.y);
      maxY = Math.max(maxY, node.y + node.height);
    });

    return {
      minX,
      maxX,
      minY,
      maxY,
      graphWidth: maxX - minX,
      graphHeight: maxY - minY,
      cx: minX + (maxX - minX) / 2,
      cy: minY + (maxY - minY) / 2,
    };
  }, [layoutNodes]);

  // Readable Initial / Reset View: prioritizes immediate readability of nodes and names, centering on the failed asset
  const resetToReadableGraph = useCallback(() => {
    if (!containerRef.current || layoutNodes.size === 0) return;
    const rect = containerRef.current.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const bounds = getGraphBounds();
    const readableZoom = 0.88;
    setZoom(readableZoom);

    // Focus intelligently on the failed asset node so it and its initial connections are readable
    const failedNode = layoutNodes.get(failedAssetId);
    const targetX = failedNode ? failedNode.x + failedNode.width / 2 : bounds.cx;
    const targetY = failedNode ? failedNode.y + failedNode.height / 2 : bounds.cy;

    setPan({
      x: rect.width / 2 - targetX * readableZoom,
      y: rect.height / 2 - targetY * readableZoom,
    });
  }, [layoutNodes, getGraphBounds, failedAssetId]);

  // Fit Network: fits the complete graph
  const fitCompleteGraph = useCallback(() => {
    if (!containerRef.current || layoutNodes.size === 0) return;
    const rect = containerRef.current.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const bounds = getGraphBounds();
    const paddingX = 80;
    const paddingY = 80;
    const scaleX = (rect.width - paddingX) / bounds.graphWidth;
    const scaleY = (rect.height - paddingY) / bounds.graphHeight;
    const fitZoom = Math.max(0.3, Math.min(1.2, Math.min(scaleX, scaleY)));

    setZoom(fitZoom);
    setPan({
      x: rect.width / 2 - bounds.cx * fitZoom,
      y: rect.height / 2 - bounds.cy * fitZoom,
    });
  }, [layoutNodes, getGraphBounds]);

  useEffect(() => {
    if (!initializedRef.current && containerRef.current) {
      resetToReadableGraph();
      initializedRef.current = true;
    }
  }, [resetToReadableGraph]);

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

  // Mouse pan handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    panStartRef.current = { ...pan };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    setPan({
      x: panStartRef.current.x + dx,
      y: panStartRef.current.y + dy,
    });
  };

  const handleMouseUp = () => setIsDragging(false);

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.12 : 0.89;
    setZoom((prev) => Math.max(0.3, Math.min(2.5, +(prev * zoomFactor).toFixed(2))));
  };

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
    <div className="w-full h-full flex-1 flex flex-col bg-slate-950 text-slate-100 overflow-hidden relative">
      {/* Top Header & Controls */}
      <div className="px-6 py-3.5 border-b border-slate-800/80 bg-slate-950/90 flex flex-wrap items-center justify-between gap-4 shrink-0 z-10">
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs">
              <span className="text-slate-400 font-medium">Selected:</span>
              <select
                value={failedAssetId}
                onChange={(e) => {
                  setFailedAssetId(e.target.value);
                  handleReset();
                }}
                className="bg-slate-950 text-white font-bold rounded px-2 py-0.5 border border-slate-700 focus:outline-none focus:border-cyan-500 cursor-pointer"
              >
                {dataset.assets.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.sector})
                  </option>
                ))}
              </select>
            </div>

            {isSimulating && (
              <div className="flex items-center gap-3 text-xs font-mono bg-slate-900/80 border border-slate-800 px-3 py-1.5 rounded-xl">
                <span className="text-red-400 font-bold">
                  {cascadeResult.affectedNodes.size} Services Affected
                </span>
                <span className="text-slate-600">•</span>
                <span className="text-amber-400 font-bold">
                  {cascadeResult.sectorsReached.length} Sectors Reached
                </span>
                <span className="text-slate-600">•</span>
                <span className="text-cyan-400 font-bold">
                  {cascadeResult.totalSteps} Steps
                </span>
              </div>
            )}
          </div>

          <div className="text-xs text-slate-400 font-medium">
            Watch the failure spread through connected city services.
          </div>
        </div>

        {/* Buttons: START CASCADE, NEXT STEP, SHOW COMPLETE CASCADE, RESET */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleStartCascade}
            className="px-3.5 py-2 bg-gradient-to-r from-red-600 to-amber-600 hover:from-red-500 hover:to-amber-500 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-red-950/40 flex items-center gap-1.5 cursor-pointer transition-all active:scale-98"
          >
            <Zap className="w-3.5 h-3.5 fill-current" />
            <span>START CASCADE</span>
          </button>

          <button
            onClick={handleNextStep}
            className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl border border-slate-700 cursor-pointer transition-colors"
          >
            NEXT STEP
          </button>

          <button
            onClick={handleShowComplete}
            className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl border border-slate-700 cursor-pointer transition-colors"
          >
            SHOW COMPLETE CASCADE
          </button>

          <button
            onClick={handleReset}
            className="px-3 py-2 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white font-bold text-xs rounded-xl border border-slate-800 cursor-pointer flex items-center gap-1 transition-colors"
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
        className={`flex-1 w-full h-full relative select-none overflow-hidden bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:24px_24px] ${
          isDragging ? 'cursor-grabbing' : 'cursor-grab'
        }`}
      >
        <svg className="w-full h-full pointer-events-auto">
          <defs>
            <marker
              id="fail-arrow-dim"
              viewBox="0 0 10 10"
              refX="10"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#1e293b" />
            </marker>
            <marker
              id="fail-arrow-active"
              viewBox="0 0 10 10"
              refX="10"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#f97316" />
            </marker>
            <marker
              id="fail-arrow-initial"
              viewBox="0 0 10 10"
              refX="10"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#ef4444" />
            </marker>
          </defs>

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

              const dx = x2 - x1;
              const c1x = x1 + dx * 0.45;
              const c1y = y1;
              const c2x = x1 + dx * 0.55;
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

              return (
                <path
                  key={`dep-${idx}`}
                  d={pathD}
                  fill="none"
                  stroke={
                    isActive
                      ? srcVisual === 'failed'
                        ? '#ef4444'
                        : '#f97316'
                      : isSimulating
                      ? '#1e293b'
                      : '#334155'
                  }
                  strokeWidth={isActive ? 2.5 : 1.2}
                  strokeDasharray={isActive ? '4 2' : undefined}
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

              let bgColor = '#090d16';
              let borderColor = '#334155';
              let textColor = '#e2e8f0';
              let badgeText = '';
              let badgeBg = '';

              if (visualState === 'failed') {
                bgColor = '#450a0a';
                borderColor = '#ef4444';
                textColor = '#ffffff';
                badgeText = 'FAILED';
                badgeBg = 'bg-red-500 text-white';
              } else if (visualState === 'affected') {
                bgColor = '#431407';
                borderColor = '#f97316';
                textColor = '#ffffff';
                badgeText = `STEP ${info?.step}`;
                badgeBg = 'bg-amber-500 text-slate-950 font-black';
              } else if (visualState === 'dimmed') {
                textColor = '#475569';
                borderColor = '#1e293b';
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
                  {visualState === 'failed' && (
                    <rect
                      x={-4}
                      y={-4}
                      width={node.width + 8}
                      height={node.height + 8}
                      rx={12}
                      fill="none"
                      stroke="#ef4444"
                      strokeWidth={2}
                      className="animate-pulse"
                    />
                  )}

                  {/* Main Card */}
                  <rect
                    x={0}
                    y={0}
                    width={node.width}
                    height={node.height}
                    rx={10}
                    fill={bgColor}
                    stroke={borderColor}
                    strokeWidth={visualState === 'failed' || visualState === 'affected' ? 2 : 1}
                    className="transition-colors duration-200"
                  />

                  {/* Sector Indicator Strip */}
                  <rect
                    x={0}
                    y={0}
                    width={5}
                    height={node.height}
                    rx={2}
                    fill={sectorCfg.color}
                  />

                  {/* Node Label */}
                  <text
                    x={14}
                    y={24}
                    fill={textColor}
                    fontSize="12"
                    fontWeight="700"
                    className="pointer-events-none"
                  >
                    {asset.name.length > 17
                      ? asset.name.substring(0, 15) + '...'
                      : asset.name}
                  </text>

                  {/* Sector Subtitle */}
                  <text
                    x={14}
                    y={42}
                    fill={visualState === 'dimmed' ? '#334155' : '#94a3b8'}
                    fontSize="10"
                    fontWeight="500"
                    className="pointer-events-none"
                  >
                    {asset.sector}
                  </text>

                  {/* Badge */}
                  {badgeText && (
                    <foreignObject
                      x={node.width - 66}
                      y={8}
                      width={58}
                      height={20}
                    >
                      <div
                        className={`text-[9px] font-black px-1.5 py-0.5 rounded text-center tracking-wider uppercase ${badgeBg}`}
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

        {/* Clearly Visible Controls: [ + ] Zoom In, [ - ] Zoom Out, [ Fit ] Fit Network, [ Reset ] Reset View */}
        <div className="absolute right-6 bottom-6 flex items-center gap-1.5 bg-slate-900/95 border border-slate-700/80 rounded-2xl p-1.5 backdrop-blur-md shadow-2xl z-20">
          <button
            onClick={() => setZoom((z) => Math.min(2.5, +(z + 0.15).toFixed(2)))}
            className="px-2.5 py-1.5 rounded-xl flex items-center gap-1.5 text-xs font-bold text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            title="Zoom In"
          >
            <ZoomIn className="w-3.5 h-3.5 text-cyan-400" />
            <span>Zoom In</span>
          </button>
          <button
            onClick={() => setZoom((z) => Math.max(0.3, +(z - 0.15).toFixed(2)))}
            className="px-2.5 py-1.5 rounded-xl flex items-center gap-1.5 text-xs font-bold text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            title="Zoom Out"
          >
            <ZoomOut className="w-3.5 h-3.5 text-cyan-400" />
            <span>Zoom Out</span>
          </button>
          <div className="w-[1px] h-4 bg-slate-800 my-auto" />
          <button
            onClick={fitCompleteGraph}
            className="px-2.5 py-1.5 rounded-xl flex items-center gap-1.5 text-xs font-bold text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            title="Fit Network"
          >
            <Maximize2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>Fit Network</span>
          </button>
          <button
            onClick={resetToReadableGraph}
            className="px-2.5 py-1.5 rounded-xl flex items-center gap-1.5 text-xs font-bold text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            title="Reset View"
          >
            <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
            <span>Reset View</span>
          </button>
        </div>

        {/* Modal: WHY WAS THIS AFFECTED? (when orange node is clicked) */}
        {whyNodeId && whyAsset && (
          <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-slate-900 border-2 border-amber-500/60 rounded-3xl p-6 sm:p-8 shadow-2xl shadow-amber-950/50 animate-fade-in relative text-center">
              <button
                onClick={() => setWhyNodeId(null)}
                className="absolute right-4 top-4 text-slate-400 hover:text-white p-1 rounded-xl hover:bg-slate-800 cursor-pointer"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="text-xs font-black text-amber-400 tracking-widest uppercase mb-1">
                WHY WAS THIS AFFECTED?
              </div>
              <h3 className="text-lg font-black text-white mb-2">
                {whyAsset.name}
              </h3>

              {/* Plain English explanation sentence */}
              {whyPath.length >= 2 ? (
                <div className="text-xs text-slate-200 mb-6 bg-slate-800/80 p-3 rounded-xl border border-slate-700/80 text-center leading-relaxed">
                  <span className="text-white font-bold">{whyPath[whyPath.length - 1].assetName}</span> was affected because it depends on{' '}
                  <span className="text-amber-400 font-bold">{whyPath[whyPath.length - 2].assetName}</span>.
                </div>
              ) : (
                <div className="text-xs text-slate-200 mb-6 bg-slate-800/80 p-3 rounded-xl border border-slate-700/80 text-center">
                  <span className="text-white font-bold">{whyAsset.name}</span> is the initial failure point.
                </div>
              )}

              {/* Causation Chain: Vertical path */}
              <div className="space-y-2 my-6">
                {whyPath.map((step, idx) => (
                  <React.Fragment key={step.assetId}>
                    <div
                      className={`p-3 rounded-xl border text-sm font-bold ${
                        step.isInitialFailure
                          ? 'bg-red-500/20 border-red-500/50 text-red-300'
                          : idx === whyPath.length - 1
                          ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                          : 'bg-slate-800/80 border-slate-700 text-slate-200'
                      }`}
                    >
                      <div>{step.assetName}</div>
                      <div className="text-[10px] text-slate-400 font-normal uppercase mt-0.5">
                        {step.sector}
                      </div>
                    </div>

                    {idx < whyPath.length - 1 && (
                      <div className="text-slate-500 font-black text-center text-sm my-1">
                        ↓
                      </div>
                    )}
                  </React.Fragment>
                ))}
              </div>

              <button
                onClick={() => setWhyNodeId(null)}
                className="w-full py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-black uppercase tracking-wider cursor-pointer transition-colors"
              >
                CLOSE
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
