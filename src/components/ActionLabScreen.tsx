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
import { NetworkNodeCard } from './NetworkNodeCard';
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

  // Layout for graph views (Preserve stable city topology from City Network)
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
    padding: 24,
    minZoom: 0.25,
    maxZoom: 2.5,
    targetMaxZoom: 1.85,
    targetOccupancy: 0.88,
  });

  // Auto-fit when switching views
  useEffect(() => {
    if (viewMode === 'comparison' || viewMode === 'recovery') {
      fitGraph(null);
    }
  }, [viewMode, fitGraph]);

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
    <div className="w-full h-full flex flex-col bg-[#061019] text-[#f2f4f0] overflow-hidden">
      {/* Header (ViewMode actions & comparison) */}
      {viewMode !== 'recovery' && (
        <div className="px-6 py-3.5 border-b border-[#182c3f] bg-[#071321]/95 backdrop-blur-md flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-[10px] font-mono tracking-[0.2em] text-[#a8e2dc] uppercase">Intervention Studio</span>
              <span className="w-3 h-px bg-[#a8e2dc]/40"></span>
            </div>
            <h1 className="text-sm font-semibold text-[#f2f4f0] tracking-wide uppercase">
              Action Lab
            </h1>
          </div>

          {/* Failed Asset Context Selector */}
          <div className="flex items-center gap-2 bg-[#0a1726] border border-[#182c3f] rounded-xl px-3 py-1.5 text-xs">
            <span className="text-[#a9b9c3] font-medium">Scenario:</span>
            <select
              value={selectedFailureId}
              onChange={(e) => {
                setSelectedFailureId(e.target.value);
                setResult(null);
                setViewMode('actions');
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
        </div>
      )}

      {/* VIEW 1: COMPACT MAIN ACTION LAB (Fits on desktop without tall scrolling) */}
      {viewMode === 'actions' && (
        <div className="flex-1 overflow-y-auto p-4 md:p-6 max-w-5xl w-full mx-auto space-y-4">
          {/* A. COMPACT CURRENT PROBLEM: Single compact horizontal status bar */}
          <div className="bg-[#0a1726] border border-[#182c3f] rounded-xl px-4 py-2.5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-red-400 font-medium flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                <span>{selectedAsset?.name || 'Service'} failed.</span>
              </span>
              <span className="hidden sm:inline text-xs text-[#a9b9c3] font-normal">
                Impacts downstream infrastructure network
              </span>
            </div>
            <div className="text-xs font-mono font-medium text-red-400 bg-[#2a0e14] border border-red-500/30 px-3 py-1 rounded-lg shrink-0">
              {baselineCascade.affectedNodes.size} affected
            </div>
          </div>

          {/* B. COMPACT FIX SELECTION: Valid fixes in ONE ROW when space allows */}
          <div>
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-[#a9b9c3]">
                Available Interventions
              </div>
              {recommendationData.hasTie && (
                <div className="text-[10px] font-medium text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2.5 py-0.5 rounded-full">
                  Multiple fixes provide equivalent protection
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
                      className={`p-4 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                        isSelected
                          ? 'bg-[#071321] border-[#a8e2dc] shadow-lg shadow-black/40 ring-1 ring-[#a8e2dc]/50'
                          : item.isRecommended
                          ? 'bg-[#0a1726] border-amber-500/40 hover:border-amber-400/60'
                          : 'bg-[#0a1726] border-[#182c3f] hover:border-[#84979a40]'
                      }`}
                    >
                      {/* Top Header & Recommended badge */}
                      <div>
                        <div className="flex items-start justify-between gap-2 mb-1.5">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-xl shrink-0">{item.fix.icon}</span>
                            <h2 className="text-xs font-semibold text-[#f2f4f0] uppercase tracking-wide truncate">
                              {item.fix.title}
                            </h2>
                          </div>
                          {item.isRecommended && (
                            <span className="shrink-0 px-2 py-0.5 rounded-full text-[9px] font-semibold uppercase tracking-wider bg-amber-500/15 text-amber-300 border border-amber-500/30">
                              ★ Recommended
                            </span>
                          )}
                        </div>

                        {/* Short one-line description */}
                        <p className="text-[11px] text-[#a9b9c3] line-clamp-2 leading-relaxed">
                          {item.fix.description}
                        </p>
                      </div>

                      {/* Bottom row: Protects X services + select radio */}
                      <div className="flex items-center justify-between pt-2.5 mt-3 border-t border-[#182c3f]">
                        <span className="text-xs font-semibold text-emerald-400 font-mono">
                          {item.servicesProtected > 0
                            ? `Protects ${item.servicesProtected}`
                            : 'Protects 0'}
                        </span>
                        <div
                          className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                            isSelected
                              ? 'border-[#a8e2dc] bg-[#a8e2dc]'
                              : 'border-[#182c3f] bg-[#071321]'
                          }`}
                        >
                          {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-[#061019]" />}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-[#0a1726] border border-[#182c3f] text-center text-[#a9b9c3] text-xs">
                No usable backup option was found in this city data.
              </div>
            )}
          </div>

          {/* C. COMPACT TEST BUTTON */}
          {availableFixes.length > 0 && (
            <div className="flex justify-center pt-1">
              <button
                onClick={handleTestFix}
                disabled={!selectedFixId}
                className="px-6 py-2.5 bg-[#e1ede6] hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed text-[#112826] font-medium text-xs uppercase tracking-wider rounded-xl shadow-sm transition-all cursor-pointer active:scale-98 flex items-center gap-2"
              >
                <span>TEST THIS FIX</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* D. COMPACT BEFORE / AFTER RESULT STRIP */}
          {result && activeFix && (
            <div className="bg-[#0a1726] border border-[#182c3f] rounded-2xl p-4 shadow-xl space-y-3 animate-fade-in">
              {/* Single compact result strip */}
              <div className="flex flex-wrap items-center justify-between gap-3 bg-[#071321] border border-[#182c3f] rounded-xl px-4 py-2.5">
                <div className="flex items-center gap-4 sm:gap-6">
                  <div>
                    <span className="text-[10px] font-mono uppercase tracking-wider text-[#a9b9c3] block">
                      BEFORE
                    </span>
                    <span className="text-base sm:text-lg font-semibold text-red-400 font-mono">
                      {result.beforeAffectedCount}{' '}
                      <span className="text-xs font-normal text-[#a9b9c3]">affected</span>
                    </span>
                  </div>

                  <ArrowRight className="w-4 h-4 text-[#182c3f] shrink-0" />

                  <div>
                    <span className="text-[10px] font-mono uppercase tracking-wider text-[#a9b9c3] block">
                      AFTER
                    </span>
                    <span className="text-base sm:text-lg font-semibold text-emerald-400 font-mono">
                      {result.afterAffectedCount}{' '}
                      <span className="text-xs font-normal text-[#a9b9c3]">affected</span>
                    </span>
                  </div>
                </div>

                <div>
                  {result.savedAssetsCount > 0 ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold uppercase tracking-wider bg-[#07261e] text-emerald-300 border border-emerald-500/40 font-mono">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      <span>✓ {result.savedAssetsCount} PROTECTED</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium uppercase tracking-wider bg-[#071321] text-[#a9b9c3] border border-[#182c3f]">
                      <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
                      <span>0 PROTECTED</span>
                    </span>
                  )}
                </div>
              </div>

              {/* WHY DID THIS HELP? (Max 1-2 lines) */}
              <div className="px-1 text-xs">
                <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-emerald-400 mb-1">
                  Why Did This Help?
                </div>
                <p className="text-[#a9b9c3] line-clamp-2 leading-relaxed">
                  {getInterventionExplanation(dataset, result, activeFix)}
                </p>
              </div>

              {/* Action Buttons: VIEW WHAT CHANGED & WATCH RECOVERY */}
              <div className="flex flex-wrap items-center justify-end gap-2.5 pt-2 border-t border-[#182c3f]">
                <button
                  onClick={() => setViewMode('comparison')}
                  className="px-4 py-2 bg-[#071321] hover:bg-[#0d1e2e] text-[#f2f4f0] font-medium text-xs uppercase tracking-wider rounded-xl border border-[#182c3f] hover:border-[#84979a40] cursor-pointer transition-colors flex items-center gap-1.5"
                >
                  <Network className="w-3.5 h-3.5 text-[#a8e2dc]" />
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
                  className="px-4 py-2 bg-[#e1ede6] hover:bg-white text-[#112826] font-medium text-xs uppercase tracking-wider rounded-xl shadow-sm cursor-pointer transition-colors flex items-center gap-1.5"
                >
                  <Play className="w-3.5 h-3.5 fill-[#112826]" />
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
          <div className="px-6 py-3.5 border-b border-[#182c3f] bg-[#071321]/95 backdrop-blur-md flex flex-wrap items-center justify-between gap-4 shrink-0 z-10">
            <div className="flex items-center gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono tracking-[0.2em] text-[#a8e2dc] uppercase">Restoration Studio</span>
                  <span className="w-3 h-px bg-[#a8e2dc]/40"></span>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <h1 className="text-sm font-semibold text-[#f2f4f0] uppercase tracking-wide">
                    City Recovery Simulator
                  </h1>
                </div>
                <div className="text-xs text-[#a9b9c3] mt-0.5 flex flex-wrap items-center gap-2">
                  <span className="text-red-400 font-medium flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    {selectedAsset?.name || 'Service'} failed
                  </span>
                  <span className="text-[#182c3f]">•</span>
                  <span className="text-[#a9b9c3]">
                    <strong className="text-red-400 font-mono font-medium">{result.beforeAffectedCount}</strong> affected before
                    {' '}→{' '}
                    <strong className="text-amber-400 font-mono font-medium">{result.afterAffectedCount}</strong> still affected
                  </span>
                </div>
              </div>
            </div>

            {/* The strongest visual hero number */}
            <div className="flex items-center gap-3">
              <div className="bg-[#07261e] border border-emerald-500/40 px-4 py-1.5 rounded-xl shadow-lg shadow-black/40 flex items-center gap-2.5">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                <div>
                  <div className="text-[9px] font-mono uppercase tracking-wider text-emerald-400/90">
                    Protection Impact
                  </div>
                  <div className="text-lg font-semibold text-emerald-300 font-mono leading-none mt-0.5">
                    ✓ {activeRecoveredCount} RECOVERED
                    {activeRecoveredCount < result.savedAssetsCount && (
                      <span className="text-xs text-emerald-400/70 ml-1 font-normal">
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
                className="px-3.5 py-2 bg-[#0a1726] hover:bg-[#0d1e2e] text-[#f2f4f0] font-medium text-xs rounded-xl border border-[#182c3f] hover:border-[#84979a40] cursor-pointer transition-colors"
              >
                Back to Actions
              </button>
            </div>
          </div>

          {/* 2. RECOVERY PROGRESS BAR */}
          <div className="px-6 py-2.5 bg-[#0a1726] border-b border-[#182c3f] flex flex-wrap items-center justify-between gap-4 shrink-0 z-10 text-xs">
            {/* 3-Stage Progress Indicator */}
            <div className="flex items-center gap-2 sm:gap-3 flex-1 max-w-xl">
              {/* Stage 1: FAILURE */}
              <div className="flex items-center gap-1.5">
                <div
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-mono font-bold ${
                    recoveryIndex === -1
                      ? 'bg-red-500 text-white ring-2 ring-red-400/40 animate-pulse'
                      : 'bg-[#2a0e14] text-red-400 border border-red-800/60'
                  }`}
                >
                  1
                </div>
                <span
                  className={`font-mono uppercase tracking-wider text-[11px] ${
                    recoveryIndex === -1 ? 'text-red-400 font-semibold' : 'text-[#a9b9c3]'
                  }`}
                >
                  FAILURE
                </span>
              </div>

              {/* Connecting Line 1 */}
              <div
                className={`flex-1 h-0.5 rounded transition-colors ${
                  recoveryIndex >= 0 ? 'bg-[#a8e2dc]' : 'bg-[#182c3f]'
                }`}
              />

              {/* Stage 2: FIX APPLIED */}
              <div className="flex items-center gap-1.5">
                <div
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-mono font-bold transition-colors ${
                    recoveryIndex >= 0 && !isComplete
                      ? 'bg-[#a8e2dc] text-[#061019] ring-2 ring-[#a8e2dc]/40 animate-pulse'
                      : isComplete
                      ? 'bg-[#0a2328] text-[#a8e2dc] border border-[#a8e2dc]/60'
                      : 'bg-[#071321] text-[#a9b9c3]'
                  }`}
                >
                  2
                </div>
                <span
                  className={`font-mono uppercase tracking-wider text-[11px] ${
                    recoveryIndex >= 0 ? 'text-[#a8e2dc] font-semibold' : 'text-[#a9b9c3]'
                  }`}
                >
                  FIX APPLIED
                </span>
              </div>

              {/* Connecting Line 2 */}
              <div
                className={`flex-1 h-0.5 rounded transition-colors ${
                  isComplete ? 'bg-emerald-500' : 'bg-[#182c3f]'
                }`}
              />

              {/* Stage 3: RECOVERY */}
              <div className="flex items-center gap-1.5">
                <div
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-mono font-bold transition-colors ${
                    isComplete
                      ? 'bg-emerald-500 text-slate-950 ring-2 ring-emerald-400/40'
                      : recoveryIndex >= 0
                      ? 'bg-[#07261e] text-emerald-400 border border-emerald-800/60 animate-pulse'
                      : 'bg-[#071321] text-[#a9b9c3]'
                  }`}
                >
                  {isComplete ? '✓' : '3'}
                </div>
                <span
                  className={`font-mono uppercase tracking-wider text-[11px] ${
                    isComplete
                      ? 'text-emerald-400 font-semibold'
                      : recoveryIndex >= 0
                      ? 'text-emerald-300'
                      : 'text-[#a9b9c3]'
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
                className={`px-3 py-1 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
                  isFullCityView
                    ? 'bg-[#a8e2dc]/10 border-[#a8e2dc] text-[#a8e2dc]'
                    : 'bg-[#071321] hover:bg-[#0d1e2e] border-[#182c3f] text-[#a9b9c3]'
                }`}
              >
                {isFullCityView ? 'FOCUS RECOVERY ONLY' : 'VIEW FULL CITY'}
              </button>
            </div>
          </div>

          {/* 8. CONTROLS TOOLBAR */}
          <div className="px-6 py-2.5 bg-[#071321]/95 border-b border-[#182c3f] flex flex-wrap items-center justify-between gap-3 shrink-0 z-10">
            <div className="flex items-center gap-2">
              {/* PRIMARY: START RECOVERY */}
              <button
                onClick={() => {
                  if (isComplete) {
                    setRecoveryIndex(-1);
                  }
                  setIsAutoPlaying(!isAutoPlaying);
                }}
                className="px-4 py-2 bg-[#e1ede6] hover:bg-white text-[#112826] font-medium text-xs uppercase tracking-wider rounded-xl shadow-sm cursor-pointer transition-all active:scale-98 flex items-center gap-1.5"
              >
                {isAutoPlaying ? (
                  <>
                    <Pause className="w-3.5 h-3.5 fill-[#112826]" />
                    <span>PAUSE</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 fill-[#112826]" />
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
                className="px-3.5 py-2 bg-[#0a1726] hover:bg-[#0d1e2e] disabled:opacity-30 disabled:cursor-not-allowed text-[#f2f4f0] font-medium text-xs rounded-xl border border-[#182c3f] hover:border-[#84979a40] cursor-pointer transition-colors flex items-center gap-1"
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
                className="px-3.5 py-2 bg-[#0a1726] hover:bg-[#0d1e2e] disabled:opacity-30 disabled:cursor-not-allowed text-[#f2f4f0] font-medium text-xs rounded-xl border border-[#182c3f] hover:border-[#84979a40] cursor-pointer transition-colors flex items-center gap-1"
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
                className="px-3 py-2 bg-transparent hover:bg-[#0a1726] text-[#a9b9c3] hover:text-[#f2f4f0] font-medium text-xs rounded-xl border border-[#182c3f] cursor-pointer transition-colors flex items-center gap-1"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>RESET</span>
              </button>
            </div>

            {/* Honest Status Breakdown & Filter Toggle */}
            <div className="flex items-center gap-3 text-xs">
              <div className="flex items-center gap-2">
                <span className="font-medium font-mono text-emerald-400 bg-[#07261e] border border-emerald-500/30 px-2.5 py-0.5 rounded-lg text-xs">
                  ✓ {activeRecoveredCount} Recovered
                </span>
                <span className="font-medium font-mono text-amber-400 bg-[#261405] border border-amber-500/30 px-2.5 py-0.5 rounded-lg text-xs">
                  ⚠ {currentAffectedCount} Still Down
                </span>
              </div>

              {/* Toggle to highlight still-affected nodes */}
              <button
                onClick={() =>
                  setHighlightMode((prev) => (prev === 'still_affected' ? 'all' : 'still_affected'))
                }
                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-colors cursor-pointer ${
                  highlightMode === 'still_affected'
                    ? 'bg-amber-500/15 border-amber-500 text-amber-300 ring-1 ring-amber-500/40'
                    : 'bg-[#0a1726] hover:bg-[#0d1e2e] border-[#182c3f] text-[#a9b9c3]'
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
            className={`flex-1 w-full h-full relative select-none overflow-hidden bg-[#061019] bg-[radial-gradient(#182c3f_1px,transparent_1px)] [background-size:24px_24px] ${
              isDragging ? 'cursor-grabbing' : 'cursor-grab'
            }`}
          >
            <svg className="w-full h-full pointer-events-auto">
              <defs>
                {/* Dotted Canvas Grid Pattern */}
                <pattern
                  id="rec-dot-grid"
                  width="24"
                  height="24"
                  patternUnits="userSpaceOnUse"
                >
                  <circle cx="2" cy="2" r="1.1" fill="#1e3850" opacity="0.75" />
                </pattern>

                <marker
                  id="rec-arrow-dim"
                  viewBox="0 0 10 10"
                  refX="8"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#334155" />
                </marker>
                <marker
                  id="rec-arrow-affected"
                  viewBox="0 0 10 10"
                  refX="8"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#ea580c" />
                </marker>
                <marker
                  id="rec-arrow-recovered"
                  viewBox="0 0 10 10"
                  refX="8"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#10b981" />
                </marker>
                <marker
                  id="rec-arrow-backup"
                  viewBox="0 0 10 10"
                  refX="8"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#06b6d4" />
                </marker>
              </defs>

              {/* Dotted Canvas Grid Background */}
              <rect width="100%" height="100%" fill="url(#rec-dot-grid)" className="pointer-events-none" />

              <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
                {/* 1. Curved Connections with State Overlays */}
                {(result?.modifiedDataset || dataset).dependencies.map((dep, idx) => {
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

                  const tgtStatus = getRecoveryNodeStatus(dep.target);
                  const isRedundant = dep.id?.startsWith('redundant-');

                  const isConnectedToHovered =
                    hoveredNodeId &&
                    (dep.source === hoveredNodeId || dep.target === hoveredNodeId);
                  const isDimmedByHover = hoveredNodeId && !isConnectedToHovered;

                  let strokeColor = '#182c3f';
                  let markerEnd = 'url(#rec-arrow-dim)';
                  let strokeWidth = 1.3;
                  let strokeOpacity = isDimmedByHover ? 0.12 : 0.3;

                  if (isRedundant) {
                    if (recoveryIndex >= 0) {
                      strokeColor = '#10b981';
                      markerEnd = 'url(#rec-arrow-recovered)';
                      strokeWidth = 2.8;
                      strokeOpacity = isDimmedByHover ? 0.25 : 1;
                    } else {
                      strokeColor = '#334155';
                      strokeWidth = 1.5;
                    }
                  } else if (tgtStatus === 'recovered') {
                    strokeColor = '#10b981';
                    markerEnd = 'url(#rec-arrow-recovered)';
                    strokeWidth = 2.4;
                    strokeOpacity = isDimmedByHover ? 0.25 : 1;
                  } else if (tgtStatus === 'affected' || tgtStatus === 'failed') {
                    strokeColor = '#ea580c';
                    markerEnd = 'url(#rec-arrow-affected)';
                    strokeWidth = 2.0;
                    strokeOpacity = isDimmedByHover ? 0.2 : 0.85;
                  }

                  if (isConnectedToHovered) {
                    strokeWidth = 3;
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

                {/* 2. Nodes with Shared Node Presentation */}
                {Array.from(layoutNodes.values()).map((node) => {
                  const { asset } = node;
                  const status = getRecoveryNodeStatus(asset.id);

                  const isDimmedByHighlight =
                    highlightMode === 'still_affected' && status !== 'affected' && status !== 'failed';

                  let cardStatus: 'normal' | 'failed' | 'affected' | 'recovered' | 'backup_source' | 'dimmed' = 'dimmed';
                  let badgeText = '';
                  let badgeBg = '';

                  if (status === 'failed') {
                    cardStatus = 'failed';
                    badgeText = 'FAILED';
                    badgeBg = 'bg-red-600 text-white font-bold';
                  } else if (status === 'recovered') {
                    cardStatus = 'recovered';
                    badgeText = '✓ RECOVERED';
                    badgeBg = 'bg-emerald-500 text-slate-950 font-bold';
                  } else if (status === 'affected') {
                    cardStatus = 'affected';
                    badgeText = isComplete && afterAffectedSet.has(asset.id) ? 'STILL DOWN' : 'AFFECTED';
                    badgeBg = 'bg-amber-500 text-slate-950 font-bold';
                  } else if (status === 'backup_source') {
                    cardStatus = 'backup_source';
                    badgeText = 'BACKUP FEED';
                    badgeBg = 'bg-[#a8e2dc] text-[#061019] font-bold';
                  } else {
                    cardStatus = 'dimmed';
                  }

                  return (
                    <NetworkNodeCard
                      key={asset.id}
                      node={node}
                      asset={asset}
                      status={cardStatus}
                      badgeText={badgeText}
                      badgeBg={badgeBg}
                      isHovered={hoveredNodeId === asset.id}
                      onMouseEnter={() => setHoveredNodeId(asset.id)}
                      onMouseLeave={() => setHoveredNodeId(null)}
                      onClick={() => {
                        if (status === 'recovered') {
                          setDetailDrawer('recovered');
                        } else if (status === 'affected') {
                          setDetailDrawer('still_affected');
                        }
                      }}
                      className={isDimmedByHighlight ? 'opacity-25 transition-opacity duration-300' : 'transition-opacity duration-300'}
                    />
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
          <div className="px-6 py-3 bg-[#071321]/95 border-t border-[#182c3f] flex flex-wrap items-center justify-between gap-4 shrink-0 z-10 text-xs">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div
                className={`w-2 h-2 rounded-full shrink-0 ${
                  isComplete
                    ? 'bg-emerald-400'
                    : recoveryIndex >= 0
                    ? 'bg-[#a8e2dc] animate-ping'
                    : 'bg-red-400'
                }`}
              />
              <div className="text-[#f2f4f0] font-normal leading-tight truncate">
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
                  className="px-3 py-1 bg-[#07261e] hover:bg-[#0c372c] text-emerald-300 font-medium text-xs rounded-lg border border-emerald-500/40 cursor-pointer transition-colors"
                >
                  SEE RECOVERED SERVICES ({result.savedAssetsCount})
                </button>

                {result.afterAffectedCount > 0 && (
                  <button
                    onClick={() =>
                      setDetailDrawer((prev) => (prev === 'still_affected' ? null : 'still_affected'))
                    }
                    className="px-3 py-1 bg-[#261405] hover:bg-[#381e08] text-amber-300 font-medium text-xs rounded-lg border border-amber-500/40 cursor-pointer transition-colors"
                  >
                    SEE STILL AFFECTED ({result.afterAffectedCount})
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
          <div className="px-6 py-3.5 border-b border-[#182c3f] bg-[#071321]/95 backdrop-blur-md flex flex-wrap items-center justify-between gap-4 shrink-0 z-10">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[10px] font-mono tracking-[0.2em] text-[#a8e2dc] uppercase">Impact Delta</span>
                <span className="w-3 h-px bg-[#a8e2dc]/40"></span>
              </div>
              <h2 className="text-sm font-semibold text-[#f2f4f0] uppercase tracking-wide">
                Differential Network Comparison
              </h2>
              <div className="text-xs text-[#a9b9c3] font-normal flex flex-wrap items-center gap-2.5 mt-0.5">
                <span>
                  Before: <strong className="text-red-400 font-mono font-medium">{result.beforeAffectedCount}</strong> affected
                </span>
                <span className="text-[#182c3f]">•</span>
                <span>
                  After: <strong className="text-emerald-400 font-mono font-medium">{result.afterAffectedCount}</strong> affected
                </span>
                <span className="text-[#182c3f]">•</span>
                <span className="text-emerald-400 font-medium font-mono">
                  ✓ {result.savedAssetsCount} services saved
                </span>
              </div>
            </div>

            {/* Simple Legend: Failed, Saved, Still Affected, Not Affected */}
            <div className="flex items-center gap-3 text-xs bg-[#0a1726] px-3.5 py-1.5 rounded-xl border border-[#182c3f]">
              <span className="flex items-center gap-1.5 text-red-400 font-medium">
                <span className="w-2 h-2 rounded-full bg-red-500" />
                <span>Failed</span>
              </span>
              <span className="flex items-center gap-1.5 text-emerald-400 font-medium">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span>Saved</span>
              </span>
              <span className="flex items-center gap-1.5 text-amber-400 font-medium">
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                <span>Still Affected</span>
              </span>
              <span className="flex items-center gap-1.5 text-[#a9b9c3] font-medium">
                <span className="w-2 h-2 rounded-full bg-[#182c3f]" />
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
                className="px-3.5 py-2 bg-[#0a1726] hover:bg-[#0d1e2e] text-[#a8e2dc] font-medium text-xs rounded-xl border border-[#182c3f] hover:border-[#84979a40] cursor-pointer transition-colors"
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
                className="px-3.5 py-2 bg-[#e1ede6] hover:bg-white text-[#112826] font-medium text-xs uppercase tracking-wider rounded-xl shadow-sm cursor-pointer transition-colors flex items-center gap-1.5"
              >
                <Play className="w-3.5 h-3.5 fill-[#112826]" />
                <span>WATCH RECOVERY</span>
              </button>

              <button
                onClick={() => setViewMode('actions')}
                className="px-3.5 py-2 bg-[#0a1726] hover:bg-[#0d1e2e] text-[#f2f4f0] font-medium text-xs rounded-xl border border-[#182c3f] hover:border-[#84979a40] cursor-pointer transition-colors"
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
            className={`flex-1 w-full h-full relative select-none overflow-hidden bg-[#061019] bg-[radial-gradient(#182c3f_1px,transparent_1px)] [background-size:24px_24px] ${
              isDragging ? 'cursor-grabbing' : 'cursor-grab'
            }`}
          >
            <svg className="w-full h-full pointer-events-auto">
              <defs>
                {/* Dotted Canvas Grid Pattern */}
                <pattern
                  id="after-dot-grid"
                  width="24"
                  height="24"
                  patternUnits="userSpaceOnUse"
                >
                  <circle cx="2" cy="2" r="1.1" fill="#1e3850" opacity="0.75" />
                </pattern>

                <marker
                  id="after-arrow-dim"
                  viewBox="0 0 10 10"
                  refX="8"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#334155" />
                </marker>
                <marker
                  id="after-arrow-affected"
                  viewBox="0 0 10 10"
                  refX="8"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#ef4444" />
                </marker>
                <marker
                  id="after-arrow-protected"
                  viewBox="0 0 10 10"
                  refX="8"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#10b981" />
                </marker>
              </defs>

              {/* Dotted Canvas Grid Background */}
              <rect width="100%" height="100%" fill="url(#after-dot-grid)" className="pointer-events-none" />

              <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
                {/* 1. Dependencies with City Network Curved Bezier */}
                {(result.modifiedDataset || dataset).dependencies.map((dep, idx) => {
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

                  const srcStatus = getComparisonStatus(dep.source);
                  const tgtStatus = getComparisonStatus(dep.target);

                  let strokeColor = '#182c3f';
                  let strokeWidth = 1.3;
                  let strokeOpacity = 0.25;
                  let markerEnd = 'url(#after-arrow-dim)';

                  if (dep.id?.startsWith('redundant-')) {
                    strokeColor = '#10b981';
                    markerEnd = 'url(#after-arrow-protected)';
                    strokeWidth = 2.8;
                    strokeOpacity = 1;
                  } else if (tgtStatus === 'saved') {
                    strokeColor = '#10b981';
                    markerEnd = 'url(#after-arrow-protected)';
                    strokeWidth = 2.4;
                    strokeOpacity = 1;
                  } else if (
                    (srcStatus === 'failed' || srcStatus === 'still_affected') &&
                    (tgtStatus === 'failed' || tgtStatus === 'still_affected')
                  ) {
                    strokeColor = '#ef4444';
                    markerEnd = 'url(#after-arrow-affected)';
                    strokeWidth = 2.0;
                    strokeOpacity = 0.9;
                  }

                  return (
                    <path
                      key={`dep-${idx}`}
                      d={pathD}
                      fill="none"
                      stroke={strokeColor}
                      strokeWidth={strokeWidth}
                      strokeOpacity={strokeOpacity}
                      markerEnd={markerEnd}
                      strokeDasharray={dep.id?.startsWith('redundant-') ? '4 3' : undefined}
                      className="transition-all duration-300"
                    />
                  );
                })}

                {/* 2. Nodes with Shared Node Presentation */}
                {Array.from(layoutNodes.values()).map((node) => {
                  const { asset } = node;
                  const status = getComparisonStatus(asset.id);

                  let cardStatus: 'normal' | 'failed' | 'affected' | 'recovered' | 'dimmed' = 'dimmed';
                  let badgeText = '';
                  let badgeBg = '';

                  if (status === 'failed') {
                    cardStatus = 'failed';
                    badgeText = 'FAILED';
                    badgeBg = 'bg-red-600 text-white font-bold';
                  } else if (status === 'saved') {
                    cardStatus = 'recovered';
                    badgeText = 'SAVED';
                    badgeBg = 'bg-emerald-500 text-slate-950 font-bold';
                  } else if (status === 'still_affected') {
                    cardStatus = 'affected';
                    badgeText = 'STILL AFFECTED';
                    badgeBg = 'bg-amber-500 text-slate-950 font-bold';
                  } else {
                    cardStatus = 'dimmed';
                  }

                  return (
                    <NetworkNodeCard
                      key={asset.id}
                      node={node}
                      asset={asset}
                      status={cardStatus}
                      badgeText={badgeText}
                      badgeBg={badgeBg}
                    />
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
