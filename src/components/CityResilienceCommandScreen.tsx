import React, { useState, useMemo, useRef, useEffect } from 'react';
import type { InfrastructureDataset, Asset, UserRole } from '../types/infrastructure';
import { ROLES } from '../types/roles';
import { simulateCascade, type CascadeResult } from '../utils/cascade';
import {
  generateContextualFixes,
  evaluateFixes,
  runIntervention,
  type InterventionResult,
  type ContextualFix,
} from '../utils/analysis';
import { computeMultiStepRecoveryPlan, type RecoveryPlanResult } from '../utils/recoveryPlanner';
import { computeGraphLayout, NODE_WIDTH, NODE_HEIGHT } from '../utils/graphLayout';
import { useGraphViewport } from '../hooks/useGraphViewport';
import { GraphControls } from './GraphControls';
import { getSectorConfig } from '../utils/sectorConfig';
import {
  Radio,
  Zap,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  RotateCcw,
  Sparkles,
  ExternalLink,
  Info,
} from 'lucide-react';

interface CityResilienceCommandScreenProps {
  dataset: InfrastructureDataset;
  userRole: UserRole;
  initialFailureId?: string | null;
  onSelectFailureId?: (assetId: string) => void;
  onNavigateToActionLab?: (assetId: string) => void;
  onNavigateToRecoveryPlan?: (assetId: string) => void;
  onNavigateToFailureTest?: (assetId: string) => void;
}

export const CityResilienceCommandScreen: React.FC<CityResilienceCommandScreenProps> = ({
  dataset,
  userRole,
  initialFailureId,
  onSelectFailureId,
  onNavigateToActionLab,
  onNavigateToRecoveryPlan,
  onNavigateToFailureTest: _onNavigateToFailureTest,
}) => {
  // 1. Current failed asset selection
  const [failedAssetId, setFailedAssetId] = useState<string>(
    initialFailureId || dataset.assets[0]?.id || ''
  );

  // Sync external initialFailureId if provided
  useEffect(() => {
    if (initialFailureId && initialFailureId !== failedAssetId) {
      setFailedAssetId(initialFailureId);
      setIsActionTested(false);
      setTestResult(null);
      setShowWhatChanged(false);
    }
  }, [initialFailureId]);

  const handleFailureChange = (newId: string) => {
    setFailedAssetId(newId);
    setIsActionTested(false);
    setTestResult(null);
    setShowWhatChanged(false);
    if (onSelectFailureId) {
      onSelectFailureId(newId);
    }
  };

  // Asset Map
  const assetMap = useMemo(() => {
    const map = new Map<string, Asset>();
    for (const a of dataset.assets) map.set(a.id, a);
    return map;
  }, [dataset.assets]);

  const currentAsset = assetMap.get(failedAssetId);

  // 2. Deterministic Baseline Cascade
  const cascadeResult: CascadeResult = useMemo(() => {
    return simulateCascade(dataset, failedAssetId);
  }, [dataset, failedAssetId]);

  const affectedCount = cascadeResult.affectedNodes.size;
  const sectorsCount = cascadeResult.sectorsReached.length;

  // 3. Deterministic Action Lab Recommendations
  const contextualFixes = useMemo(() => {
    return generateContextualFixes(dataset, failedAssetId);
  }, [dataset, failedAssetId]);

  const recommendationEval = useMemo(() => {
    return evaluateFixes(dataset, failedAssetId, contextualFixes);
  }, [dataset, failedAssetId, contextualFixes]);

  // Recommended fix: Highest services protected, or first fix if tie/available
  const recommendedFix: ContextualFix | null = useMemo(() => {
    if (recommendationEval.recommendedFixIds.length > 0) {
      const recId = recommendationEval.recommendedFixIds[0];
      return contextualFixes.find((f) => f.id === recId) || null;
    }
    // If no fix has positive protection, pick first available if any
    return contextualFixes[0] || null;
  }, [recommendationEval, contextualFixes]);

  const recommendedEvaluation = useMemo(() => {
    if (!recommendedFix) return null;
    return (
      recommendationEval.evaluatedFixes.find((e) => e.fix.id === recommendedFix.id) || null
    );
  }, [recommendedFix, recommendationEval]);

  // Expected protected count for the recommended fix
  const expectedProtectedCount = recommendedEvaluation?.servicesProtected ?? 0;
  const expectedAfterAffectedCount = recommendedEvaluation
    ? recommendedEvaluation.result.afterAffectedCount
    : affectedCount;

  // 4. Action Testing State
  const [isActionTested, setIsActionTested] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<InterventionResult | null>(null);
  const [showWhatChanged, setShowWhatChanged] = useState<boolean>(false);

  const handleTestAction = () => {
    if (!recommendedFix) return;
    const res = runIntervention(dataset, failedAssetId, recommendedFix.action);
    setTestResult(res);
    setIsActionTested(true);
    setShowWhatChanged(true);
  };

  const handleResetAction = () => {
    setIsActionTested(false);
    setTestResult(null);
    setShowWhatChanged(false);
  };

  // 5. Deterministic Recovery Planner Priority
  const recoveryPlan: RecoveryPlanResult = useMemo(() => {
    return computeMultiStepRecoveryPlan(dataset, failedAssetId);
  }, [dataset, failedAssetId]);

  const topRecoveryStep = recoveryPlan.steps.length > 0 ? recoveryPlan.steps[0] : null;

  // 6. Role Awareness Contextual Emphasis (purely emphasis, no fabricated metrics)
  const roleConfig = useMemo(() => {
    return ROLES.find((r) => r.id === userRole) || ROLES[0];
  }, [userRole]);

  const roleEmphasisSummary = useMemo(() => {
    const affectedAssets = Array.from(cascadeResult.affectedNodes.keys())
      .map((id) => assetMap.get(id))
      .filter((a): a is Asset => Boolean(a));

    if (userRole === 'emergency') {
      const emergencyOrHealth = affectedAssets.filter(
        (a) => a.sector === 'Health' || a.sector === 'Emergency Services' || a.sector === 'Communication'
      );
      if (emergencyOrHealth.length > 0) {
        return `${emergencyOrHealth.length} critical emergency/health facilities in cascade path.`;
      }
      return 'Critical emergency corridors currently monitored.';
    }

    if (userRole === 'operator') {
      const utilityAssets = affectedAssets.filter(
        (a) => a.sector === 'Power' || a.sector === 'Water' || a.sector === 'Transport'
      );
      if (utilityAssets.length > 0) {
        return `${utilityAssets.length} utility distribution nodes in cascade propagation.`;
      }
      return 'Utility networks currently in baseline propagation.';
    }

    if (userRole === 'authority') {
      return `Cross-sector spillover across ${sectorsCount} vital municipal sectors.`;
    }

    // General View
    return `${affectedCount} facilities affected across ${sectorsCount} interconnected sectors.`;
  }, [userRole, cascadeResult, assetMap, sectorsCount, affectedCount]);

  // 7. Graph Viewport & Layout Setup
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Relevant nodes for focused display (failed asset + affected nodes + protected if tested)
  const relevantNodeIds = useMemo(() => {
    const set = new Set<string>();
    set.add(failedAssetId);
    cascadeResult.affectedNodes.forEach((_, id) => set.add(id));
    if (testResult) {
      testResult.savedAssetIds.forEach((id) => set.add(id));
      testResult.afterCascade.affectedNodes.forEach((_, id) => set.add(id));
    }
    return set;
  }, [failedAssetId, cascadeResult, testResult]);

  // Focused dataset containing relevant nodes and their dependencies
  const focusedDataset = useMemo(() => {
    const assets = dataset.assets.filter((a) => relevantNodeIds.has(a.id));
    const dependencies = dataset.dependencies.filter(
      (d) => relevantNodeIds.has(d.source) && relevantNodeIds.has(d.target)
    );
    return {
      ...dataset,
      assets: assets.length > 0 ? assets : dataset.assets,
      dependencies,
    };
  }, [dataset, relevantNodeIds]);

  const layoutNodes = useMemo(() => {
    return computeGraphLayout(focusedDataset);
  }, [focusedDataset]);

  const {
    zoom,
    pan,
    fitGraph,
    zoomIn,
    zoomOut,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleWheel,
  } = useGraphViewport(containerRef, layoutNodes, {
    padding: 50,
    targetMaxZoom: 1.75,
    targetOccupancy: 0.82,
  });

  return (
    <div className="w-full h-full flex flex-col bg-slate-950 text-slate-100 overflow-hidden select-none">
      {/* ========================================================================= */}
      {/* 1. TOP BAR: CITY RESILIENCE COMMAND HEADER                                */}
      {/* ========================================================================= */}
      <header className="h-16 px-6 bg-slate-950/95 border-b border-slate-800 flex items-center justify-between shrink-0 z-30">
        <div className="flex items-center gap-4 min-w-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-red-500/15 border border-red-500/40 flex items-center justify-center text-red-400 shadow-lg shadow-red-500/20">
              <Radio className="w-4 h-4 animate-pulse text-red-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-black tracking-widest text-white uppercase">
                  CITY RESILIENCE COMMAND
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500/20 border border-red-500/40 text-red-400 font-black text-[10px] tracking-wide animate-pulse">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                  ACTIVE CASCADE
                </span>
              </div>
              <div className="text-[11px] text-slate-400 flex items-center gap-2">
                <span>Current Failure Point:</span>
                {/* Failure Asset Dropdown */}
                <select
                  value={failedAssetId}
                  onChange={(e) => handleFailureChange(e.target.value)}
                  className="bg-slate-900 border border-slate-700/80 rounded-md px-2 py-0.5 text-white text-[11px] font-bold focus:outline-none focus:border-cyan-400 cursor-pointer"
                >
                  {dataset.assets.map((asset) => (
                    <option key={asset.id} value={asset.id}>
                      {asset.name} ({asset.sector})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Deterministic Metrics & Role Indicator */}
        <div className="flex items-center gap-3">
          {/* Role Emphasis Badge */}
          <div
            className="hidden lg:flex items-center gap-1.5 px-3 py-1 rounded-xl bg-slate-900 border border-slate-800 text-[11px] text-slate-300 font-medium"
            title={roleConfig.focusDescription}
          >
            <span>{roleConfig.icon}</span>
            <span className="font-bold text-white">{roleConfig.name}:</span>
            <span className="text-slate-400">{roleEmphasisSummary}</span>
          </div>

          {/* Real-time Status Badge */}
          <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-slate-900/90 border border-slate-800">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-black text-rose-400">{affectedCount}</span>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                AFFECTED
              </span>
            </div>
            <span className="text-slate-700">•</span>
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-black text-amber-400">{sectorsCount}</span>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                SECTORS
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* ========================================================================= */}
      {/* 2. MAIN WORKSPACE: 2-COLUMN COMMAND INTERFACE (NO VERTICAL SCROLLING)     */}
      {/* ========================================================================= */}
      <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden">
        {/* ===================================================================== */}
        {/* LEFT / CENTER: CURRENT CASCADE NETWORK VIEW                           */}
        {/* ===================================================================== */}
        <div className="flex-1 relative h-full bg-slate-950/70 border-r border-slate-800/80 overflow-hidden">
          {/* Canvas Sub-Header */}
          <div className="absolute top-4 left-5 z-20 flex items-center gap-2">
            <div className="px-3 py-1.5 rounded-xl bg-slate-900/90 border border-slate-800 backdrop-blur-md flex items-center gap-2.5 shadow-lg">
              <div className="flex items-center gap-1.5 text-[11px] font-bold">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shadow-sm shadow-rose-500/50" />
                <span className="text-slate-300">Root Failure</span>
              </div>
              <span className="text-slate-700">•</span>
              <div className="flex items-center gap-1.5 text-[11px] font-bold">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shadow-sm shadow-amber-500/50" />
                <span className="text-slate-300">
                  {showWhatChanged ? 'Still Affected' : 'Cascade Affected'}
                </span>
              </div>
              {showWhatChanged && (
                <>
                  <span className="text-slate-700">•</span>
                  <div className="flex items-center gap-1.5 text-[11px] font-bold">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400/50" />
                    <span className="text-emerald-300">Protected by Fix</span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* SVG Canvas with Shared Viewport Hook */}
          <div
            ref={containerRef}
            className="w-full h-full cursor-grab active:cursor-grabbing relative overflow-hidden"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onWheel={handleWheel}
          >
            {/* Subtle Grid Background */}
            <div
              className="absolute inset-0 pointer-events-none opacity-20"
              style={{
                backgroundImage:
                  'radial-gradient(circle at 1px 1px, rgba(148, 163, 184, 0.25) 1px, transparent 0)',
                backgroundSize: '28px 28px',
              }}
            />

            <svg
              className="w-full h-full select-none"
              style={{ minWidth: '100%', minHeight: '100%' }}
            >
              <defs>
                <marker
                  id="cmd-arrow-default"
                  viewBox="0 0 10 10"
                  refX="16"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 1 L 9 5 L 0 9 z" fill="#475569" />
                </marker>
                <marker
                  id="cmd-arrow-affected"
                  viewBox="0 0 10 10"
                  refX="16"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 1 L 9 5 L 0 9 z" fill="#f59e0b" />
                </marker>
                <marker
                  id="cmd-arrow-protected"
                  viewBox="0 0 10 10"
                  refX="16"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 1 L 9 5 L 0 9 z" fill="#10b981" />
                </marker>
              </defs>

              <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
                {/* 1. EDGES */}
                {focusedDataset.dependencies.map((dep) => {
                  const sourceNode = layoutNodes.get(dep.source);
                  const targetNode = layoutNodes.get(dep.target);
                  if (!sourceNode || !targetNode) return null;

                  const x1 = sourceNode.x + NODE_WIDTH;
                  const y1 = sourceNode.y + NODE_HEIGHT / 2;
                  const x2 = targetNode.x;
                  const y2 = targetNode.y + NODE_HEIGHT / 2;
                  const dx = (x2 - x1) * 0.5;

                  const pathD = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;

                  const isProtectedEdge =
                    showWhatChanged &&
                    testResult &&
                    (testResult.savedAssetIds.includes(dep.source) ||
                      testResult.savedAssetIds.includes(dep.target));

                  const isAffectedEdge =
                    cascadeResult.affectedEdges.has(`${dep.source}->${dep.target}`) ||
                    (cascadeResult.affectedNodes.has(dep.source) &&
                      cascadeResult.affectedNodes.has(dep.target));

                  let strokeColor = '#334155';
                  let strokeWidth = 1.5;
                  let strokeDasharray: string | undefined = undefined;
                  let markerEnd = 'url(#cmd-arrow-default)';

                  if (isProtectedEdge) {
                    strokeColor = '#10b981';
                    strokeWidth = 2.4;
                    markerEnd = 'url(#cmd-arrow-protected)';
                  } else if (isAffectedEdge) {
                    strokeColor = '#f59e0b';
                    strokeWidth = 2.2;
                    markerEnd = 'url(#cmd-arrow-affected)';
                  }

                  return (
                    <path
                      key={dep.id || `${dep.source}-${dep.target}`}
                      d={pathD}
                      fill="none"
                      stroke={strokeColor}
                      strokeWidth={strokeWidth}
                      strokeDasharray={strokeDasharray}
                      markerEnd={markerEnd}
                      className="transition-all duration-300"
                    />
                  );
                })}

                {/* 2. NODES */}
                {Array.from(layoutNodes.values()).map((node) => {
                  const asset = assetMap.get(node.asset.id) || node.asset;
                  if (!asset) return null;

                  const isRootFailed = node.asset.id === failedAssetId;
                  const isCascadeAffected = cascadeResult.affectedNodes.has(node.asset.id);

                  // Status with tested action
                  const isProtected =
                    showWhatChanged &&
                    testResult &&
                    testResult.savedAssetIds.includes(node.asset.id);

                  const isStillAffected =
                    showWhatChanged &&
                    testResult &&
                    testResult.afterCascade.affectedNodes.has(node.asset.id);

                  const sectorCfg = getSectorConfig(asset.sector);
                  const SectorIcon = sectorCfg.icon;

                  // Dynamic Card Styles
                  let cardBg = 'bg-slate-900/90 border-slate-800 text-slate-300';
                  let statusBadge = (
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-800 text-slate-400">
                      OPERATIONAL
                    </span>
                  );

                  if (isRootFailed) {
                    cardBg = 'bg-rose-950/80 border-rose-500 text-white shadow-xl shadow-rose-950/50';
                    statusBadge = (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-rose-500/30 text-rose-300 border border-rose-500/50">
                        FAILED
                      </span>
                    );
                  } else if (isProtected) {
                    cardBg = 'bg-emerald-950/80 border-emerald-500 text-white shadow-xl shadow-emerald-950/40 ring-1 ring-emerald-400/40';
                    statusBadge = (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-emerald-500/30 text-emerald-300 border border-emerald-500/50 animate-pulse">
                        ✓ PROTECTED
                      </span>
                    );
                  } else if (showWhatChanged && isStillAffected) {
                    cardBg = 'bg-amber-950/80 border-amber-500 text-white shadow-lg shadow-amber-950/40';
                    statusBadge = (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-amber-500/30 text-amber-300 border border-amber-500/50">
                        STILL AFFECTED
                      </span>
                    );
                  } else if (isCascadeAffected) {
                    cardBg = 'bg-amber-950/80 border-amber-500 text-white shadow-lg shadow-amber-950/40';
                    statusBadge = (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-amber-500/30 text-amber-300 border border-amber-500/50">
                        AFFECTED
                      </span>
                    );
                  }

                  return (
                    <foreignObject
                      key={node.asset.id}
                      x={node.x}
                      y={node.y}
                      width={NODE_WIDTH}
                      height={NODE_HEIGHT}
                      className="overflow-visible cursor-pointer"
                    >
                      <div
                        className={`w-full h-full rounded-xl border p-2.5 flex flex-col justify-between transition-all duration-200 ${cardBg}`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <SectorIcon className="w-3.5 h-3.5 shrink-0 text-slate-300" />
                            <span className="text-xs font-bold truncate leading-tight">
                              {asset.name}
                            </span>
                          </div>
                          {statusBadge}
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-slate-400">
                          <span className="font-semibold">{asset.sector}</span>
                          <span className="text-slate-500 font-mono text-[9px]">{asset.id}</span>
                        </div>
                      </div>
                    </foreignObject>
                  );
                })}
              </g>
            </svg>
          </div>

          {/* Graph Controls at Bottom-Right */}
          <GraphControls
            onZoomIn={zoomIn}
            onZoomOut={zoomOut}
            onFit={() => fitGraph(null)}
            fitLabel="Fit Cascade"
            className="absolute right-6 bottom-6 z-20"
          />
        </div>

        {/* ===================================================================== */}
        {/* RIGHT COLUMN: EMERGENCY DECISION PIPELINE (THE CORE HERO)             */}
        {/* ===================================================================== */}
        <div className="w-full md:w-[420px] lg:w-[460px] h-full bg-slate-900/90 border-l border-slate-800 flex flex-col shrink-0 overflow-y-auto z-20 p-5 space-y-4">
          {/* =================================================================== */}
          {/* 1. WHAT FAILED & WHAT IS AFFECTED?                                  */}
          {/* =================================================================== */}
          <section className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-rose-500" />
                1. CURRENT SITUATION
              </div>
              <span className="text-[10px] font-mono text-slate-500">{failedAssetId}</span>
            </div>

            <div className="space-y-2">
              <div>
                <h3 className="text-base font-black text-white leading-tight">
                  {currentAsset?.name || failedAssetId}
                </h3>
                <div className="text-xs text-rose-400 font-bold mt-0.5">
                  Critical failure in {currentAsset?.sector || 'Infrastructure'}
                </div>
              </div>

              {/* Real deterministic counts */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800/80">
                  <div className="text-[10px] uppercase font-bold text-slate-400">Total Affected</div>
                  <div className="text-xl font-black text-amber-400 mt-0.5">
                    {affectedCount}{' '}
                    <span className="text-xs font-normal text-slate-400">services</span>
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800/80">
                  <div className="text-[10px] uppercase font-bold text-slate-400">Sectors Down</div>
                  <div className="text-xl font-black text-amber-400 mt-0.5">
                    {sectorsCount}{' '}
                    <span className="text-xs font-normal text-slate-400">sectors</span>
                  </div>
                </div>
              </div>

              {/* Role Emphasis Callout */}
              <div className="p-2.5 rounded-xl bg-cyan-950/30 border border-cyan-500/20 text-[11px] text-cyan-200 flex items-start gap-2">
                <Info className="w-3.5 h-3.5 shrink-0 text-cyan-400 mt-0.5" />
                <div>
                  <span className="font-bold">{roleConfig.name} Focus: </span>
                  {roleEmphasisSummary}
                </div>
              </div>
            </div>
          </section>

          {/* =================================================================== */}
          {/* 2. WHAT SHOULD I DO NOW? (NEXT ACTION)                              */}
          {/* =================================================================== */}
          <section className="bg-slate-950/90 border border-slate-800 rounded-2xl p-4 shadow-sm flex-1 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="text-[10px] font-black uppercase tracking-widest text-cyan-400 flex items-center gap-1.5">
                  <Sparkles className="w-3 h-3 text-cyan-400" />
                  2. NEXT RECOMMENDED ACTION
                </div>
                {recommendedFix && expectedProtectedCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[10px] font-black">
                    RECOMMENDED
                  </span>
                )}
              </div>

              {recommendedFix ? (
                <div className="space-y-3">
                  <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800">
                    <div className="flex items-start gap-2.5">
                      <span className="text-xl">{recommendedFix.icon}</span>
                      <div className="min-w-0">
                        <div className="text-sm font-black text-white leading-tight">
                          {recommendedFix.title}
                        </div>
                        <div className="text-xs text-slate-400 mt-1 leading-normal">
                          {recommendedFix.description}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Expected Result Breakdown */}
                  <div className="p-3 rounded-xl bg-slate-900 border border-slate-800/80">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                      Expected Result If Tested:
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="text-center">
                        <div className="text-lg font-black text-slate-400">{affectedCount}</div>
                        <div className="text-[10px] text-slate-500 uppercase font-bold">Affected</div>
                      </div>
                      <ArrowRight className="w-4 h-4 text-cyan-400" />
                      <div className="text-center">
                        <div className="text-lg font-black text-amber-400">
                          {expectedAfterAffectedCount}
                        </div>
                        <div className="text-[10px] text-slate-500 uppercase font-bold">After</div>
                      </div>
                      <div className="h-8 w-px bg-slate-800" />
                      <div className="text-right">
                        {expectedProtectedCount > 0 ? (
                          <>
                            <div className="text-lg font-black text-emerald-400">
                              +{expectedProtectedCount}
                            </div>
                            <div className="text-[10px] text-emerald-400 uppercase font-bold">
                              Protected
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="text-xs font-bold text-slate-500">No change</div>
                            <div className="text-[10px] text-slate-500 uppercase font-bold">Impact</div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 text-center text-xs text-slate-400">
                  No available action reduces the current impact.
                </div>
              )}
            </div>

            {/* Test Action Trigger & Tested In-Place Result */}
            <div className="pt-4 mt-3 border-t border-slate-800/80">
              {!isActionTested ? (
                <button
                  onClick={handleTestAction}
                  disabled={!recommendedFix}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-black text-xs uppercase tracking-wider shadow-lg shadow-cyan-500/20 transition-all hover:scale-[1.01] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2"
                >
                  <Zap className="w-4 h-4 fill-slate-950" />
                  <span>TEST ACTION</span>
                </button>
              ) : (
                <div className="space-y-3">
                  {/* Action Tested Hero Pill */}
                  <div className="p-3 rounded-xl bg-emerald-950/50 border border-emerald-500/40">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        <span className="text-xs font-black text-emerald-300 uppercase tracking-wide">
                          ACTION TESTED ✓
                        </span>
                      </div>
                      <span className="text-xs font-bold text-emerald-400 font-mono">
                        {testResult?.savedAssetsCount || 0} PROTECTED
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs mt-2 text-slate-300">
                      <span>
                        Before: <strong className="text-white">{affectedCount}</strong>
                      </span>
                      <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
                      <span>
                        After:{' '}
                        <strong className="text-emerald-400">
                          {testResult?.afterAffectedCount || 0}
                        </strong>
                      </span>
                    </div>
                  </div>

                  {/* Actions Bar */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShowWhatChanged((prev) => !prev)}
                      className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                        showWhatChanged
                          ? 'bg-cyan-500/20 border-cyan-500/60 text-cyan-300'
                          : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      {showWhatChanged ? '✓ Highlighting Changes' : 'View What Changed'}
                    </button>
                    <button
                      onClick={handleResetAction}
                      className="p-2 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
                      title="Reset Tested Action"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Action Lab Deep Link */}
                  {onNavigateToActionLab && (
                    <button
                      onClick={() => onNavigateToActionLab(failedAssetId)}
                      className="w-full py-2 px-3 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-cyan-400 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <span>Simulate in Action Lab</span>
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  )}
                </div>
              )}
            </div>
          </section>

          {/* =================================================================== */}
          {/* 3. RECOVERY PRIORITY (FROM RECOVERY PLANNER)                        */}
          {/* =================================================================== */}
          <section className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                3. RECOVERY PRIORITY
              </div>
              <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500">
                Step 1 of {recoveryPlan.steps.length}
              </span>
            </div>

            {topRecoveryStep ? (
              <div className="space-y-2.5">
                <div>
                  <div className="text-xs font-black text-white">
                    Restore {topRecoveryStep.assetName} first
                  </div>
                  <div className="text-[11px] text-emerald-400 font-bold mt-0.5">
                    Could recover {topRecoveryStep.servicesRecovered}{' '}
                    {topRecoveryStep.servicesRecovered === 1 ? 'service' : 'services'}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1 leading-normal">
                    {topRecoveryStep.explanation}
                  </div>
                </div>

                {onNavigateToRecoveryPlan && (
                  <button
                    onClick={() => onNavigateToRecoveryPlan(failedAssetId)}
                    className="w-full py-2 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-bold text-slate-200 hover:text-white flex items-center justify-between transition-colors cursor-pointer"
                  >
                    <span>View Recovery Plan</span>
                    <ArrowRight className="w-3.5 h-3.5 text-cyan-400" />
                  </button>
                )}
              </div>
            ) : (
              <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-center text-xs text-slate-400">
                No restoration currently improves service recovery.
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};
