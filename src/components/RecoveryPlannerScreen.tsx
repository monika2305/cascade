import React, { useState, useMemo, useRef, useEffect } from 'react';
import type { InfrastructureDataset, Asset } from '../types/infrastructure';
import { simulateCascade } from '../utils/cascade';
import {
  evaluateRestorationCandidates,
  computeMultiStepRecoveryPlan,
  simulateCascadeWithRestorations,
  type RestorationCandidate,
} from '../utils/recoveryPlanner';
import { computeGraphLayout } from '../utils/graphLayout';
import { useGraphViewport } from '../hooks/useGraphViewport';
import { GraphControls } from './GraphControls';
import {
  ShieldCheck,
  AlertTriangle,
  ArrowRight,
  Play,
  Pause,
  RotateCcw,
  SkipForward,
  Sparkles,
  ArrowLeft,
} from 'lucide-react';

interface RecoveryPlannerScreenProps {
  dataset: InfrastructureDataset;
  initialFailureId?: string | null;
  onBackToFailureTest?: () => void;
}

type ViewMode = 'planner' | 'simulation';

export const RecoveryPlannerScreen: React.FC<RecoveryPlannerScreenProps> = ({
  dataset,
  initialFailureId,
  onBackToFailureTest,
}) => {
  const [selectedFailureId, setSelectedFailureId] = useState<string>(
    initialFailureId || dataset.assets[0]?.id || ''
  );

  const [viewMode, setViewMode] = useState<ViewMode>('planner');

  // Interactive manual restorations applied in the planner view
  const [appliedRestoredIds, setAppliedRestoredIds] = useState<string[]>([]);

  // Simulation playback state
  const [simStepIndex, setSimStepIndex] = useState<number>(-1); // -1 = initial failure state
  const [isAutoPlaying, setIsAutoPlaying] = useState<boolean>(false);
  const [isFullCityView, setIsFullCityView] = useState<boolean>(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // If initialFailureId changes externally
  useEffect(() => {
    if (initialFailureId) {
      setSelectedFailureId(initialFailureId);
      setAppliedRestoredIds([]);
      setSimStepIndex(-1);
      setIsAutoPlaying(false);
      setViewMode('planner');
    }
  }, [initialFailureId]);

  // Asset Map
  const assetMap = useMemo(() => {
    const map = new Map<string, Asset>();
    for (const a of dataset.assets) map.set(a.id, a);
    return map;
  }, [dataset.assets]);

  // Baseline cascade from the failed asset
  const baselineCascade = useMemo(() => {
    return simulateCascade(dataset, selectedFailureId);
  }, [dataset, selectedFailureId]);

  // Complete multi-step recovery plan (precomputed optimal path)
  const fullPlan = useMemo(() => {
    return computeMultiStepRecoveryPlan(dataset, selectedFailureId);
  }, [dataset, selectedFailureId]);

  // Active cascade reflecting any manually applied restorations
  const activeRestoredSet = useMemo(() => {
    return new Set(appliedRestoredIds);
  }, [appliedRestoredIds]);

  const currentCascade = useMemo(() => {
    return simulateCascadeWithRestorations(
      dataset,
      selectedFailureId,
      activeRestoredSet
    );
  }, [dataset, selectedFailureId, activeRestoredSet]);

  // Live dynamic candidates from the current interactive state
  const liveCandidates = useMemo(() => {
    return evaluateRestorationCandidates(
      dataset,
      selectedFailureId,
      activeRestoredSet,
      currentCascade
    );
  }, [dataset, selectedFailureId, activeRestoredSet, currentCascade]);

  // Top recommendation from live state
  const topCandidate: RestorationCandidate | undefined = liveCandidates[0];

  // Secondary choices
  const secondaryCandidates = useMemo(() => {
    return liveCandidates.slice(1, 4);
  }, [liveCandidates]);

  // Layout for visual simulation graph
  const layoutNodes = useMemo(() => {
    return computeGraphLayout(dataset);
  }, [dataset]);

  // Relevant node IDs for impact auto-fit
  const relevantNodeIds = useMemo(() => {
    const set = new Set<string>();
    set.add(selectedFailureId);
    baselineCascade.affectedNodes.forEach((_, id) => set.add(id));
    return set;
  }, [selectedFailureId, baselineCascade]);

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
    padding: 48,
    minZoom: 0.25,
    maxZoom: 2.5,
    targetMaxZoom: 1.85,
    targetOccupancy: 0.82,
  });

  // Auto-fit when opening simulation
  useEffect(() => {
    if (viewMode === 'simulation') {
      setIsFullCityView(false);
      fitGraph(relevantNodeIds);
    }
  }, [viewMode, fitGraph, relevantNodeIds]);

  // Auto-play timer for simulation mode
  useEffect(() => {
    if (!isAutoPlaying) return;
    if (fullPlan.steps.length === 0) {
      setIsAutoPlaying(false);
      return;
    }

    const timer = setInterval(() => {
      setSimStepIndex((prev) => {
        if (prev >= fullPlan.steps.length - 1) {
          setIsAutoPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, 1100);

    return () => clearInterval(timer);
  }, [isAutoPlaying, fullPlan.steps.length]);

  // Recovered nodes set at current simStepIndex
  const simRecoveredSet = useMemo(() => {
    const set = new Set<string>();
    if (simStepIndex < 0) return set;

    const maxIdx = Math.min(simStepIndex, fullPlan.steps.length - 1);
    for (let i = 0; i <= maxIdx; i++) {
      fullPlan.steps[i].recoveredAssetIds.forEach((id) => set.add(id));
    }
    return set;
  }, [simStepIndex, fullPlan.steps]);

  // Node status in simulation view
  const getSimNodeStatus = (
    assetId: string
  ): 'failed' | 'recovered' | 'affected' | 'not_affected' => {
    if (assetId === selectedFailureId) {
      return 'failed';
    }
    if (simRecoveredSet.has(assetId)) {
      return 'recovered';
    }
    if (baselineCascade.affectedNodes.has(assetId)) {
      return 'affected';
    }
    return 'not_affected';
  };

  const selectedAsset = assetMap.get(selectedFailureId);

  // Apply a candidate to the interactive plan
  const handleApplyRestoration = (assetId: string) => {
    if (!appliedRestoredIds.includes(assetId)) {
      setAppliedRestoredIds([...appliedRestoredIds, assetId]);
    }
  };

  const handleResetApplied = () => {
    setAppliedRestoredIds([]);
  };

  return (
    <div className="w-full h-full flex flex-col bg-slate-950 text-slate-100 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-3 border-b border-slate-800/80 bg-slate-950/90 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3">
          {onBackToFailureTest && (
            <button
              onClick={onBackToFailureTest}
              className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800 cursor-pointer transition-colors"
              title="Back to Failure Test"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}

          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-black text-white tracking-wide uppercase">
                RECOVERY PLANNER
              </h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-cyan-500/10 text-cyan-300 border border-cyan-500/30">
                Restoration Order
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              "What should we restore first?"
            </p>
          </div>
        </div>

        {/* Failed Asset Context Selector */}
        <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs">
          <span className="text-slate-400 font-medium">Failure Scenario:</span>
          <select
            value={selectedFailureId}
            onChange={(e) => {
              setSelectedFailureId(e.target.value);
              setAppliedRestoredIds([]);
              setSimStepIndex(-1);
              setIsAutoPlaying(false);
              setViewMode('planner');
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

      {/* VIEW 1: RECOVERY PLANNER */}
      {viewMode === 'planner' && (
        <div className="flex-1 overflow-y-auto p-4 md:p-6 max-w-4xl w-full mx-auto space-y-4">
          {/* Current Failure Status Bar */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl px-4 py-2.5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-red-400 font-black flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                <span>⚠ {selectedAsset?.name || 'Service'} failed</span>
              </span>
              <span className="hidden sm:inline text-xs text-slate-400">
                • The failure has already happened.
              </span>
            </div>
            <div className="text-xs font-black font-mono text-red-400 bg-red-500/10 border border-red-500/30 px-3 py-1 rounded-lg shrink-0">
              {currentCascade.affectedNodes.size} currently affected
            </div>
          </div>

          {/* If No Improvements Possible */}
          {!fullPlan.hasImprovements || (topCandidate && topCandidate.servicesRecovered <= 0) ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center space-y-2">
              <div className="text-amber-400 font-bold text-sm flex items-center justify-center gap-2">
                <ShieldCheck className="w-5 h-5 text-amber-400" />
                <span>No available restoration improves the current network state.</span>
              </div>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                No downstream dependencies remain restorable without first repairing the root
                failure.
              </p>
            </div>
          ) : (
            <>
              {/* ⭐ RESTORE FIRST — Dominates the Screen */}
              {topCandidate && topCandidate.servicesRecovered > 0 && (
                <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-cyan-950/40 border-2 border-cyan-500/70 rounded-2xl p-5 shadow-2xl shadow-cyan-950/30 space-y-4 relative overflow-hidden">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/40">
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>⭐ RESTORE FIRST</span>
                      </div>
                      <h2 className="text-2xl font-black text-white tracking-wide">
                        {topCandidate.assetName}
                      </h2>
                      <div className="text-xs text-slate-400">
                        Sector: <strong className="text-slate-300">{topCandidate.sector}</strong>
                      </div>
                    </div>

                    <div className="text-right bg-emerald-950/60 border border-emerald-500/40 px-4 py-2.5 rounded-xl">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400/80 block">
                        Could bring back:
                      </span>
                      <span className="text-2xl font-black text-emerald-400 font-mono">
                        {topCandidate.servicesRecovered}{' '}
                        <span className="text-xs font-normal">
                          {topCandidate.servicesRecovered === 1 ? 'service' : 'services'}
                        </span>
                      </span>
                    </div>
                  </div>

                  {/* Why this first? */}
                  <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 text-xs space-y-1">
                    <div className="text-[10px] font-black uppercase tracking-wider text-cyan-400">
                      Why?
                    </div>
                    <p className="text-slate-300 leading-relaxed font-medium">
                      {topCandidate.explanation}
                    </p>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-slate-800/80">
                    <button
                      onClick={() => handleApplyRestoration(topCandidate.assetId)}
                      className="px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-slate-950 font-black text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-cyan-950/40 cursor-pointer active:scale-98 flex items-center gap-1.5 transition-all"
                    >
                      <span>RESTORE THIS →</span>
                    </button>

                    <button
                      onClick={() => {
                        setViewMode('simulation');
                        setSimStepIndex(-1);
                        setIsAutoPlaying(false);
                      }}
                      className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-cyan-300 font-black text-xs uppercase tracking-wider rounded-xl border border-slate-700 cursor-pointer transition-colors flex items-center gap-2"
                    >
                      <Play className="w-3.5 h-3.5 fill-cyan-400" />
                      <span>SIMULATE THIS RECOVERY PLAN</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Secondary Choices */}
              {secondaryCandidates.length > 0 && (
                <div>
                  <div className="text-[11px] font-black uppercase tracking-wider text-slate-400 mb-2">
                    SECONDARY RESTORATION CHOICES
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    {secondaryCandidates.map((cand, idx) => (
                      <div
                        key={cand.assetId}
                        onClick={() => handleApplyRestoration(cand.assetId)}
                        className="bg-slate-900/80 border border-slate-800 hover:border-slate-700 rounded-xl p-3 flex items-center justify-between gap-2 cursor-pointer transition-all hover:bg-slate-900"
                        title="Click to restore this candidate"
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-white truncate">
                            {idx + 2}. {cand.assetName}
                          </div>
                          <div className="text-[10px] text-slate-400 truncate">
                            {cand.sector}
                          </div>
                        </div>
                        <div className="text-xs font-black font-mono text-emerald-400 shrink-0">
                          +{cand.servicesRecovered} {cand.servicesRecovered === 1 ? 'service' : 'services'}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* MULTI-STEP RECOVERY PLAN */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-3">
                <div className="flex items-center justify-between gap-3 border-b border-slate-800/80 pb-2.5">
                  <div>
                    <div className="text-xs font-black uppercase tracking-wider text-white">
                      RECOVERY PLAN (OPTIMAL RESTORATION SEQUENCE)
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Calculated iteratively by evaluating network benefits at each step.
                    </div>
                  </div>

                  {appliedRestoredIds.length > 0 && (
                    <button
                      onClick={handleResetApplied}
                      className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-[10px] rounded-lg border border-slate-700 cursor-pointer flex items-center gap-1"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Reset Live View</span>
                    </button>
                  )}
                </div>

                <div className="space-y-2">
                  {fullPlan.steps.map((step) => {
                    const isApplied = appliedRestoredIds.includes(step.assetId);

                    return (
                      <div
                        key={step.stepNumber}
                        className={`p-3 rounded-xl border flex flex-wrap items-center justify-between gap-3 transition-all ${
                          isApplied
                            ? 'bg-emerald-950/30 border-emerald-500/50'
                            : 'bg-slate-950/60 border-slate-800/80'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs ${
                              isApplied
                                ? 'bg-emerald-500 text-slate-950'
                                : 'bg-slate-800 text-slate-300'
                            }`}
                          >
                            {isApplied ? '✓' : step.stepNumber}
                          </div>

                          <div>
                            <div className="text-xs font-bold text-white flex items-center gap-2">
                              <span>{step.assetName}</span>
                              <span className="text-[10px] font-normal text-slate-400">
                                ({step.sector})
                              </span>
                              {isApplied && (
                                <span className="text-[9px] font-black uppercase tracking-wider text-emerald-400 bg-emerald-500/20 px-1.5 py-0.2 rounded">
                                  Restored
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-400">
                              {step.explanation}
                            </div>
                          </div>
                        </div>

                        <div className="text-right">
                          <span className="text-xs font-bold font-mono text-emerald-400">
                            +{step.servicesRecovered} recovered
                          </span>
                          <div className="text-[10px] text-slate-500">
                            {step.remainingAffectedCount} still affected
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* VIEW 2: RECOVERY SIMULATOR GRAPH VIEW */}
      {viewMode === 'simulation' && (
        <div className="flex-1 w-full h-full relative overflow-hidden flex flex-col">
          {/* Subheader */}
          <div className="px-6 py-3 border-b border-slate-800 bg-slate-900/95 flex flex-wrap items-center justify-between gap-3 shrink-0 z-10">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-black text-cyan-400 uppercase tracking-wider">
                  CITY RESTORATION SIMULATOR
                </h2>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 uppercase">
                  {fullPlan.steps.length} Steps
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Visualizing restoration sequence for {selectedAsset?.name}
              </p>
            </div>

            {/* Step status bar */}
            <div className="flex items-center gap-3 bg-slate-950/90 px-3.5 py-1.5 rounded-xl border border-slate-800 text-xs">
              <div>
                <span className="text-red-400 font-bold font-mono">
                  {baselineCascade.affectedNodes.size}
                </span>{' '}
                <span className="text-slate-400 text-[10px]">Affected Initially</span>
              </div>
              <span className="text-slate-600">→</span>
              <div className="text-emerald-400 font-black">
                ✓ {simRecoveredSet.size} SERVICES RESTORED
              </div>
            </div>

            {/* Back Button */}
            <button
              onClick={() => {
                setIsAutoPlaying(false);
                setViewMode('planner');
              }}
              className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs rounded-xl border border-slate-700 cursor-pointer transition-colors"
            >
              Back to Plan
            </button>
          </div>

          {/* Stepper Toolbar */}
          <div className="px-6 py-2.5 bg-slate-900/80 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-3 shrink-0 z-10">
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  if (simStepIndex >= fullPlan.steps.length - 1) {
                    setSimStepIndex(-1);
                  }
                  setIsAutoPlaying(!isAutoPlaying);
                }}
                className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs rounded-xl shadow cursor-pointer transition-all flex items-center gap-1.5"
              >
                {isAutoPlaying ? (
                  <>
                    <Pause className="w-3.5 h-3.5 fill-slate-950" />
                    <span>PAUSE</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 fill-slate-950" />
                    <span>START RECOVERY</span>
                  </>
                )}
              </button>

              <button
                onClick={() => {
                  setIsAutoPlaying(false);
                  setSimStepIndex((prev) => Math.min(prev + 1, fullPlan.steps.length - 1));
                }}
                disabled={simStepIndex >= fullPlan.steps.length - 1}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-slate-200 font-bold text-xs rounded-xl border border-slate-700 cursor-pointer transition-colors flex items-center gap-1"
              >
                <span>NEXT STEP</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={() => {
                  setIsAutoPlaying(false);
                  setSimStepIndex(fullPlan.steps.length - 1);
                }}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl border border-slate-700 cursor-pointer transition-colors flex items-center gap-1"
              >
                <SkipForward className="w-3.5 h-3.5" />
                <span>SHOW COMPLETE RECOVERY</span>
              </button>

              <button
                onClick={() => {
                  setIsAutoPlaying(false);
                  setSimStepIndex(-1);
                }}
                className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white font-bold text-xs rounded-xl border border-slate-800 cursor-pointer transition-colors flex items-center gap-1"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>RESET</span>
              </button>
            </div>

            {/* Current Phase description */}
            <div className="flex items-center gap-4 text-xs">
              <div className="text-slate-300 font-medium">
                {simStepIndex < 0 ? (
                  <span className="text-amber-400 font-bold">
                    Initial Failure: {selectedAsset?.name} ({baselineCascade.affectedNodes.size} affected)
                  </span>
                ) : simStepIndex >= fullPlan.steps.length - 1 ? (
                  <span className="text-emerald-400 font-bold">
                    ✓ Plan Complete: {simRecoveredSet.size} services operational
                  </span>
                ) : (
                  <span className="text-cyan-300 font-bold">
                    Step {simStepIndex + 1} of {fullPlan.steps.length}: Restoring{' '}
                    {fullPlan.steps[simStepIndex].assetName} (+
                    {fullPlan.steps[simStepIndex].servicesRecovered})
                  </span>
                )}
              </div>

              {/* Status Colors: Red = Failed, Orange = Affected, Green = Recovered, Slate = Not Affected */}
              <div className="hidden sm:flex items-center gap-3 bg-slate-950/80 px-2.5 py-1 rounded-lg border border-slate-800 text-[11px]">
                <span className="flex items-center gap-1 text-red-400 font-bold">
                  <span className="w-2 h-2 rounded-full bg-red-500" />
                  <span>Failed</span>
                </span>
                <span className="flex items-center gap-1 text-orange-400 font-bold">
                  <span className="w-2 h-2 rounded-full bg-orange-500" />
                  <span>Affected</span>
                </span>
                <span className="flex items-center gap-1 text-emerald-400 font-bold">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span>Restored</span>
                </span>
                <span className="flex items-center gap-1 text-slate-400 font-bold">
                  <span className="w-2 h-2 rounded-full bg-slate-600" />
                  <span>Not Affected</span>
                </span>
              </div>

              <button
                onClick={() => {
                  const next = !isFullCityView;
                  setIsFullCityView(next);
                  fitGraph(next ? null : relevantNodeIds);
                }}
                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-cyan-300 font-bold text-[11px] rounded-lg border border-slate-700 cursor-pointer transition-colors"
              >
                {isFullCityView ? 'FOCUS IMPACT' : 'VIEW FULL CITY'}
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
                  id="rp-arrow-dim"
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
                  id="rp-arrow-affected"
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
                  id="rp-arrow-recovered"
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

                  const tgtStatus = getSimNodeStatus(dep.target);

                  let strokeColor = '#1e293b';
                  let markerEnd = 'url(#rp-arrow-dim)';
                  let strokeWidth = 1.2;

                  if (tgtStatus === 'recovered') {
                    strokeColor = '#10b981';
                    markerEnd = 'url(#rp-arrow-recovered)';
                    strokeWidth = 2;
                  } else if (tgtStatus === 'affected' || tgtStatus === 'failed') {
                    strokeColor = '#ea580c';
                    markerEnd = 'url(#rp-arrow-affected)';
                    strokeWidth = 1.8;
                  }

                  return (
                    <path
                      key={`rp-dep-${idx}`}
                      d={pathD}
                      fill="none"
                      stroke={strokeColor}
                      strokeWidth={strokeWidth}
                      markerEnd={markerEnd}
                    />
                  );
                })}

                {/* Nodes */}
                {Array.from(layoutNodes.values()).map((node) => {
                  const { asset } = node;
                  const status = getSimNodeStatus(asset.id);

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
                  } else if (status === 'recovered') {
                    bgColor = '#064e3b';
                    borderColor = '#10b981';
                    textColor = '#d1fae5';
                    badgeText = 'RESTORED';
                    badgeBg = 'bg-emerald-500 text-slate-950 font-black';
                  } else if (status === 'affected') {
                    bgColor = '#431407';
                    borderColor = '#ea580c';
                    textColor = '#ffedd5';
                    badgeText = 'AFFECTED';
                    badgeBg = 'bg-orange-600 text-white font-bold';
                  }

                  return (
                    <g
                      key={asset.id}
                      transform={`translate(${node.x}, ${node.y})`}
                      className="cursor-pointer group"
                    >
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
                        className="pointer-events-none"
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
                        className="pointer-events-none"
                      >
                        {asset.sector}
                      </text>

                      {/* Status Badge */}
                      <foreignObject
                        x={node.width - (status === 'not_affected' ? 95 : 82)}
                        y={8}
                        width={status === 'not_affected' ? 90 : 76}
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

            {/* Reusable Graph Controls */}
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
