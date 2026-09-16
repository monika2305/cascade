import React, { useState, useMemo, useRef, useEffect } from 'react';
import type { InfrastructureDataset, Asset } from '../types/infrastructure';
import {
  runIntervention,
  generateContextualFixes,
  evaluateFixes,
  getInterventionExplanation,
  type InterventionResult,
} from '../utils/analysis';
import { simulateCascade } from '../utils/cascade';
import { computeGraphLayout } from '../utils/graphLayout';
import { useGraphViewport } from '../hooks/useGraphViewport';
import { GraphControls } from './GraphControls';
import {
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Network,
  ArrowRight,
  Play,
  Pause,
  RotateCcw,
  SkipForward,
  X,
} from 'lucide-react';

interface ActionLabScreenProps {
  dataset: InfrastructureDataset;
  initialFailureId?: string | null;
}

type ViewMode = 'actions' | 'comparison' | 'recovery';

export const ActionLabScreen: React.FC<ActionLabScreenProps> = ({
  dataset,
  initialFailureId,
}) => {
  const [selectedFailureId, setSelectedFailureId] = useState<string>(
    initialFailureId || dataset.assets[0]?.id || ''
  );

  const [viewMode, setViewMode] = useState<ViewMode>('actions');

  // If initialFailureId changes externally
  useEffect(() => {
    if (initialFailureId) {
      setSelectedFailureId(initialFailureId);
      setResult(null);
      setViewMode('actions');
    }
  }, [initialFailureId]);

  // Asset Map
  const assetMap = useMemo(() => {
    const map = new Map<string, Asset>();
    for (const a of dataset.assets) map.set(a.id, a);
    return map;
  }, [dataset.assets]);

  // Baseline cascade calculation
  const baselineCascade = useMemo(() => {
    return simulateCascade(dataset, selectedFailureId);
  }, [dataset, selectedFailureId]);

  // Context-aware fixes (strictly derived from dataset & failed asset)
  const availableFixes = useMemo(() => {
    return generateContextualFixes(dataset, selectedFailureId);
  }, [dataset, selectedFailureId]);

  // Deterministically evaluate all fixes using the SAME cascade engine to find recommendations
  const recommendationData = useMemo(() => {
    return evaluateFixes(dataset, selectedFailureId, availableFixes);
  }, [dataset, selectedFailureId, availableFixes]);

  // Currently selected fix card
  const [selectedFixId, setSelectedFixId] = useState<string>('');

  // Default to the recommended fix (or first available fix) when fixes change
  useEffect(() => {
    if (recommendationData.recommendedFixIds.length > 0) {
      setSelectedFixId(recommendationData.recommendedFixIds[0]);
    } else if (availableFixes.length > 0) {
      setSelectedFixId(availableFixes[0].id);
    } else {
      setSelectedFixId('');
    }
    setResult(null);
    setViewMode('actions');
  }, [availableFixes, recommendationData.recommendedFixIds]);

  const [result, setResult] = useState<InterventionResult | null>(null);
  const [isFullCityView, setIsFullCityView] = useState<boolean>(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Recovery Simulator State
  const [recoveryIndex, setRecoveryIndex] = useState<number>(-1); // -1 = initial failure state
  const [isAutoPlaying, setIsAutoPlaying] = useState<boolean>(false);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [highlightMode, setHighlightMode] = useState<'all' | 'still_affected'>('all');
  const [detailDrawer, setDetailDrawer] = useState<'recovered' | 'still_affected' | null>(null);

  // Relevant node IDs for impact-focused recovery network
  const relevantNodeIds = useMemo(() => {
    if (!result) return new Set<string>();
    const set = new Set<string>();
    set.add(selectedFailureId);
    result.savedAssetIds.forEach((id) => set.add(id));
    result.afterCascade.affectedNodes.forEach((_, id) => set.add(id));
    baselineCascade.affectedNodes.forEach((_, id) => set.add(id));

    // Include backup provider endpoints if any redundant link was added
    (result.modifiedDataset || dataset).dependencies.forEach((d) => {
      if (d.id?.startsWith('redundant-')) {
        set.add(d.source);
        set.add(d.target);
      }
    });

    return set;
  }, [result, selectedFailureId, baselineCascade, dataset]);

  // Focused Subgraph Dataset for Recovery Simulator (hides unrelated nodes to prevent empty space & clutter)
  const recoveryDataset = useMemo(() => {
    if (!result || isFullCityView) return result?.modifiedDataset || dataset;

    const baseDs = result.modifiedDataset || dataset;
    const relevantAssets = baseDs.assets.filter((a) => relevantNodeIds.has(a.id));
    const relevantDependencies = baseDs.dependencies.filter(
      (d) => relevantNodeIds.has(d.source) && relevantNodeIds.has(d.target)
    );

    return {
      ...baseDs,
      assets: relevantAssets,
      dependencies: relevantDependencies,
    };
  }, [result, dataset, relevantNodeIds, isFullCityView]);

  // Layout for graph views
  const layoutNodes = useMemo(() => {
    if (viewMode === 'recovery') {
      return computeGraphLayout(recoveryDataset);
    }
    if (!result) return computeGraphLayout(dataset);
    return computeGraphLayout(result.modifiedDataset);
  }, [viewMode, recoveryDataset, result, dataset]);

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
    padding: 60,
    minZoom: 0.25,
    maxZoom: 2.2,
    targetMaxZoom: 1.15,
  });

  // Auto-fit when switching views or toggling full city
  useEffect(() => {
    if (viewMode === 'comparison' || viewMode === 'recovery') {
      fitGraph(null);
    }
  }, [viewMode, fitGraph, isFullCityView, layoutNodes]);

  const activeFix = availableFixes.find((f) => f.id === selectedFixId);

  const handleTestFix = () => {
    if (!activeFix) return;
    const res = runIntervention(dataset, selectedFailureId, activeFix.action);
    setResult(res);
  };

  // Sets of before and after affected IDs for exact status calculation
  const beforeAffectedSet = useMemo(() => {
    return new Set(Array.from(baselineCascade.affectedNodes.keys()));
  }, [baselineCascade]);

  const afterAffectedSet = useMemo(() => {
    if (!result) return new Set<string>();
    return new Set(Array.from(result.afterCascade.affectedNodes.keys()));
  }, [result]);

  const stillAffectedIds = useMemo(() => {
    if (!result) return [];
    return Array.from(result.afterCascade.affectedNodes.keys()).filter(
      (id) => id !== selectedFailureId
    );
  }, [result, selectedFailureId]);

  // Comparison status in "View What Changed"
  const getComparisonStatus = (
    assetId: string
  ): 'failed' | 'saved' | 'still_affected' | 'not_affected' => {
    if (assetId === selectedFailureId) {
      return 'failed';
    }
    const wasBefore = beforeAffectedSet.has(assetId);
    const isAfter = afterAffectedSet.has(assetId);

    if (wasBefore && !isAfter) {
      return 'saved';
    }
    if (isAfter) {
      return 'still_affected';
    }
    return 'not_affected';
  };

  // Deterministic recovery steps based on cascade graph depths of saved assets
  const recoverySteps = useMemo(() => {
    if (!result || result.savedAssetIds.length === 0) return [1];
    const steps = Array.from(
      new Set(
        result.savedAssetIds.map(
          (id) => baselineCascade.affectedNodes.get(id)?.step ?? 1
        )
      )
    ).sort((a, b) => a - b);
    return steps.length > 0 ? steps : [1];
  }, [result, baselineCascade]);

  // Set of recovered nodes up to current recoveryIndex
  const currentlyRecoveredSet = useMemo(() => {
    if (!result || recoveryIndex < 0) return new Set<string>();
    const maxStep = recoverySteps[Math.min(recoveryIndex, recoverySteps.length - 1)];
    const set = new Set<string>();
    result.savedAssetIds.forEach((id) => {
      const s = baselineCascade.affectedNodes.get(id)?.step ?? 1;
      if (s <= maxStep) {
        set.add(id);
      }
    });
    return set;
  }, [result, recoveryIndex, recoverySteps, baselineCascade]);

  const isComplete = result
    ? recoveryIndex >= recoverySteps.length - 1
    : false;

  const activeRecoveredCount = currentlyRecoveredSet.size;
  const currentAffectedCount = result
    ? result.beforeAffectedCount - activeRecoveredCount
    : 0;

  // Auto-play timer for recovery animation
  useEffect(() => {
    if (!isAutoPlaying) return;
    if (recoverySteps.length === 0) {
      setIsAutoPlaying(false);
      return;
    }
    const timer = setInterval(() => {
      setRecoveryIndex((prev) => {
        if (prev >= recoverySteps.length - 1) {
          setIsAutoPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, 1100);

    return () => clearInterval(timer);
  }, [isAutoPlaying, recoverySteps.length]);

  // Recovery status for each node in Recovery Simulator
  const getRecoveryNodeStatus = (
    assetId: string
  ): 'failed' | 'recovered' | 'affected' | 'backup_source' | 'not_affected' => {
    if (assetId === selectedFailureId) {
      return 'failed';
    }
    if (currentlyRecoveredSet.has(assetId)) {
      return 'recovered';
    }
    if (beforeAffectedSet.has(assetId)) {
      return 'affected';
    }
    // Check if this node is an unaffected backup provider
    if (result) {
      const isBackupSrc = result.modifiedDataset.dependencies.some(
        (d) => d.id?.startsWith('redundant-') && d.source === assetId
      );
      if (isBackupSrc) return 'backup_source';
    }
    return 'not_affected';
  };

  const selectedAsset = assetMap.get(selectedFailureId);

  // Dynamic 1-2 line recovery story generated from actual dependencies
  const currentRecoveryStory = useMemo(() => {
    if (!result) return '';
    if (recoveryIndex < 0) {
      return `INITIAL STATE • ${selectedAsset?.name || 'Service'} failed. All ${
        result.beforeAffectedCount
      } downstream services are currently offline.`;
    }

    const curStep = recoverySteps[Math.min(recoveryIndex, recoverySteps.length - 1)];
    const justRecoveredIds = result.savedAssetIds.filter(
      (id) => (baselineCascade.affectedNodes.get(id)?.step ?? 1) === curStep
    );

    const justRecoveredNames = justRecoveredIds.map(
      (id) => assetMap.get(id)?.name || id
    );

    // Find direct dependent targets that benefit from these recovered nodes
    const directDependents = (result.modifiedDataset || dataset).dependencies
      .filter(
        (d) => justRecoveredIds.includes(d.source) && result.savedAssetIds.includes(d.target)
      )
      .map((d) => assetMap.get(d.target)?.name || d.target);

    const uniqueDependents = Array.from(new Set(directDependents));

    if (recoveryIndex >= recoverySteps.length - 1) {
      return `RECOVERY COMPLETE • ${result.savedAssetsCount} services recovered. ${
        result.afterAffectedCount
      } services remain affected.`;
    }

    if (justRecoveredNames.length > 0) {
      if (uniqueDependents.length > 0) {
        return `STAGE ${recoveryIndex + 1} • ${justRecoveredNames.slice(0, 2).join(' and ')} recovered. Restores supply path allowing ${uniqueDependents.slice(0, 2).join(' and ')} to operate again.`;
      }
      return `STAGE ${recoveryIndex + 1} • ${justRecoveredNames.slice(0, 2).join(' and ')} recovered through the active fix.`;
    }

    return `STAGE ${recoveryIndex + 1} • Intervention active, restoring operational capability.`;
  }, [
    result,
    recoveryIndex,
    recoverySteps,
    baselineCascade,
    assetMap,
    selectedAsset,
    dataset,
  ]);

  return (
    <div className="w-full h-full flex flex-col bg-slate-950 text-slate-100 overflow-hidden">
      {/* Header (ViewMode actions & comparison) */}
      {viewMode !== 'recovery' && (
        <div className="px-6 py-3 border-b border-slate-800/80 bg-slate-950/90 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div>
            <h1 className="text-lg font-black text-white tracking-wide uppercase">
              ACTION LAB
            </h1>
            <p className="text-[11px] text-slate-400">
              "What can we do?"
            </p>
          </div>

          {/* Failed Asset Context Selector */}
          <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs">
            <span className="text-slate-400 font-medium">Scenario:</span>
            <select
              value={selectedFailureId}
              onChange={(e) => {
                setSelectedFailureId(e.target.value);
                setResult(null);
                setViewMode('actions');
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
        </div>
      )}

      {/* VIEW 1: COMPACT MAIN ACTION LAB (Fits on desktop without tall scrolling) */}
      {viewMode === 'actions' && (
        <div className="flex-1 overflow-y-auto p-4 md:p-6 max-w-5xl w-full mx-auto space-y-4">
          {/* A. COMPACT CURRENT PROBLEM: Single compact horizontal status bar */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl px-4 py-2.5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-red-400 font-black flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                <span>⚠ {selectedAsset?.name || 'Service'} failed.</span>
              </span>
              <span className="hidden sm:inline text-xs text-slate-400 font-normal">
                Impacts downstream network
              </span>
            </div>
            <div className="text-xs font-black font-mono text-red-400 bg-red-500/10 border border-red-500/30 px-3 py-1 rounded-lg shrink-0">
              {baselineCascade.affectedNodes.size} affected
            </div>
          </div>

          {/* B. COMPACT FIX SELECTION: Valid fixes in ONE ROW when space allows */}
          <div>
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="text-[11px] font-black uppercase tracking-wider text-slate-400">
                CHOOSE A FIX
              </div>
              {recommendationData.hasTie && (
                <div className="text-[10px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2.5 py-0.5 rounded-full">
                  Multiple fixes give equal protection
                </div>
              )}
            </div>

            {recommendationData.evaluatedFixes.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {recommendationData.evaluatedFixes.map((item) => {
                  const isSelected = selectedFixId === item.fix.id;

                  return (
                    <div
                      key={item.fix.id}
                      onClick={() => {
                        setSelectedFixId(item.fix.id);
                        setResult(null);
                      }}
                      className={`p-3.5 rounded-xl border-2 transition-all cursor-pointer flex flex-col justify-between ${
                        isSelected
                          ? 'bg-cyan-500/10 border-cyan-400 shadow-lg shadow-cyan-950/30 ring-1 ring-cyan-400'
                          : item.isRecommended
                          ? 'bg-slate-900/90 border-amber-500/50 hover:border-amber-400'
                          : 'bg-slate-900/70 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      {/* Top Header & Recommended badge */}
                      <div>
                        <div className="flex items-start justify-between gap-2 mb-1.5">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-xl shrink-0">{item.fix.icon}</span>
                            <h2 className="text-xs font-black text-white uppercase tracking-wide truncate">
                              {item.fix.title}
                            </h2>
                          </div>
                          {item.isRecommended && (
                            <span className="shrink-0 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/40">
                              ⭐ Recommended
                            </span>
                          )}
                        </div>

                        {/* Short one-line description */}
                        <p className="text-[11px] text-slate-300 line-clamp-2 leading-tight">
                          {item.fix.description}
                        </p>
                      </div>

                      {/* Bottom row: Protects X services + select radio */}
                      <div className="flex items-center justify-between pt-2.5 mt-2 border-t border-slate-800/80">
                        <span className="text-xs font-bold text-emerald-400">
                          {item.servicesProtected > 0
                            ? `Protects ${item.servicesProtected}`
                            : 'Protects 0'}
                        </span>
                        <div
                          className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                            isSelected
                              ? 'border-cyan-400 bg-cyan-500'
                              : 'border-slate-600 bg-slate-900'
                          }`}
                        >
                          {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-slate-950" />}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800 text-center text-slate-400 text-xs">
                No usable backup option was found in this city data.
              </div>
            )}
          </div>

          {/* C. COMPACT TEST BUTTON */}
          {availableFixes.length > 0 && (
            <div className="flex justify-center pt-0.5">
              <button
                onClick={handleTestFix}
                disabled={!selectedFixId}
                className="px-6 py-2.5 bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 font-black text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-cyan-950/40 transition-all cursor-pointer active:scale-98 flex items-center gap-2"
              >
                <span>TEST THIS FIX</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* D. COMPACT BEFORE / AFTER RESULT STRIP */}
          {result && activeFix && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-3 animate-fade-in">
              {/* Single compact result strip */}
              <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-950/80 border border-slate-800/80 rounded-xl px-4 py-2.5">
                <div className="flex items-center gap-4 sm:gap-6">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                      BEFORE
                    </span>
                    <span className="text-base sm:text-lg font-black text-red-400 font-mono">
                      {result.beforeAffectedCount}{' '}
                      <span className="text-xs font-normal text-slate-400">affected</span>
                    </span>
                  </div>

                  <ArrowRight className="w-4 h-4 text-slate-600 shrink-0" />

                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                      AFTER
                    </span>
                    <span className="text-base sm:text-lg font-black text-emerald-400 font-mono">
                      {result.afterAffectedCount}{' '}
                      <span className="text-xs font-normal text-slate-400">affected</span>
                    </span>
                  </div>
                </div>

                <div>
                  {result.savedAssetsCount > 0 ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      <span>✓ {result.savedAssetsCount} PROTECTED</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold uppercase tracking-wider bg-slate-800 text-slate-400 border border-slate-700">
                      <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
                      <span>0 PROTECTED</span>
                    </span>
                  )}
                </div>
              </div>

              {/* WHY DID THIS HELP? (Max 1-2 lines) */}
              <div className="px-1 text-xs">
                <div className="text-[10px] font-black uppercase tracking-wider text-emerald-400 mb-0.5">
                  WHY DID THIS HELP?
                </div>
                <p className="text-slate-300 line-clamp-2 leading-relaxed">
                  {getInterventionExplanation(dataset, result, activeFix)}
                </p>
              </div>

              {/* Action Buttons: VIEW WHAT CHANGED & WATCH RECOVERY */}
              <div className="flex flex-wrap items-center justify-end gap-2.5 pt-2 border-t border-slate-800/80">
                <button
                  onClick={() => setViewMode('comparison')}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs uppercase tracking-wider rounded-xl border border-slate-700 cursor-pointer transition-colors flex items-center gap-1.5"
                >
                  <Network className="w-3.5 h-3.5 text-cyan-400" />
                  <span>VIEW WHAT CHANGED</span>
                </button>

                <button
                  onClick={() => {
                    setViewMode('recovery');
                    setRecoveryIndex(-1);
                    setIsAutoPlaying(false);
                    setHighlightMode('all');
                    setDetailDrawer(null);
                  }}
                  className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs uppercase tracking-wider rounded-xl shadow-md cursor-pointer transition-colors flex items-center gap-1.5"
                >
                  <Play className="w-3.5 h-3.5 fill-slate-950" />
                  <span>WATCH RECOVERY</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* VIEW 2: OVERHAULED CITY RECOVERY SIMULATOR */}
      {viewMode === 'recovery' && result && (
        <div className="flex-1 w-full h-full relative overflow-hidden flex flex-col">
          {/* 1. TOP SUMMARY — HERO HEADER */}
          <div className="px-6 py-3 border-b border-slate-800 bg-slate-950/95 flex flex-wrap items-center justify-between gap-4 shrink-0 z-10">
            <div className="flex items-center gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-base font-black text-white uppercase tracking-wider">
                    CITY RECOVERY
                  </h1>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 uppercase">
                    Simulator
                  </span>
                </div>
                <div className="text-xs text-slate-400 mt-0.5 flex flex-wrap items-center gap-2">
                  <span className="text-red-400 font-bold flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    {selectedAsset?.name || 'Service'} failed
                  </span>
                  <span className="text-slate-600">•</span>
                  <span className="text-slate-300">
                    <strong className="text-red-400 font-mono">{result.beforeAffectedCount}</strong> affected before
                    {' '}→{' '}
                    <strong className="text-amber-400 font-mono">{result.afterAffectedCount}</strong> still affected
                  </span>
                </div>
              </div>
            </div>

            {/* The strongest visual hero number */}
            <div className="flex items-center gap-3">
              <div className="bg-emerald-500/15 border-2 border-emerald-500/50 px-4 py-1.5 rounded-xl shadow-lg shadow-emerald-950/30 flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                <div>
                  <div className="text-[9px] font-black uppercase tracking-wider text-emerald-400/80">
                    Protection Impact
                  </div>
                  <div className="text-xl font-black text-emerald-400 font-mono leading-none">
                    ✓ {activeRecoveredCount} RECOVERED
                    {activeRecoveredCount < result.savedAssetsCount && (
                      <span className="text-xs text-emerald-300/70 ml-1 font-normal">
                        / {result.savedAssetsCount}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <button
                onClick={() => {
                  setIsAutoPlaying(false);
                  setViewMode('actions');
                }}
                className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs rounded-xl border border-slate-700 cursor-pointer transition-colors"
              >
                Back to Actions
              </button>
            </div>
          </div>

          {/* 2. RECOVERY PROGRESS BAR */}
          <div className="px-6 py-2 bg-slate-900/90 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-4 shrink-0 z-10 text-xs">
            {/* 3-Stage Progress Indicator */}
            <div className="flex items-center gap-2 sm:gap-3 flex-1 max-w-xl">
              {/* Stage 1: FAILURE */}
              <div className="flex items-center gap-1.5">
                <div
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black ${
                    recoveryIndex === -1
                      ? 'bg-red-500 text-white ring-2 ring-red-400/40 animate-pulse'
                      : 'bg-red-950 text-red-400 border border-red-800'
                  }`}
                >
                  1
                </div>
                <span
                  className={`font-black uppercase tracking-wider text-[11px] ${
                    recoveryIndex === -1 ? 'text-red-400' : 'text-slate-400'
                  }`}
                >
                  FAILURE
                </span>
              </div>

              {/* Connecting Line 1 */}
              <div
                className={`flex-1 h-0.5 rounded transition-colors ${
                  recoveryIndex >= 0 ? 'bg-cyan-500' : 'bg-slate-800'
                }`}
              />

              {/* Stage 2: FIX APPLIED */}
              <div className="flex items-center gap-1.5">
                <div
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black transition-colors ${
                    recoveryIndex >= 0 && !isComplete
                      ? 'bg-cyan-500 text-slate-950 ring-2 ring-cyan-400/40 animate-pulse'
                      : isComplete
                      ? 'bg-cyan-950 text-cyan-400 border border-cyan-700'
                      : 'bg-slate-800 text-slate-500'
                  }`}
                >
                  2
                </div>
                <span
                  className={`font-black uppercase tracking-wider text-[11px] ${
                    recoveryIndex >= 0 ? 'text-cyan-400' : 'text-slate-500'
                  }`}
                >
                  FIX APPLIED
                </span>
              </div>

              {/* Connecting Line 2 */}
              <div
                className={`flex-1 h-0.5 rounded transition-colors ${
                  isComplete ? 'bg-emerald-500' : 'bg-slate-800'
                }`}
              />

              {/* Stage 3: RECOVERY */}
              <div className="flex items-center gap-1.5">
                <div
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black transition-colors ${
                    isComplete
                      ? 'bg-emerald-500 text-slate-950 ring-2 ring-emerald-400/40'
                      : recoveryIndex >= 0
                      ? 'bg-emerald-950 text-emerald-400 border border-emerald-800 animate-pulse'
                      : 'bg-slate-800 text-slate-500'
                  }`}
                >
                  {isComplete ? '✓' : '3'}
                </div>
                <span
                  className={`font-black uppercase tracking-wider text-[11px] ${
                    isComplete
                      ? 'text-emerald-400'
                      : recoveryIndex >= 0
                      ? 'text-emerald-300'
                      : 'text-slate-500'
                  }`}
                >
                  RECOVERY
                </span>
              </div>
            </div>

            {/* View Mode Toggle: Focus on Recovery vs Full City */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  const next = !isFullCityView;
                  setIsFullCityView(next);
                }}
                className={`px-3 py-1 text-xs font-bold rounded-lg border transition-colors cursor-pointer ${
                  isFullCityView
                    ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300'
                    : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300'
                }`}
              >
                {isFullCityView ? 'FOCUS RECOVERY ONLY' : 'VIEW FULL CITY'}
              </button>
            </div>
          </div>

          {/* 8. CONTROLS TOOLBAR */}
          <div className="px-6 py-2.5 bg-slate-950/80 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-3 shrink-0 z-10">
            <div className="flex items-center gap-2">
              {/* PRIMARY: START RECOVERY */}
              <button
                onClick={() => {
                  if (isComplete) {
                    setRecoveryIndex(-1);
                  }
                  setIsAutoPlaying(!isAutoPlaying);
                }}
                className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-emerald-950/40 cursor-pointer transition-all active:scale-98 flex items-center gap-1.5"
              >
                {isAutoPlaying ? (
                  <>
                    <Pause className="w-3.5 h-3.5 fill-slate-950" />
                    <span>PAUSE</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 fill-slate-950" />
                    <span>{isComplete ? 'REPLAY RECOVERY' : 'START RECOVERY'}</span>
                  </>
                )}
              </button>

              {/* SECONDARY: NEXT → */}
              <button
                onClick={() => {
                  setIsAutoPlaying(false);
                  setRecoveryIndex((prev) => Math.min(prev + 1, recoverySteps.length - 1));
                }}
                disabled={isComplete}
                className="px-3 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed text-slate-200 font-bold text-xs rounded-xl border border-slate-700 cursor-pointer transition-colors flex items-center gap-1"
              >
                <span>NEXT</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>

              {/* SECONDARY: COMPLETE */}
              <button
                onClick={() => {
                  setIsAutoPlaying(false);
                  setRecoveryIndex(recoverySteps.length - 1);
                }}
                disabled={isComplete}
                className="px-3 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed text-slate-300 font-bold text-xs rounded-xl border border-slate-700 cursor-pointer transition-colors flex items-center gap-1"
              >
                <SkipForward className="w-3.5 h-3.5" />
                <span>COMPLETE</span>
              </button>

              {/* SECONDARY: RESET */}
              <button
                onClick={() => {
                  setIsAutoPlaying(false);
                  setRecoveryIndex(-1);
                  setHighlightMode('all');
                }}
                className="px-3 py-2 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white font-bold text-xs rounded-xl border border-slate-800 cursor-pointer transition-colors flex items-center gap-1"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>RESET</span>
              </button>
            </div>

            {/* Honest Status Breakdown & Filter Toggle */}
            <div className="flex items-center gap-3 text-xs">
              <div className="flex items-center gap-2">
                <span className="font-bold text-emerald-400 bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 rounded-lg text-xs">
                  ✓ {activeRecoveredCount} Recovered
                </span>
                <span className="font-bold text-orange-400 bg-orange-500/15 border border-orange-500/30 px-2 py-0.5 rounded-lg text-xs">
                  ⚠ {currentAffectedCount} Still Down
                </span>
              </div>

              {/* Toggle to highlight still-affected nodes */}
              <button
                onClick={() =>
                  setHighlightMode((prev) => (prev === 'still_affected' ? 'all' : 'still_affected'))
                }
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors cursor-pointer ${
                  highlightMode === 'still_affected'
                    ? 'bg-orange-500/25 border-orange-500 text-orange-300 ring-1 ring-orange-500'
                    : 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-300'
                }`}
              >
                {highlightMode === 'still_affected' ? 'SHOW ALL' : 'SHOW STILL AFFECTED'}
              </button>
            </div>
          </div>

          {/* RECOVERY GRAPH VIEWPORT */}
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
                  id="rec-arrow-dim"
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
                  id="rec-arrow-affected"
                  viewBox="0 0 10 10"
                  refX="10"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 1 L 10 5 L 0 9 z" fill="#ea580c" />
                </marker>
                <marker
                  id="rec-arrow-recovered"
                  viewBox="0 0 10 10"
                  refX="10"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 1 L 10 5 L 0 9 z" fill="#10b981" />
                </marker>
                <marker
                  id="rec-arrow-backup"
                  viewBox="0 0 10 10"
                  refX="10"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 1 L 10 5 L 0 9 z" fill="#06b6d4" />
                </marker>
              </defs>

              <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
                {/* 10. REDUCED EDGE CLUTTER: Connections */}
                {recoveryDataset.dependencies.map((dep, idx) => {
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

                  const tgtStatus = getRecoveryNodeStatus(dep.target);
                  const isRedundant = dep.id?.startsWith('redundant-');

                  const isConnectedToHovered =
                    hoveredNodeId &&
                    (dep.source === hoveredNodeId || dep.target === hoveredNodeId);
                  const isDimmedByHover = hoveredNodeId && !isConnectedToHovered;

                  let strokeColor = '#1e293b';
                  let markerEnd = 'url(#rec-arrow-dim)';
                  let strokeWidth = 1.2;
                  let strokeOpacity = isDimmedByHover ? 0.15 : 0.4;

                  if (isRedundant) {
                    if (recoveryIndex >= 0) {
                      strokeColor = '#10b981';
                      markerEnd = 'url(#rec-arrow-recovered)';
                      strokeWidth = 3;
                      strokeOpacity = isDimmedByHover ? 0.25 : 1;
                    } else {
                      strokeColor = '#334155';
                      strokeWidth = 1.5;
                    }
                  } else if (tgtStatus === 'recovered') {
                    // Feed line into a recovered node illuminates strong green
                    strokeColor = '#10b981';
                    markerEnd = 'url(#rec-arrow-recovered)';
                    strokeWidth = 2.4;
                    strokeOpacity = isDimmedByHover ? 0.25 : 1;
                  } else if (tgtStatus === 'affected' || tgtStatus === 'failed') {
                    strokeColor = '#ea580c';
                    markerEnd = 'url(#rec-arrow-affected)';
                    strokeWidth = 1.8;
                    strokeOpacity = isDimmedByHover ? 0.2 : 0.85;
                  }

                  if (isConnectedToHovered) {
                    strokeWidth = 3.5;
                    strokeOpacity = 1;
                  }

                  return (
                    <path
                      key={`rec-dep-${idx}`}
                      d={pathD}
                      fill="none"
                      stroke={strokeColor}
                      strokeWidth={strokeWidth}
                      strokeOpacity={strokeOpacity}
                      markerEnd={markerEnd}
                      strokeDasharray={isRedundant ? '4 3' : undefined}
                      className="transition-all duration-300"
                    />
                  );
                })}

                {/* 5. NODE DESIGN: Clean, Legible, Unmistakable */}
                {Array.from(layoutNodes.values()).map((node) => {
                  const { asset } = node;
                  const status = getRecoveryNodeStatus(asset.id);

                  // If user clicked "SHOW STILL AFFECTED", dim other nodes
                  const isDimmedByHighlight =
                    highlightMode === 'still_affected' && status !== 'affected' && status !== 'failed';

                  const isHovered = hoveredNodeId === asset.id;

                  let bgColor = '#090d16';
                  let borderColor = '#1e293b';
                  let textColor = '#475569';
                  let badgeText = 'SAFE';
                  let badgeBg = 'bg-slate-800/80 text-slate-400 border border-slate-700/60';

                  if (status === 'failed') {
                    bgColor = '#450a0a';
                    borderColor = '#ef4444';
                    textColor = '#fee2e2';
                    badgeText = 'FAILED';
                    badgeBg = 'bg-red-600 text-white font-black';
                  } else if (status === 'recovered') {
                    bgColor = '#064e3b';
                    borderColor = '#10b981';
                    textColor = '#d1fae5';
                    badgeText = '✓ RECOVERED';
                    badgeBg = 'bg-emerald-500 text-slate-950 font-black';
                  } else if (status === 'affected') {
                    bgColor = '#431407';
                    borderColor = '#ea580c';
                    textColor = '#ffedd5';
                    badgeText = isComplete && afterAffectedSet.has(asset.id) ? 'STILL DOWN' : 'AFFECTED';
                    badgeBg = 'bg-orange-600 text-white font-bold';
                  } else if (status === 'backup_source') {
                    bgColor = '#083344';
                    borderColor = '#06b6d4';
                    textColor = '#cffafe';
                    badgeText = 'BACKUP FEED';
                    badgeBg = 'bg-cyan-500 text-slate-950 font-black';
                  }

                  return (
                    <g
                      key={asset.id}
                      transform={`translate(${node.x}, ${node.y})`}
                      onMouseEnter={() => setHoveredNodeId(asset.id)}
                      onMouseLeave={() => setHoveredNodeId(null)}
                      className={`cursor-pointer transition-all duration-300 ${
                        isDimmedByHighlight ? 'opacity-30' : 'opacity-100'
                      }`}
                    >
                      {/* Pulsing glow for recovered nodes */}
                      {status === 'recovered' && (
                        <rect
                          x={-3}
                          y={-3}
                          width={node.width + 6}
                          height={node.height + 6}
                          rx={12}
                          fill="none"
                          stroke="#10b981"
                          strokeWidth={2.5}
                          className="animate-pulse"
                        />
                      )}

                      {/* Hover ring */}
                      {isHovered && (
                        <rect
                          x={-4}
                          y={-4}
                          width={node.width + 8}
                          height={node.height + 8}
                          rx={14}
                          fill="none"
                          stroke="#38bdf8"
                          strokeWidth={2}
                        />
                      )}

                      <rect
                        x={0}
                        y={0}
                        width={node.width}
                        height={node.height}
                        rx={10}
                        fill={bgColor}
                        stroke={borderColor}
                        strokeWidth={status !== 'not_affected' ? 2 : 1}
                      />

                      {/* Asset Name */}
                      <text
                        x={14}
                        y={26}
                        fill={textColor}
                        fontSize="12"
                        fontWeight="700"
                        className="pointer-events-none select-none"
                      >
                        {asset.name.length > 18
                          ? asset.name.substring(0, 16) + '...'
                          : asset.name}
                      </text>

                      {/* Asset Sector */}
                      <text
                        x={14}
                        y={44}
                        fill={status !== 'not_affected' ? '#94a3b8' : '#334155'}
                        fontSize="10"
                        fontWeight="500"
                        className="pointer-events-none select-none"
                      >
                        {asset.sector}
                      </text>

                      {/* Status Badge */}
                      <foreignObject
                        x={node.width - (status === 'recovered' ? 100 : 88)}
                        y={8}
                        width={status === 'recovered' ? 92 : 80}
                        height={22}
                      >
                        <div
                          className={`text-[8px] px-1.5 py-0.5 rounded text-center tracking-wider uppercase ${badgeBg}`}
                        >
                          {badgeText}
                        </div>
                      </foreignObject>
                    </g>
                  );
                })}
              </g>
            </svg>

            {/* Reusable Graph Controls — Positioned at bottom-right */}
            <GraphControls
              onZoomIn={zoomIn}
              onZoomOut={zoomOut}
              onFit={() => fitGraph(null)}
              fitLabel={isFullCityView ? 'Fit City' : 'Fit Recovery'}
              className="absolute right-6 bottom-16 z-20"
            />

            {/* 12. OPTIONAL RECOVERED & STILL-AFFECTED DETAIL DRAWER */}
            {detailDrawer && (
              <div className="absolute top-4 right-6 z-30 w-80 max-h-[75vh] bg-slate-900/95 border border-slate-700/80 rounded-2xl shadow-2xl p-4 flex flex-col backdrop-blur-md animate-in fade-in zoom-in-95 duration-150">
                <div className="flex items-center justify-between pb-2.5 border-b border-slate-800">
                  <div className="flex items-center gap-2">
                    {detailDrawer === 'recovered' ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-orange-400" />
                    )}
                    <span className="font-black text-xs uppercase tracking-wider text-white">
                      {detailDrawer === 'recovered'
                        ? `Recovered Services (${result.savedAssetIds.length})`
                        : `Still Affected Services (${stillAffectedIds.length})`}
                    </span>
                  </div>
                  <button
                    onClick={() => setDetailDrawer(null)}
                    className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto mt-2 space-y-1.5 text-xs pr-1">
                  {detailDrawer === 'recovered'
                    ? result.savedAssetIds.map((id) => {
                        const a = assetMap.get(id);
                        return (
                          <div
                            key={id}
                            className="p-2 rounded-lg bg-slate-950/80 border border-slate-800/80 flex items-center justify-between"
                          >
                            <div>
                              <div className="font-bold text-white text-xs">{a?.name || id}</div>
                              <div className="text-[10px] text-slate-400">{a?.sector}</div>
                            </div>
                            <span className="text-[10px] font-black text-emerald-400 bg-emerald-500/20 px-1.5 py-0.5 rounded">
                              ✓ SAVED
                            </span>
                          </div>
                        );
                      })
                    : stillAffectedIds.map((id) => {
                        const a = assetMap.get(id);
                        return (
                          <div
                            key={id}
                            className="p-2 rounded-lg bg-slate-950/80 border border-slate-800/80 flex items-center justify-between"
                          >
                            <div>
                              <div className="font-bold text-white text-xs">{a?.name || id}</div>
                              <div className="text-[10px] text-slate-400">{a?.sector}</div>
                            </div>
                            <span className="text-[10px] font-black text-orange-400 bg-orange-500/20 px-1.5 py-0.5 rounded">
                              ⚠ STILL DOWN
                            </span>
                          </div>
                        );
                      })}
                </div>
              </div>
            )}
          </div>

          {/* 7. SIMPLE RECOVERY STORY AT BOTTOM & COMPLETION ACTIONS */}
          <div className="px-6 py-2.5 bg-slate-950/95 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-4 shrink-0 z-10 text-xs">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div
                className={`w-2 h-2 rounded-full shrink-0 ${
                  isComplete
                    ? 'bg-emerald-400'
                    : recoveryIndex >= 0
                    ? 'bg-cyan-400 animate-ping'
                    : 'bg-red-400'
                }`}
              />
              <div className="text-slate-300 font-medium leading-tight truncate">
                {currentRecoveryStory}
              </div>
            </div>

            {/* Completion Moment Quick Action Buttons */}
            {isComplete && (
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() =>
                    setDetailDrawer((prev) => (prev === 'recovered' ? null : 'recovered'))
                  }
                  className="px-3 py-1 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 font-bold text-xs rounded-lg border border-emerald-500/40 cursor-pointer transition-colors"
                >
                  SEE RECOVERED SERVICES ({result.savedAssetsCount})
                </button>

                {result.afterAffectedCount > 0 && (
                  <button
                    onClick={() =>
                      setDetailDrawer((prev) => (prev === 'still_affected' ? null : 'still_affected'))
                    }
                    className="px-3 py-1 bg-orange-500/15 hover:bg-orange-500/25 text-orange-300 font-bold text-xs rounded-lg border border-orange-500/40 cursor-pointer transition-colors"
                  >
                    SEE WHAT IS STILL AFFECTED ({result.afterAffectedCount})
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* VIEW 3: VIEW WHAT CHANGED (Comparison Graph) */}
      {viewMode === 'comparison' && result && (
        <div className="flex-1 w-full h-full relative overflow-hidden flex flex-col">
          {/* Subheader bar: WHAT CHANGED AFTER THE FIX? */}
          <div className="px-6 py-3 border-b border-slate-800 bg-slate-900/95 flex flex-wrap items-center justify-between gap-4 shrink-0 z-10">
            <div className="space-y-0.5">
              <div className="text-xs font-black text-emerald-400 uppercase tracking-wider">
                WHAT CHANGED AFTER THE FIX?
              </div>
              <div className="text-xs text-slate-300 font-medium flex flex-wrap items-center gap-2.5">
                <span>
                  Before: <strong className="text-red-400 font-mono">{result.beforeAffectedCount}</strong> affected
                </span>
                <span>•</span>
                <span>
                  After: <strong className="text-emerald-400 font-mono">{result.afterAffectedCount}</strong> affected
                </span>
                <span>•</span>
                <span className="text-emerald-400 font-bold">
                  🟢 {result.savedAssetsCount} services saved
                </span>
              </div>
            </div>

            {/* Simple Legend: Failed, Saved, Still Affected, Not Affected */}
            <div className="flex items-center gap-3 text-xs bg-slate-950/80 px-3 py-1.5 rounded-xl border border-slate-800">
              <span className="flex items-center gap-1.5 text-red-400 font-bold">
                <span className="w-2 h-2 rounded-full bg-red-500" />
                <span>Failed</span>
              </span>
              <span className="flex items-center gap-1.5 text-emerald-400 font-bold">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span>Saved</span>
              </span>
              <span className="flex items-center gap-1.5 text-orange-400 font-bold">
                <span className="w-2 h-2 rounded-full bg-orange-500" />
                <span>Still Affected</span>
              </span>
              <span className="flex items-center gap-1.5 text-slate-400 font-bold">
                <span className="w-2 h-2 rounded-full bg-slate-600" />
                <span>Not Affected</span>
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  const next = !isFullCityView;
                  setIsFullCityView(next);
                  fitGraph(next ? null : relevantNodeIds);
                }}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-cyan-300 font-bold text-xs rounded-xl border border-slate-700 cursor-pointer transition-colors"
                title={isFullCityView ? 'Focus on cascade impact area' : 'View all assets in the city'}
              >
                {isFullCityView ? 'FOCUS IMPACT' : 'VIEW FULL CITY'}
              </button>

              <button
                onClick={() => {
                  setViewMode('recovery');
                  setRecoveryIndex(-1);
                  setIsAutoPlaying(false);
                }}
                className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs rounded-xl shadow cursor-pointer transition-colors flex items-center gap-1"
              >
                <Play className="w-3.5 h-3.5 fill-slate-950" />
                <span>Watch Recovery</span>
              </button>

              <button
                onClick={() => setViewMode('actions')}
                className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs rounded-xl border border-slate-700 cursor-pointer transition-colors"
              >
                Back to Actions
              </button>
            </div>
          </div>

          {/* Graph Viewport */}
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
                  id="after-arrow-dim"
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
                  id="after-arrow-affected"
                  viewBox="0 0 10 10"
                  refX="10"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 1 L 10 5 L 0 9 z" fill="#ef4444" />
                </marker>
                <marker
                  id="after-arrow-protected"
                  viewBox="0 0 10 10"
                  refX="10"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 1 L 10 5 L 0 9 z" fill="#10b981" />
                </marker>
              </defs>

              <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
                {/* Dependencies */}
                {(result.modifiedDataset || dataset).dependencies.map((dep, idx) => {
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

                  const srcStatus = getComparisonStatus(dep.source);
                  const tgtStatus = getComparisonStatus(dep.target);

                  let strokeColor = '#1e293b';
                  let markerEnd = 'url(#after-arrow-dim)';
                  let strokeWidth = 1.2;

                  if (dep.id?.startsWith('redundant-')) {
                    strokeColor = '#10b981';
                    markerEnd = 'url(#after-arrow-protected)';
                    strokeWidth = 2.5;
                  } else if (tgtStatus === 'saved') {
                    strokeColor = '#10b981';
                    markerEnd = 'url(#after-arrow-protected)';
                    strokeWidth = 2;
                  } else if (
                    (srcStatus === 'failed' || srcStatus === 'still_affected') &&
                    (tgtStatus === 'failed' || tgtStatus === 'still_affected')
                  ) {
                    strokeColor = '#ef4444';
                    markerEnd = 'url(#after-arrow-affected)';
                    strokeWidth = 2;
                  }

                  return (
                    <path
                      key={`dep-${idx}`}
                      d={pathD}
                      fill="none"
                      stroke={strokeColor}
                      strokeWidth={strokeWidth}
                      markerEnd={markerEnd}
                      strokeDasharray={dep.id?.startsWith('redundant-') ? '4 3' : undefined}
                    />
                  );
                })}

                {/* Nodes */}
                {Array.from(layoutNodes.values()).map((node) => {
                  const { asset } = node;
                  const status = getComparisonStatus(asset.id);

                  let bgColor = '#090d16';
                  let borderColor = '#1e293b';
                  let textColor = '#475569';
                  let badgeText = 'NOT AFFECTED';
                  let badgeBg = 'bg-slate-800/80 text-slate-400 border border-slate-700/60';

                  if (status === 'failed') {
                    bgColor = '#450a0a';
                    borderColor = '#ef4444';
                    textColor = '#fee2e2';
                    badgeText = 'FAILED';
                    badgeBg = 'bg-red-600 text-white font-black';
                  } else if (status === 'saved') {
                    bgColor = '#064e3b';
                    borderColor = '#10b981';
                    textColor = '#d1fae5';
                    badgeText = 'SAVED';
                    badgeBg = 'bg-emerald-500 text-slate-950 font-black';
                  } else if (status === 'still_affected') {
                    bgColor = '#431407';
                    borderColor = '#ea580c';
                    textColor = '#ffedd5';
                    badgeText = 'STILL AFFECTED';
                    badgeBg = 'bg-orange-600 text-white font-bold';
                  }

                  return (
                    <g
                      key={asset.id}
                      transform={`translate(${node.x}, ${node.y})`}
                      className="cursor-pointer group"
                    >
                      {status === 'saved' && (
                        <rect
                          x={-3}
                          y={-3}
                          width={node.width + 6}
                          height={node.height + 6}
                          rx={12}
                          fill="none"
                          stroke="#10b981"
                          strokeWidth={2.5}
                          className="animate-pulse"
                        />
                      )}

                      <rect
                        x={0}
                        y={0}
                        width={node.width}
                        height={node.height}
                        rx={10}
                        fill={bgColor}
                        stroke={borderColor}
                        strokeWidth={status !== 'not_affected' ? 2 : 1}
                      />

                      <text
                        x={14}
                        y={24}
                        fill={textColor}
                        fontSize="12"
                        fontWeight="700"
                        className="pointer-events-none select-none"
                      >
                        {asset.name.length > 17
                          ? asset.name.substring(0, 15) + '...'
                          : asset.name}
                      </text>

                      <text
                        x={14}
                        y={42}
                        fill={status !== 'not_affected' ? '#94a3b8' : '#334155'}
                        fontSize="10"
                        fontWeight="500"
                        className="pointer-events-none select-none"
                      >
                        {asset.sector}
                      </text>

                      {/* Status Badge */}
                      <foreignObject
                        x={node.width - (status === 'still_affected' ? 95 : 80)}
                        y={8}
                        width={status === 'still_affected' ? 90 : 74}
                        height={20}
                      >
                        <div
                          className={`text-[8px] px-1.5 py-0.5 rounded text-center tracking-wider uppercase ${badgeBg}`}
                        >
                          {badgeText}
                        </div>
                      </foreignObject>
                    </g>
                  );
                })}
              </g>
            </svg>

            {/* Standardized Graph Controls */}
            <GraphControls
              onZoomIn={zoomIn}
              onZoomOut={zoomOut}
              onFit={() => fitGraph(isFullCityView ? null : relevantNodeIds)}
              fitLabel={isFullCityView ? 'Fit City' : 'Fit Impact'}
              className="absolute right-6 bottom-6"
            />
          </div>
        </div>
      )}
    </div>
  );
};
