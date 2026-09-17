import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import type { InfrastructureDataset, Asset, UserRole, Sector } from '../types/infrastructure';
import { simulateCascade, getWhyPath, type CascadeResult, type WhyStep } from '../utils/cascade';
import {
  findWeakPoints,
  runIntervention,
  type WeakPoint,
  type InterventionAction,
  type InterventionResult,
  type InterventionType,
} from '../utils/analysis';
import { computeGraphLayout, type LayoutNode } from '../utils/graphLayout';
import { getSectorConfig } from '../utils/sectorConfig';
import { ROLES } from '../types/roles';
import {
  Zap,
  Play,
  Pause,
  RotateCcw,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Shield,
  Scissors,
  PlusCircle,
  Activity,
  X,
} from 'lucide-react';

interface MainWorkspaceProps {
  dataset: InfrastructureDataset;
  selectedRole: UserRole;
  onReset: () => void;
}

export const MainWorkspace: React.FC<MainWorkspaceProps> = ({
  dataset,
  selectedRole,
  onReset,
}) => {
  // Role configuration
  const roleConfig = useMemo(() => {
    return ROLES.find((r) => r.id === selectedRole) || ROLES[0];
  }, [selectedRole]);

  // Selected asset in the center graph or from left panel
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(
    dataset.assets[0]?.id || null
  );

  // Weak points calculation
  const [hasRunWeakPoints, setHasRunWeakPoints] = useState<boolean>(true);
  const weakPoints: WeakPoint[] = useMemo(() => {
    return findWeakPoints(dataset);
  }, [dataset]);

  // Failure simulation state
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [activeFailedAssetId, setActiveFailedAssetId] = useState<string | null>(null);
  const [cascadeResult, setCascadeResult] = useState<CascadeResult | null>(null);
  const [activeStep, setActiveStep] = useState<number>(-1); // -1 = show all reached steps
  const [isPlayingAnimation, setIsPlayingAnimation] = useState<boolean>(false);

  // Action Lab state
  const [isActionLabOpen, setIsActionLabOpen] = useState<boolean>(false);
  const [actionType, setActionType] = useState<InterventionType>('protect_asset');
  const [protectTargetId, setProtectTargetId] = useState<string>('');
  const [isolateEdgeKey, setIsolateEdgeKey] = useState<string>('');
  const [backupSourceId, setBackupSourceId] = useState<string>('');
  const [backupTargetId, setBackupTargetId] = useState<string>('');
  const [interventionResult, setInterventionResult] = useState<InterventionResult | null>(null);
  const [isAppliedToGraph, setIsAppliedToGraph] = useState<boolean>(false);

  // Causation / Why path target
  const [whyTargetAssetId, setWhyTargetAssetId] = useState<string | null>(null);

  // Graph pan & zoom
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const panStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Fast asset lookup
  const assetMap = useMemo(() => {
    const map = new Map<string, Asset>();
    for (const a of dataset.assets) {
      map.set(a.id, a);
    }
    return map;
  }, [dataset.assets]);

  // Degrees map (Depends on / Supports)
  const { inDegreeMap, outDegreeMap } = useMemo(() => {
    const inDeg = new Map<string, number>();
    const outDeg = new Map<string, number>();
    for (const a of dataset.assets) {
      inDeg.set(a.id, 0);
      outDeg.set(a.id, 0);
    }
    for (const dep of dataset.dependencies) {
      if (outDeg.has(dep.source)) {
        outDeg.set(dep.source, (outDeg.get(dep.source) || 0) + 1);
      }
      if (inDeg.has(dep.target)) {
        inDeg.set(dep.target, (inDeg.get(dep.target) || 0) + 1);
      }
    }
    return { inDegreeMap: inDeg, outDegreeMap: outDeg };
  }, [dataset.assets, dataset.dependencies]);

  // Graph Layout
  const layoutNodes: Map<string, LayoutNode> = useMemo(() => {
    return computeGraphLayout(dataset);
  }, [dataset]);

  // Auto-fit and center graph
  const fitAndCenterGraph = useCallback(() => {
    if (!containerRef.current || layoutNodes.size === 0) return;
    const rect = containerRef.current.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

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

    const graphWidth = maxX - minX;
    const graphHeight = maxY - minY;
    const cx = minX + graphWidth / 2;
    const cy = minY + graphHeight / 2;

    const paddingX = 60;
    const paddingY = 60;
    const scaleX = (rect.width - paddingX) / graphWidth;
    const scaleY = (rect.height - paddingY) / graphHeight;

    const optimalZoom = Math.max(0.42, Math.min(1.15, Math.min(scaleX, scaleY)));

    setZoom(optimalZoom);
    setPan({
      x: rect.width / 2 - cx * optimalZoom,
      y: rect.height / 2 - cy * optimalZoom,
    });
  }, [layoutNodes]);

  // ResizeObserver for rock-solid viewport auto-fit
  useEffect(() => {
    fitAndCenterGraph();
    if (!containerRef.current) return;

    const ro = new ResizeObserver(() => {
      fitAndCenterGraph();
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [fitAndCenterGraph]);

  // Start failure test on a given asset
  const handleStartFailureTest = (assetId: string) => {
    const result = simulateCascade(dataset, assetId);
    setActiveFailedAssetId(assetId);
    setCascadeResult(result);
    setIsSimulating(true);
    setActiveStep(0); // Start at initial failure (Step 0)
    setIsPlayingAnimation(true);
    setWhyTargetAssetId(null);
    setIsActionLabOpen(false);
    setInterventionResult(null);
    setIsAppliedToGraph(false);
    setSelectedAssetId(assetId);

    // Initialize defaults for Action Lab
    const downstream: string[] = [];
    result.affectedNodes.forEach((node) => {
      if (node.step > 0) downstream.push(node.assetId);
    });
    setProtectTargetId(downstream[0] || '');
    setBackupTargetId(downstream[0] || '');
    setBackupSourceId(dataset.assets[0]?.id || '');

    const edges: string[] = [];
    for (const dep of dataset.dependencies) {
      if (result.affectedEdges.has(`${dep.source}->${dep.target}`)) {
        edges.push(`${dep.source}->${dep.target}`);
      }
    }
    setIsolateEdgeKey(edges[0] || '');
  };

  // Reset failure simulation back to normal network view
  const handleResetSimulation = () => {
    setIsSimulating(false);
    setActiveFailedAssetId(null);
    setCascadeResult(null);
    setActiveStep(-1);
    setIsPlayingAnimation(false);
    setWhyTargetAssetId(null);
    setIsActionLabOpen(false);
    setInterventionResult(null);
    setIsAppliedToGraph(false);
  };

  // Step animation ticker
  useEffect(() => {
    if (!isPlayingAnimation || !cascadeResult) return;

    const timer = window.setInterval(() => {
      setActiveStep((prev) => {
        if (prev < 0) return 0;
        if (prev >= cascadeResult.totalSteps) {
          setIsPlayingAnimation(false);
          return -1; // Show full impact
        }
        return prev + 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isPlayingAnimation, cascadeResult]);

  // Run Action Lab intervention
  const handleRunIntervention = () => {
    if (!activeFailedAssetId) return;

    let action: InterventionAction;
    if (actionType === 'protect_asset') {
      const tgt = assetMap.get(protectTargetId);
      action = {
        type: 'protect_asset',
        name: `Protect ${tgt?.name || protectTargetId}`,
        assetId: protectTargetId,
      };
    } else if (actionType === 'isolate_connection') {
      const [src, tgt] = isolateEdgeKey.split('->');
      const srcAsset = assetMap.get(src);
      const tgtAsset = assetMap.get(tgt);
      action = {
        type: 'isolate_connection',
        name: `Sever ${srcAsset?.name || src} → ${tgtAsset?.name || tgt}`,
        sourceAssetId: src,
        targetAssetId: tgt,
      };
    } else {
      const srcAsset = assetMap.get(backupSourceId);
      const tgtAsset = assetMap.get(backupTargetId);
      action = {
        type: 'add_connection',
        name: `Add Backup ${srcAsset?.name || backupSourceId} → ${tgtAsset?.name || backupTargetId}`,
        sourceAssetId: backupSourceId,
        targetAssetId: backupTargetId,
      };
    }

    const res = runIntervention(dataset, activeFailedAssetId, action);
    setInterventionResult(res);
  };

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

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.12 : 0.89;
    setZoom((prev) => Math.max(0.3, Math.min(2.5, +(prev * zoomFactor).toFixed(2))));
  };

  // Node cascade visual state helper
  const getNodeVisualState = useCallback(
    (assetId: string) => {
      // If fix is applied to the graph:
      if (isAppliedToGraph && interventionResult) {
        if (assetId === interventionResult.initialFailureId) return 'failed';
        if (interventionResult.savedAssetIds.includes(assetId)) return 'protected';
        if (interventionResult.afterCascade.affectedNodes.has(assetId)) return 'still_affected';
        return 'unaffected';
      }

      // If regular failure simulation is active:
      if (isSimulating && cascadeResult) {
        const info = cascadeResult.affectedNodes.get(assetId);
        if (!info) return 'unaffected';
        if (info.step === 0) return 'failed';

        // Check if reached up to activeStep (-1 means all reached)
        if (activeStep === -1 || info.step <= activeStep) {
          return 'affected';
        }
        return 'dim';
      }

      return 'normal';
    },
    [isSimulating, cascadeResult, activeStep, isAppliedToGraph, interventionResult]
  );

  // Role emphasis helper
  const isSectorEmphasizedByRole = useCallback(
    (sector: Sector) => {
      if (selectedRole === 'general') return true;
      if (selectedRole === 'authority') return true;
      if (selectedRole === 'emergency') {
        return sector === 'Health' || sector === 'Emergency Services' || sector === 'Communication';
      }
      if (selectedRole === 'operator') {
        return sector === 'Power' || sector === 'Water' || sector === 'Transport';
      }
      return true;
    },
    [selectedRole]
  );

  // Causation chain (Why Path: Root Initial Failure -> Target)
  const whyPath: WhyStep[] = useMemo(() => {
    if (!whyTargetAssetId || !cascadeResult) return [];
    return [...getWhyPath(dataset, cascadeResult, whyTargetAssetId)].reverse();
  }, [dataset, cascadeResult, whyTargetAssetId]);

  const selectedAsset = selectedAssetId ? assetMap.get(selectedAssetId) : null;
  const whyTargetAsset = whyTargetAssetId ? assetMap.get(whyTargetAssetId) : null;

  return (
    <div className="w-full h-full flex flex-col bg-slate-950 text-slate-100 overflow-hidden font-sans select-none">
      {/* 1. TOP BAR */}
      <header className="h-13 border-b border-slate-800/80 bg-slate-950 px-4 flex items-center justify-between shrink-0 z-20">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-slate-950 font-black shadow-md shadow-cyan-500/20">
              <Zap className="w-4 h-4" />
            </div>
            <span className="font-black text-sm tracking-wide text-white">CASCADE</span>
          </div>
          <span className="text-slate-600 text-xs hidden sm:inline">|</span>
          <span className="text-xs text-slate-400 font-medium hidden sm:inline">
            City Infrastructure Analysis
          </span>
          <span className="text-slate-600 text-xs hidden md:inline">•</span>
          <div className="text-[11px] font-mono text-slate-400 hidden md:flex items-center gap-2">
            <span className="text-slate-200 font-bold">{dataset.assets.length} Assets</span>
            <span>•</span>
            <span className="text-cyan-300 font-bold">{dataset.dependencies.length} Connections</span>
            <span>•</span>
            <span className="text-amber-300 font-bold">{(dataset.sectors || []).length} Sectors</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Role badge */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-900 border border-slate-800 text-[11px] text-slate-300">
            <span>{roleConfig.icon}</span>
            <span className="font-semibold text-slate-200">{roleConfig.name}</span>
          </div>

          <button
            onClick={onReset}
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold text-slate-400 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-800 transition-colors cursor-pointer"
            title="Start Over"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Start Over</span>
          </button>
        </div>
      </header>

      {/* 2. THREE-PANEL MAIN WORKSPACE: LEFT (22%) | CENTER (56%) | RIGHT (22%) */}
      <div className="flex-1 min-h-0 flex w-full overflow-hidden">
        {/* =================================================================== */}
        {/* LEFT PANEL — BEFORE FAILURE (Weak Point Finder) (~22%)             */}
        {/* =================================================================== */}
        <aside className="w-[22%] min-w-[250px] max-w-[320px] h-full border-r border-slate-800 bg-slate-950 flex flex-col shrink-0 overflow-hidden">
          <div className="p-3.5 border-b border-slate-800/80 bg-slate-900/50 shrink-0">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-widest text-red-400">
                BEFORE FAILURE
              </span>
              <span className="text-[10px] text-slate-500 font-mono">Ranked</span>
            </div>
            <h2 className="text-sm font-black text-white tracking-tight mt-0.5">
              Weak Point Finder
            </h2>
            <p className="text-[11px] text-slate-400 mt-0.5">Find the biggest risk</p>
          </div>

          {/* Weak Points Ranked List */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {hasRunWeakPoints ? (
              weakPoints.slice(0, 7).map((wp, idx) => {
                const isSelected = selectedAssetId === wp.assetId;
                const isFailedNow = activeFailedAssetId === wp.assetId;
                const sectorCfg = getSectorConfig(wp.sector);

                return (
                  <div
                    key={wp.assetId}
                    onClick={() => {
                      setSelectedAssetId(wp.assetId);
                      setWhyTargetAssetId(null);
                    }}
                    className={`p-2.5 rounded-xl border transition-all cursor-pointer ${
                      isFailedNow
                        ? 'bg-red-500/15 border-red-500 shadow-sm shadow-red-950/40'
                        : isSelected
                        ? 'bg-cyan-500/15 border-cyan-500 shadow-sm shadow-cyan-950/40'
                        : 'bg-slate-900/60 border-slate-800/80 hover:border-slate-700 hover:bg-slate-900'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span
                          className={`text-[10px] font-black px-1.5 py-0.2 rounded font-mono ${
                            idx === 0
                              ? 'bg-red-500 text-white'
                              : idx < 3
                              ? 'bg-amber-500/30 text-amber-300'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          #{wp.rank}
                        </span>
                        <span className="text-xs font-bold text-white truncate">
                          {wp.name}
                        </span>
                      </div>

                      <span className="text-xs font-black text-red-400 font-mono shrink-0">
                        {wp.totalCascadeAffected}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-slate-400 mt-1">
                      <span className="flex items-center gap-1">
                        <span
                          className="w-1.5 h-1.5 rounded-full"
                          style={{ backgroundColor: sectorCfg.color }}
                        />
                        {wp.sector}
                      </span>
                      <span>affected</span>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center p-4">
                <button
                  onClick={() => setHasRunWeakPoints(true)}
                  className="w-full py-3 bg-red-600 hover:bg-red-500 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-lg transition-colors cursor-pointer"
                >
                  FIND WEAK POINTS
                </button>
              </div>
            )}
          </div>

          {/* Test Failure trigger card for selected asset */}
          {selectedAsset && (
            <div className="p-3 border-t border-slate-800 bg-slate-900/90 shrink-0">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                WHAT IF THIS FAILS?
              </div>
              <div className="font-bold text-xs text-white truncate mb-2">
                {selectedAsset.name} ({selectedAsset.sector})
              </div>

              <button
                onClick={() => handleStartFailureTest(selectedAsset.id)}
                className="w-full py-2.5 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-md shadow-red-950 flex items-center justify-center gap-1.5 cursor-pointer active:scale-98 transition-all"
              >
                <Zap className="w-3.5 h-3.5" />
                <span>TEST FAILURE</span>
              </button>
            </div>
          )}
        </aside>

        {/* =================================================================== */}
        {/* CENTER — NETWORK + CASCADE TIMELINE (~56%)                         */}
        {/* =================================================================== */}
        <main className="flex-1 h-full min-w-0 flex flex-col bg-slate-950 overflow-hidden relative">
          {/* Center Header: Title & Simulation Summary */}
          <div className="h-11 px-4 border-b border-slate-800/80 bg-slate-900/70 flex items-center justify-between shrink-0 z-10">
            <div className="flex items-center gap-3">
              <span className="text-xs font-black tracking-wide text-white uppercase">
                CITY NETWORK
              </span>

              {isAppliedToGraph && (
                <span className="text-[10px] font-black px-2 py-0.5 rounded bg-emerald-500 text-slate-950 uppercase tracking-wider animate-pulse">
                  AFTER FIX
                </span>
              )}
            </div>

            {/* Calculated failure summary */}
            {isSimulating && cascadeResult ? (
              <div className="flex items-center gap-3 text-xs font-mono">
                <span className="text-red-400 font-bold">1 Failed</span>
                <span className="text-slate-600">•</span>
                <span className="text-amber-400 font-bold">
                  {cascadeResult.affectedNodes.size} Affected
                </span>
                <span className="text-slate-600">•</span>
                <span className="text-blue-400 font-bold">
                  {cascadeResult.sectorsReached.length} Sectors
                </span>
                <span className="text-slate-600">•</span>
                <span className="text-cyan-400 font-bold">
                  {cascadeResult.totalSteps} Steps
                </span>
              </div>
            ) : (
              <div className="text-[11px] text-slate-400">
                Click any service to inspect links or test failure
              </div>
            )}
          </div>

          {/* Main SVG Graph Canvas */}
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
                  id="edge-arrow"
                  viewBox="0 0 10 10"
                  refX="10"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 1 L 10 5 L 0 9 z" fill="#334155" />
                </marker>
                <marker
                  id="edge-arrow-failed"
                  viewBox="0 0 10 10"
                  refX="10"
                  refY="5"
                  markerWidth="7"
                  markerHeight="7"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 1 L 10 5 L 0 9 z" fill="#ef4444" />
                </marker>
                <marker
                  id="edge-arrow-affected"
                  viewBox="0 0 10 10"
                  refX="10"
                  refY="5"
                  markerWidth="7"
                  markerHeight="7"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 1 L 10 5 L 0 9 z" fill="#f97316" />
                </marker>
              </defs>

              <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
                {/* 1. Dependencies (Curved Bezier lines) */}
                {dataset.dependencies.map((dep, idx) => {
                  const srcNode = layoutNodes.get(dep.source);
                  const tgtNode = layoutNodes.get(dep.target);
                  if (!srcNode || !tgtNode) return null;

                  const x1 = srcNode.x + srcNode.width;
                  const y1 = srcNode.y + srcNode.height / 2;
                  const x2 = tgtNode.x;
                  const y2 = tgtNode.y + tgtNode.height / 2;

                  const dx = x2 - x1;
                  const c1x = x1 + dx * 0.45;
                  const c1y = y1;
                  const c2x = x1 + dx * 0.55;
                  const c2y = y2;
                  const pathD = `M ${x1} ${y1} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${x2} ${y2}`;

                  const isCascadeActiveEdge =
                    isSimulating &&
                    cascadeResult?.affectedEdges.has(`${dep.source}->${dep.target}`);

                  const srcVisual = getNodeVisualState(dep.source);
                  const tgtVisual = getNodeVisualState(dep.target);

                  const isActiveEdge =
                    isCascadeActiveEdge &&
                    (srcVisual === 'failed' || srcVisual === 'affected') &&
                    (tgtVisual === 'failed' || tgtVisual === 'affected');

                  return (
                    <path
                      key={`dep-${idx}`}
                      d={pathD}
                      fill="none"
                      stroke={
                        isActiveEdge
                          ? srcVisual === 'failed'
                            ? '#ef4444'
                            : '#f97316'
                          : '#334155'
                      }
                      strokeWidth={isActiveEdge ? 2.5 : 1.2}
                      strokeDasharray={isActiveEdge ? '4 2' : undefined}
                      markerEnd={
                        isActiveEdge
                          ? srcVisual === 'failed'
                            ? 'url(#edge-arrow-failed)'
                            : 'url(#edge-arrow-affected)'
                          : 'url(#edge-arrow)'
                      }
                      className="transition-colors duration-200"
                    />
                  );
                })}

                {/* 2. Asset Nodes */}
                {Array.from(layoutNodes.values()).map((node) => {
                  const { asset } = node;
                  const visualState = getNodeVisualState(asset.id);
                  const isSelected = selectedAssetId === asset.id;
                  const isWhyTarget = whyTargetAssetId === asset.id;
                  const sectorCfg = getSectorConfig(asset.sector);
                  const isEmphasized = isSectorEmphasizedByRole(asset.sector);

                  // Colors & styles based on visual state
                  let bgColor = '#090d16';
                  let borderColor = isSelected ? '#06b6d4' : '#334155';
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
                    const stepNum = cascadeResult?.affectedNodes.get(asset.id)?.step;
                    bgColor = '#431407';
                    borderColor = '#f97316';
                    textColor = '#ffffff';
                    badgeText = `STEP ${stepNum}`;
                    badgeBg = 'bg-amber-500 text-slate-950 font-black';
                  } else if (visualState === 'protected') {
                    bgColor = '#064e3b';
                    borderColor = '#10b981';
                    textColor = '#ffffff';
                    badgeText = 'SAVED';
                    badgeBg = 'bg-emerald-500 text-slate-950 font-black';
                  } else if (visualState === 'still_affected') {
                    bgColor = '#431407';
                    borderColor = '#f97316';
                    textColor = '#ffffff';
                    badgeText = 'AFFECTED';
                    badgeBg = 'bg-amber-500 text-slate-950';
                  } else if (visualState === 'dim' || visualState === 'unaffected') {
                    textColor = '#475569';
                    borderColor = '#1e293b';
                  }

                  return (
                    <g
                      key={asset.id}
                      transform={`translate(${node.x}, ${node.y})`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedAssetId(asset.id);
                        if (visualState === 'affected') {
                          setWhyTargetAssetId(asset.id);
                        }
                      }}
                      className="cursor-pointer group"
                      opacity={isEmphasized ? 1 : 0.65}
                    >
                      {/* Cyan outline if selected in normal state */}
                      {isSelected && (
                        <rect
                          x={-3}
                          y={-3}
                          width={node.width + 6}
                          height={node.height + 6}
                          rx={12}
                          fill="none"
                          stroke="#06b6d4"
                          strokeWidth={2.5}
                          className="animate-pulse"
                        />
                      )}

                      {/* Why Target highlight */}
                      {isWhyTarget && (
                        <rect
                          x={-4}
                          y={-4}
                          width={node.width + 8}
                          height={node.height + 8}
                          rx={13}
                          fill="none"
                          stroke="#f59e0b"
                          strokeWidth={3}
                        />
                      )}

                      {/* Main Node Card */}
                      <rect
                        x={0}
                        y={0}
                        width={node.width}
                        height={node.height}
                        rx={10}
                        fill={bgColor}
                        stroke={borderColor}
                        strokeWidth={isSelected || visualState !== 'normal' ? 2 : 1.2}
                        className="transition-all duration-200"
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
                        fill={visualState === 'dim' ? '#334155' : '#94a3b8'}
                        fontSize="10"
                        fontWeight="500"
                        className="pointer-events-none"
                      >
                        {asset.sector}
                      </text>

                      {/* Visual Badge */}
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

            {/* Floating Zoom Controls */}
            <div className="absolute right-4 bottom-14 flex flex-col gap-1 bg-slate-900/90 border border-slate-800 rounded-xl p-1 backdrop-blur-md shadow-lg z-20">
              <button
                onClick={() => setZoom((z) => Math.min(2.5, +(z + 0.15).toFixed(2)))}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-300 hover:text-white hover:bg-slate-800 cursor-pointer"
                title="Zoom In"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setZoom((z) => Math.max(0.3, +(z - 0.15).toFixed(2)))}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-300 hover:text-white hover:bg-slate-800 cursor-pointer"
                title="Zoom Out"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={fitAndCenterGraph}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-300 hover:text-white hover:bg-slate-800 cursor-pointer"
                title="Fit to Screen"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Controls Bar Below Graph */}
          {isSimulating && cascadeResult && (
            <div className="h-11 border-t border-slate-800 bg-slate-950/90 px-4 flex items-center justify-between shrink-0 z-10">
              {/* Playback Controls */}
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setIsPlayingAnimation((p) => !p)}
                  className="px-2.5 py-1 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black text-xs flex items-center gap-1 cursor-pointer transition-colors"
                >
                  {isPlayingAnimation ? (
                    <>
                      <Pause className="w-3 h-3" />
                      <span>PAUSE</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-3 h-3 fill-current" />
                      <span>PLAY</span>
                    </>
                  )}
                </button>

                <button
                  onClick={() => {
                    setIsPlayingAnimation(false);
                    setActiveStep((prev) =>
                      prev < cascadeResult.totalSteps ? prev + 1 : prev
                    );
                  }}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs cursor-pointer border border-slate-700 transition-colors"
                >
                  NEXT STEP
                </button>

                <button
                  onClick={() => {
                    setIsPlayingAnimation(false);
                    setActiveStep(-1);
                  }}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs cursor-pointer border border-slate-700 transition-colors"
                >
                  SHOW FULL IMPACT
                </button>

                <button
                  onClick={handleResetSimulation}
                  className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white font-bold text-xs cursor-pointer border border-slate-800 transition-colors"
                >
                  RESET
                </button>
              </div>

              {/* Cascade Timeline (Thin Horizontal Line) */}
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-slate-500 uppercase font-black">
                  Timeline:
                </span>
                <div className="flex items-center">
                  <button
                    onClick={() => {
                      setIsPlayingAnimation(false);
                      setActiveStep(0);
                    }}
                    className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black cursor-pointer transition-all ${
                      activeStep === 0
                        ? 'bg-red-500 text-white ring-2 ring-red-400'
                        : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                    }`}
                    title="Initial Failure"
                  >
                    ●
                  </button>

                  {Array.from({ length: cascadeResult.totalSteps }).map((_, i) => {
                    const stepNum = i + 1;
                    return (
                      <React.Fragment key={stepNum}>
                        <div
                          className={`w-5 h-0.5 ${
                            activeStep >= stepNum || activeStep === -1
                              ? 'bg-amber-500'
                              : 'bg-slate-800'
                          }`}
                        />
                        <button
                          onClick={() => {
                            setIsPlayingAnimation(false);
                            setActiveStep(stepNum);
                          }}
                          className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black cursor-pointer transition-all ${
                            activeStep === stepNum
                              ? 'bg-amber-500 text-slate-950 ring-2 ring-amber-300'
                              : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                          }`}
                        >
                          {stepNum}
                        </button>
                      </React.Fragment>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </main>

        {/* =================================================================== */}
        {/* RIGHT PANEL — CONTEXT PANEL (BEFORE → DURING → AFTER) (~22%)       */}
        {/* =================================================================== */}
        <aside className="w-[22%] min-w-[250px] max-w-[320px] h-full border-l border-slate-800 bg-slate-950 flex flex-col shrink-0 overflow-hidden">
          {/* Header */}
          <div className="p-3.5 border-b border-slate-800/80 bg-slate-900/50 shrink-0">
            <span className="text-[10px] font-black uppercase tracking-widest text-cyan-400">
              {isActionLabOpen
                ? 'ACTION LAB'
                : isSimulating
                ? 'AFTER FAILURE'
                : 'SERVICE DETAILS'}
            </span>
            <h2 className="text-sm font-black text-white tracking-tight mt-0.5">
              {isActionLabOpen
                ? 'Test a Fix'
                : isSimulating
                ? 'Cascade Explanation'
                : 'Selected Service'}
            </h2>
          </div>

          {/* Panel Body */}
          <div className="flex-1 overflow-y-auto p-3.5 space-y-4">
            {/* ------------------------------------------------------------- */}
            {/* STATE A: ACTION LAB OPEN (Test a Fix & Compare)              */}
            {/* ------------------------------------------------------------- */}
            {isActionLabOpen ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-300">Choose Action:</span>
                  <button
                    onClick={() => setIsActionLabOpen(false)}
                    className="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-800 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* 3 Action Buttons: PROTECT, SEVER, ADD BACKUP */}
                <div className="space-y-1.5">
                  <button
                    onClick={() => setActionType('protect_asset')}
                    className={`w-full p-2.5 rounded-xl border text-left flex items-center gap-2.5 transition-all cursor-pointer ${
                      actionType === 'protect_asset'
                        ? 'bg-emerald-500/20 border-emerald-500 text-white'
                        : 'bg-slate-900/70 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <Shield className="w-4 h-4 text-emerald-400 shrink-0" />
                    <div>
                      <div className="text-xs font-bold">PROTECT</div>
                      <div className="text-[10px] text-slate-400">
                        Keep one service working.
                      </div>
                    </div>
                  </button>

                  <button
                    onClick={() => setActionType('isolate_connection')}
                    className={`w-full p-2.5 rounded-xl border text-left flex items-center gap-2.5 transition-all cursor-pointer ${
                      actionType === 'isolate_connection'
                        ? 'bg-amber-500/20 border-amber-500 text-white'
                        : 'bg-slate-900/70 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <Scissors className="w-4 h-4 text-amber-400 shrink-0" />
                    <div>
                      <div className="text-xs font-bold">SEVER</div>
                      <div className="text-[10px] text-slate-400">
                        Remove one dependency.
                      </div>
                    </div>
                  </button>

                  <button
                    onClick={() => setActionType('add_connection')}
                    className={`w-full p-2.5 rounded-xl border text-left flex items-center gap-2.5 transition-all cursor-pointer ${
                      actionType === 'add_connection'
                        ? 'bg-cyan-500/20 border-cyan-500 text-white'
                        : 'bg-slate-900/70 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <PlusCircle className="w-4 h-4 text-cyan-400 shrink-0" />
                    <div>
                      <div className="text-xs font-bold">ADD BACKUP</div>
                      <div className="text-[10px] text-slate-400">
                        Create another dependency.
                      </div>
                    </div>
                  </button>
                </div>

                {/* Dropdown selectors for chosen action */}
                <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-xl space-y-2">
                  {actionType === 'protect_asset' && (
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                        Select Service to Protect:
                      </label>
                      <select
                        value={protectTargetId}
                        onChange={(e) => setProtectTargetId(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-emerald-500 cursor-pointer"
                      >
                        {dataset.assets.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name} ({a.sector})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {actionType === 'isolate_connection' && (
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                        Select Dependency to Remove:
                      </label>
                      <select
                        value={isolateEdgeKey}
                        onChange={(e) => setIsolateEdgeKey(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-amber-500 cursor-pointer"
                      >
                        {dataset.dependencies.map((d) => {
                          const src = assetMap.get(d.source);
                          const tgt = assetMap.get(d.target);
                          return (
                            <option key={`${d.source}->${d.target}`} value={`${d.source}->${d.target}`}>
                              {src?.name || d.source} → {tgt?.name || d.target}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  )}

                  {actionType === 'add_connection' && (
                    <div className="space-y-2">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                          Source Provider:
                        </label>
                        <select
                          value={backupSourceId}
                          onChange={(e) => setBackupSourceId(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-cyan-500 cursor-pointer"
                        >
                          {dataset.assets.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.name} ({a.sector})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                          Target Service:
                        </label>
                        <select
                          value={backupTargetId}
                          onChange={(e) => setBackupTargetId(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-cyan-500 cursor-pointer"
                        >
                          {dataset.assets.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.name} ({a.sector})
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}

                  <button
                    onClick={handleRunIntervention}
                    className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-black text-xs uppercase tracking-wider rounded-lg shadow-md transition-colors cursor-pointer"
                  >
                    TEST FIX
                  </button>
                </div>

                {/* Before / After Comparison Results */}
                {interventionResult && (
                  <div className="p-3.5 bg-slate-900 border border-slate-800 rounded-2xl space-y-3">
                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">
                      BEFORE / AFTER
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-center py-2 border-y border-slate-800">
                      <div>
                        <div className="text-[10px] font-bold text-red-400 uppercase">BEFORE</div>
                        <div className="text-xl font-black text-white font-mono">
                          {interventionResult.beforeAffectedCount}
                        </div>
                        <div className="text-[9px] text-slate-400">affected</div>
                      </div>

                      <div>
                        <div className="text-[10px] font-bold text-emerald-400 uppercase">AFTER</div>
                        <div className="text-xl font-black text-emerald-400 font-mono">
                          {interventionResult.afterAffectedCount}
                        </div>
                        <div className="text-[9px] text-slate-400">affected</div>
                      </div>
                    </div>

                    {interventionResult.savedAssetsCount > 0 ? (
                      <div className="text-center">
                        <div className="text-xs font-black text-emerald-400">
                          ✓ {interventionResult.savedAssetsCount} fewer services affected
                        </div>
                        <button
                          onClick={() => setIsAppliedToGraph(true)}
                          className="w-full mt-3 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-black text-xs uppercase tracking-wider rounded-lg shadow transition-colors cursor-pointer"
                        >
                          APPLY TO GRAPH
                        </button>
                      </div>
                    ) : (
                      <div className="text-center text-xs text-amber-400 font-bold">
                        <div>NO IMPROVEMENT</div>
                        <div className="text-[10px] text-slate-400 font-normal mt-0.5">
                          This action did not reduce the cascade.
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : isSimulating && whyTargetAsset ? (
              /* ------------------------------------------------------------- */
              /* STATE B: DURING/AFTER CASCADE — WHY IS THIS AFFECTED?         */
              /* ------------------------------------------------------------- */
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black text-amber-400 tracking-wider uppercase">
                    WHY IS THIS AFFECTED?
                  </span>
                  <button
                    onClick={() => setWhyTargetAssetId(null)}
                    className="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-800 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="font-black text-sm text-white">
                  {whyTargetAsset.name}
                </div>

                {/* Vertical Causation Chain */}
                <div className="space-y-2 p-3 bg-slate-900/80 border border-slate-800 rounded-xl">
                  {whyPath.map((step, idx) => (
                    <React.Fragment key={step.assetId}>
                      <div
                        className={`p-2 rounded-lg text-xs font-bold ${
                          step.isInitialFailure
                            ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                            : idx === whyPath.length - 1
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            : 'bg-slate-800 text-slate-300'
                        }`}
                      >
                        <div>{step.assetName}</div>
                        <div className="text-[9px] text-slate-400 font-normal mt-0.5">
                          {step.sector}
                        </div>
                      </div>
                      {idx < whyPath.length - 1 && (
                        <div className="text-slate-500 font-black text-center text-xs">
                          ↓
                        </div>
                      )}
                    </React.Fragment>
                  ))}
                </div>

                <p className="text-xs text-slate-400 italic">
                  &ldquo;{whyTargetAsset.name} is affected through this dependency chain.&rdquo;
                </p>

                {/* Button to Open Action Lab */}
                <button
                  onClick={() => setIsActionLabOpen(true)}
                  className="w-full py-2.5 bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-slate-950 font-black text-xs uppercase tracking-wider rounded-xl shadow transition-colors cursor-pointer"
                >
                  OPEN ACTION LAB
                </button>
              </div>
            ) : isSimulating ? (
              /* ------------------------------------------------------------- */
              /* STATE C: CASCADE ACTIVE (Prompt to click node or open fix)    */
              /* ------------------------------------------------------------- */
              <div className="space-y-4">
                <div className="p-3.5 bg-slate-900/80 border border-slate-800 rounded-xl text-center space-y-2">
                  <Activity className="w-5 h-5 text-amber-400 mx-auto" />
                  <div className="text-xs font-bold text-white">
                    Cascade in Progress
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Click any orange service in the center graph to see its causation chain.
                  </p>
                </div>

                <div className="p-3.5 bg-slate-900/80 border border-slate-800 rounded-xl text-center space-y-3">
                  <div className="text-xs font-bold text-white">
                    Can we reduce the impact?
                  </div>
                  <button
                    onClick={() => setIsActionLabOpen(true)}
                    className="w-full py-2.5 bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-slate-950 font-black text-xs uppercase tracking-wider rounded-xl shadow transition-colors cursor-pointer"
                  >
                    OPEN ACTION LAB
                  </button>
                </div>
              </div>
            ) : (
              /* ------------------------------------------------------------- */
              /* STATE D: NORMAL NETWORK VIEW (Inspect selected node)          */
              /* ------------------------------------------------------------- */
              selectedAsset && (
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center gap-1.5 mb-1">
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: getSectorConfig(selectedAsset.sector).color }}
                      />
                      <span className="text-[11px] font-bold text-cyan-400 uppercase tracking-wider">
                        {selectedAsset.sector}
                      </span>
                    </div>
                    <h3 className="text-base font-black text-white">
                      {selectedAsset.name}
                    </h3>
                  </div>

                  <div className="space-y-2 p-3 bg-slate-900/80 border border-slate-800 rounded-xl text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Depends on:</span>
                      <span className="font-mono font-bold text-white">
                        {inDegreeMap.get(selectedAsset.id) || 0}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Supports:</span>
                      <span className="font-mono font-bold text-cyan-300">
                        {outDegreeMap.get(selectedAsset.id) || 0}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => handleStartFailureTest(selectedAsset.id)}
                    className="w-full py-2.5 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-md shadow-red-950 flex items-center justify-center gap-1.5 cursor-pointer active:scale-98 transition-all"
                  >
                    <Zap className="w-3.5 h-3.5" />
                    <span>TEST FAILURE</span>
                  </button>
                </div>
              )
            )}
          </div>
        </aside>
      </div>
    </div>
  );
};
