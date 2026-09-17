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
    padding: 28,
    minZoom: 0.25,
    maxZoom: 2.5,
    targetMaxZoom: 1.85,
    targetOccupancy: 0.88,
  });

  return (
    <div className="w-full h-full flex flex-col bg-[#061019] text-[#f2f4f0] overflow-hidden select-none">
      {/* ========================================================================= */}
      {/* 1. TOP BAR: CITY RESILIENCE COMMAND HEADER                                */}
      {/* ========================================================================= */}
      <header className="h-16 px-6 bg-[#071321]/95 border-b border-[#182c3f] flex items-center justify-between shrink-0 z-30">
        <div className="flex items-center gap-4 min-w-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-400">
              <Radio className="w-4 h-4 animate-pulse text-red-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold tracking-wider text-[#f2f4f0] uppercase">
                  City Resilience Command
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#2a0e14] border border-red-500/40 text-red-400 font-medium text-[10px] tracking-wide">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                  ACTIVE CASCADE
                </span>
              </div>
              <div className="text-[11px] text-[#a9b9c3] flex items-center gap-2 mt-0.5">
                <span>Trigger Outage:</span>
                {/* Failure Asset Dropdown */}
                <select
                  value={failedAssetId}
                  onChange={(e) => handleFailureChange(e.target.value)}
                  className="bg-[#0a1726] border border-[#182c3f] rounded-lg px-2 py-0.5 text-[#f2f4f0] text-[11px] font-medium focus:outline-none focus:border-[#a8e2dc]/60 cursor-pointer"
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
            className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#0a1726] border border-[#182c3f] text-[11px] text-[#a9b9c3] font-normal"
            title={roleConfig.focusDescription}
          >
            <span>{roleConfig.icon}</span>
            <span className="font-semibold text-[#f2f4f0]">{roleConfig.name}:</span>
            <span className="text-[#a9b9c3]">{roleEmphasisSummary}</span>
          </div>

          {/* Real-time Status Badge */}
          <div className="flex items-center gap-2.5 px-3.5 py-1.5 rounded-xl bg-[#0a1726] border border-[#182c3f]">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-semibold text-rose-400">{affectedCount}</span>
              <span className="text-[10px] font-mono uppercase tracking-wider text-[#a9b9c3]">
                AFFECTED
              </span>
            </div>
            <span className="text-[#182c3f]">•</span>
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-semibold text-amber-400">{sectorsCount}</span>
              <span className="text-[10px] font-mono uppercase tracking-wider text-[#a9b9c3]">
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
        <div className="flex-1 relative h-full bg-[#061019] border-r border-[#182c3f] overflow-hidden">
          {/* Canvas Sub-Header */}
          <div className="absolute top-4 left-5 z-20 flex items-center gap-2">
            <div className="px-3 py-1.5 rounded-xl bg-[#0a1726]/90 border border-[#182c3f] backdrop-blur-md flex items-center gap-2.5 shadow-lg">
              <div className="flex items-center gap-1.5 text-[11px] font-medium">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shadow-sm shadow-rose-500/50" />
                <span className="text-[#f2f4f0]">Root Failure</span>
              </div>
              <span className="text-[#182c3f]">•</span>
              <div className="flex items-center gap-1.5 text-[11px] font-medium">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shadow-sm shadow-amber-500/50" />
                <span className="text-[#f2f4f0]">
                  {showWhatChanged ? 'Still Affected' : 'Cascade Affected'}
                </span>
              </div>
              {showWhatChanged && (
                <>
                  <span className="text-[#182c3f]">•</span>
                  <div className="flex items-center gap-1.5 text-[11px] font-medium">
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
                  let cardBg = 'bg-[#0a1726]/95 border-[#182c3f] text-[#f2f4f0]';
                  let statusBadge = (
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-[#071321] text-[#a9b9c3] border border-[#182c3f]">
                      OPERATIONAL
                    </span>
                  );

                  if (isRootFailed) {
                    cardBg = 'bg-[#2a0e14] border-rose-500 text-white shadow-xl shadow-rose-950/40';
                    statusBadge = (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/40">
                        FAILED
                      </span>
                    );
                  } else if (isProtected) {
                    cardBg = 'bg-[#07261e] border-emerald-500 text-white shadow-xl shadow-emerald-950/40 ring-1 ring-emerald-400/40';
                    statusBadge = (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 animate-pulse">
                        ✓ PROTECTED
                      </span>
                    );
                  } else if (showWhatChanged && isStillAffected) {
                    cardBg = 'bg-[#261405] border-amber-500 text-white shadow-lg shadow-amber-950/30';
                    statusBadge = (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                        STILL AFFECTED
                      </span>
                    );
                  } else if (isCascadeAffected) {
                    cardBg = 'bg-[#261405] border-amber-500 text-white shadow-lg shadow-amber-950/30';
                    statusBadge = (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/40">
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
                            <SectorIcon className="w-3.5 h-3.5 shrink-0 text-[#a9b9c3]" />
                            <span className="text-xs font-semibold truncate leading-tight">
                              {asset.name}
                            </span>
                          </div>
                          {statusBadge}
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-[#a9b9c3]">
                          <span className="font-medium">{asset.sector}</span>
                          <span className="text-[#a9b9c3]/70 font-mono text-[9px]">{asset.id}</span>
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
        <div className="w-full md:w-[420px] lg:w-[460px] h-full bg-[#071321]/95 border-l border-[#182c3f] flex flex-col shrink-0 overflow-y-auto z-20 p-5 space-y-4">
          {/* =================================================================== */}
          {/* 1. WHAT FAILED & WHAT IS AFFECTED?                                  */}
          {/* =================================================================== */}
          <section className="bg-[#0a1726] border border-[#182c3f] rounded-2xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[10px] font-mono tracking-[0.2em] uppercase text-[#a9b9c3] flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-rose-500" />
                1. Current Situation
              </div>
              <span className="text-[10px] font-mono text-[#a9b9c3]/70">{failedAssetId}</span>
            </div>

            <div className="space-y-2.5">
              <div>
                <h3 className="text-sm font-semibold text-[#f2f4f0] leading-tight">
                  {currentAsset?.name || failedAssetId}
                </h3>
                <div className="text-xs text-rose-400 font-medium mt-0.5">
                  Critical failure in {currentAsset?.sector || 'Infrastructure'}
                </div>
              </div>

              {/* Real deterministic counts */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div className="p-3 rounded-xl bg-[#071321] border border-[#182c3f]">
                  <div className="text-[10px] uppercase font-mono text-[#a9b9c3]">Total Affected</div>
                  <div className="text-xl font-semibold text-amber-400 mt-0.5">
                    {affectedCount}{' '}
                    <span className="text-xs font-normal text-[#a9b9c3]">services</span>
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-[#071321] border border-[#182c3f]">
                  <div className="text-[10px] uppercase font-mono text-[#a9b9c3]">Sectors Down</div>
                  <div className="text-xl font-semibold text-amber-400 mt-0.5">
                    {sectorsCount}{' '}
                    <span className="text-xs font-normal text-[#a9b9c3]">sectors</span>
                  </div>
                </div>
              </div>

              {/* Role Emphasis Callout */}
              <div className="p-2.5 rounded-xl bg-[#071321] border border-[#182c3f] text-[11px] text-[#a9b9c3] flex items-start gap-2">
                <Info className="w-3.5 h-3.5 shrink-0 text-[#a8e2dc] mt-0.5" />
                <div>
                  <span className="font-semibold text-[#f2f4f0]">{roleConfig.name} Focus: </span>
                  {roleEmphasisSummary}
                </div>
              </div>
            </div>
          </section>

          {/* =================================================================== */}
          {/* 2. WHAT SHOULD I DO NOW? (NEXT ACTION)                              */}
          {/* =================================================================== */}
          <section className="bg-[#0a1726] border border-[#182c3f] rounded-2xl p-4 shadow-sm flex-1 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="text-[10px] font-mono tracking-[0.2em] uppercase text-[#a8e2dc] flex items-center gap-1.5">
                  <Sparkles className="w-3 h-3 text-[#a8e2dc]" />
                  2. Recommended Action
                </div>
                {recommendedFix && expectedProtectedCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[10px] font-semibold">
                    RECOMMENDED
                  </span>
                )}
              </div>

              {recommendedFix ? (
                <div className="space-y-3">
                  <div className="p-3.5 rounded-xl bg-[#071321] border border-[#182c3f]">
                    <div className="flex items-start gap-2.5">
                      <span className="text-xl">{recommendedFix.icon}</span>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-[#f2f4f0] leading-tight">
                          {recommendedFix.title}
                        </div>
                        <div className="text-xs text-[#a9b9c3] mt-1 leading-normal">
                          {recommendedFix.description}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Expected Result Breakdown */}
                  <div className="p-3 rounded-xl bg-[#071321] border border-[#182c3f]">
                    <div className="text-[10px] font-mono uppercase tracking-wider text-[#a9b9c3] mb-2">
                      Expected Result If Tested:
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="text-center">
                        <div className="text-lg font-semibold text-[#a9b9c3]">{affectedCount}</div>
                        <div className="text-[10px] text-[#a9b9c3]/70 uppercase font-mono">Affected</div>
                      </div>
                      <ArrowRight className="w-4 h-4 text-[#a8e2dc]" />
                      <div className="text-center">
                        <div className="text-lg font-semibold text-amber-400">
                          {expectedAfterAffectedCount}
                        </div>
                        <div className="text-[10px] text-[#a9b9c3]/70 uppercase font-mono">After</div>
                      </div>
                      <div className="h-8 w-px bg-[#182c3f]" />
                      <div className="text-right">
                        {expectedProtectedCount > 0 ? (
                          <>
                            <div className="text-lg font-semibold text-emerald-400">
                              +{expectedProtectedCount}
                            </div>
                            <div className="text-[10px] text-emerald-400 uppercase font-mono">
                              Protected
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="text-xs font-medium text-[#a9b9c3]">No change</div>
                            <div className="text-[10px] text-[#a9b9c3]/70 uppercase font-mono">Impact</div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-[#071321] border border-[#182c3f] text-center text-xs text-[#a9b9c3]">
                  No available action reduces the current impact.
                </div>
              )}
            </div>

            {/* Test Action Trigger & Tested In-Place Result */}
            <div className="pt-4 mt-3 border-t border-[#182c3f]">
              {!isActionTested ? (
                <button
                  onClick={handleTestAction}
                  disabled={!recommendedFix}
                  className="w-full py-2.5 rounded-xl bg-[#e1ede6] hover:bg-white text-[#112826] font-medium text-xs uppercase tracking-wider shadow-sm transition-all hover:scale-[1.01] active:scale-98 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2"
                >
                  <Zap className="w-3.5 h-3.5 fill-[#112826]" />
                  <span>TEST ACTION</span>
                </button>
              ) : (
                <div className="space-y-3">
                  {/* Action Tested Hero Pill */}
                  <div className="p-3 rounded-xl bg-[#07261e] border border-emerald-500/40">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        <span className="text-xs font-semibold text-emerald-300 uppercase tracking-wide">
                          ACTION TESTED ✓
                        </span>
                      </div>
                      <span className="text-xs font-semibold text-emerald-400 font-mono">
                        {testResult?.savedAssetsCount || 0} PROTECTED
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs mt-2 text-[#a9b9c3]">
                      <span>
                        Before: <strong className="text-[#f2f4f0]">{affectedCount}</strong>
                      </span>
                      <ArrowRight className="w-3.5 h-3.5 text-[#182c3f]" />
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
                      className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                        showWhatChanged
                          ? 'bg-[#a8e2dc]/10 border-[#a8e2dc] text-[#a8e2dc]'
                          : 'bg-[#071321] border-[#182c3f] text-[#a9b9c3] hover:text-[#f2f4f0] hover:border-[#84979a40]'
                      }`}
                    >
                      {showWhatChanged ? '✓ Highlighting Changes' : 'View What Changed'}
                    </button>
                    <button
                      onClick={handleResetAction}
                      className="p-2 rounded-lg bg-[#071321] border border-[#182c3f] hover:border-[#84979a40] text-[#a9b9c3] hover:text-[#f2f4f0] transition-colors cursor-pointer"
                      title="Reset Tested Action"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Action Lab Deep Link */}
                  {onNavigateToActionLab && (
                    <button
                      onClick={() => onNavigateToActionLab(failedAssetId)}
                      className="w-full py-2 px-3 rounded-lg bg-[#071321] hover:bg-[#0d1e2e] border border-[#182c3f] hover:border-[#84979a40] text-[#a8e2dc] text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
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
          <section className="bg-[#0a1726] border border-[#182c3f] rounded-2xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[10px] font-mono tracking-[0.2em] uppercase text-[#a9b9c3] flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                3. Recovery Priority
              </div>
              <span className="text-[9px] font-mono uppercase tracking-wider text-[#a9b9c3]/70">
                Step 1 of {recoveryPlan.steps.length}
              </span>
            </div>

            {topRecoveryStep ? (
              <div className="space-y-2.5">
                <div>
                  <div className="text-xs font-semibold text-[#f2f4f0]">
                    Restore {topRecoveryStep.assetName} first
                  </div>
                  <div className="text-[11px] text-emerald-400 font-medium mt-0.5">
                    Could recover {topRecoveryStep.servicesRecovered}{' '}
                    {topRecoveryStep.servicesRecovered === 1 ? 'service' : 'services'}
                  </div>
                  <div className="text-[11px] text-[#a9b9c3] mt-1 leading-normal">
                    {topRecoveryStep.explanation}
                  </div>
                </div>

                {onNavigateToRecoveryPlan && (
                  <button
                    onClick={() => onNavigateToRecoveryPlan(failedAssetId)}
                    className="w-full py-2 px-3 rounded-xl bg-[#071321] hover:bg-[#0d1e2e] border border-[#182c3f] hover:border-[#84979a40] text-xs font-medium text-[#f2f4f0] flex items-center justify-between transition-colors cursor-pointer"
                  >
                    <span>View Recovery Plan</span>
                    <ArrowRight className="w-3.5 h-3.5 text-[#a8e2dc]" />
                  </button>
                )}
              </div>
            ) : (
              <div className="p-3 rounded-xl bg-[#071321] border border-[#182c3f] text-center text-xs text-[#a9b9c3]">
                No restoration currently improves service recovery.
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};
