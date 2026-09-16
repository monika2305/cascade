import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
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
import {
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  ZoomIn,
  ZoomOut,
  Maximize2,
  RotateCcw,
  Network,
  ArrowRight,
} from 'lucide-react';

interface ActionLabScreenProps {
  dataset: InfrastructureDataset;
  initialFailureId?: string | null;
}

export const ActionLabScreen: React.FC<ActionLabScreenProps> = ({
  dataset,
  initialFailureId,
}) => {
  const [selectedFailureId, setSelectedFailureId] = useState<string>(
    initialFailureId || dataset.assets[0]?.id || ''
  );

  // If initialFailureId changes externally
  useEffect(() => {
    if (initialFailureId) {
      setSelectedFailureId(initialFailureId);
      setResult(null);
      setShowAfterGraph(false);
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
    setShowAfterGraph(false);
  }, [availableFixes, recommendationData.recommendedFixIds]);

  const [result, setResult] = useState<InterventionResult | null>(null);
  const [showAfterGraph, setShowAfterGraph] = useState<boolean>(false);

  // Pan & Zoom for the After Graph
  const [zoom, setZoom] = useState<number>(0.9);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const panStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Layout for after-graph
  const layoutNodes = useMemo(() => {
    if (!result) return computeGraphLayout(dataset);
    return computeGraphLayout(result.modifiedDataset);
  }, [dataset, result]);

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

  // Readable Initial / Reset View
  const resetToReadableGraph = useCallback(() => {
    if (!containerRef.current || layoutNodes.size === 0) return;
    const rect = containerRef.current.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const bounds = getGraphBounds();
    const readableZoom = 0.88;
    setZoom(readableZoom);

    const failedNode = layoutNodes.get(selectedFailureId);
    const targetX = failedNode ? failedNode.x + failedNode.width / 2 : bounds.cx;
    const targetY = failedNode ? failedNode.y + failedNode.height / 2 : bounds.cy;

    setPan({
      x: rect.width / 2 - targetX * readableZoom,
      y: rect.height / 2 - targetY * readableZoom,
    });
  }, [layoutNodes, getGraphBounds, selectedFailureId]);

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
    if (showAfterGraph) {
      resetToReadableGraph();
    }
  }, [showAfterGraph, resetToReadableGraph]);

  const activeFix = availableFixes.find((f) => f.id === selectedFixId);

  const handleTestFix = () => {
    if (!activeFix) return;
    const res = runIntervention(dataset, selectedFailureId, activeFix.action);
    setResult(res);
    setShowAfterGraph(false);
  };

  // Node visual state in after graph: RED = still affected, GREEN = protected, DIM = unaffected
  const getAfterNodeStatus = (assetId: string) => {
    if (!result) return 'unaffected';
    if (assetId === result.initialFailureId) return 'failed';
    if (result.savedAssetIds.includes(assetId)) return 'protected';
    if (result.afterCascade.affectedNodes.has(assetId)) return 'still_affected';
    return 'unaffected';
  };

  const selectedAsset = assetMap.get(selectedFailureId);

  return (
    <div className="w-full h-full flex flex-col bg-slate-950 text-slate-100 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-800/80 bg-slate-950/90 flex flex-wrap items-center justify-between gap-4 shrink-0">
        <div>
          <h1 className="text-xl font-black text-white tracking-wide uppercase">
            ACTION LAB
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
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
              setShowAfterGraph(false);
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

      {/* Main Area */}
      {!showAfterGraph ? (
        <div className="flex-1 overflow-y-auto p-6 max-w-3xl w-full mx-auto space-y-6">
          {/* CURRENT PROBLEM */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                <span>⚠ CURRENT PROBLEM</span>
              </div>
              <div className="text-base font-bold text-white">
                <span className="text-red-400 font-black">
                  {selectedAsset?.name || 'Service'}
                </span>{' '}
                failed.
              </div>
              <div className="text-xs text-slate-400 mt-0.5">
                {baselineCascade.affectedNodes.size}{' '}
                {baselineCascade.affectedNodes.size === 1
                  ? 'service is affected.'
                  : 'services are affected.'}
              </div>
            </div>
            <div className="text-sm font-black font-mono text-amber-400 bg-amber-500/10 border border-amber-500/30 px-3.5 py-1.5 rounded-xl">
              {baselineCascade.affectedNodes.size} affected
            </div>
          </div>

          {/* CHOOSE A FIX */}
          <div>
            <div className="flex items-center justify-between gap-3 mb-3">
              <div className="text-xs font-black uppercase tracking-wider text-slate-400">
                CHOOSE A FIX
              </div>
              {recommendationData.hasTie && (
                <div className="text-[11px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2.5 py-0.5 rounded-full">
                  Both give the same improvement.
                </div>
              )}
            </div>

            {recommendationData.evaluatedFixes.length > 0 ? (
              <div className="space-y-3">
                {recommendationData.evaluatedFixes.map((item) => {
                  const isSelected = selectedFixId === item.fix.id;

                  return (
                    <div
                      key={item.fix.id}
                      onClick={() => {
                        setSelectedFixId(item.fix.id);
                        setResult(null);
                      }}
                      className={`p-5 rounded-2xl border-2 transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-cyan-500/10 border-cyan-400 shadow-xl shadow-cyan-950/30'
                          : item.isRecommended
                          ? 'bg-slate-900/90 border-amber-500/60 hover:border-amber-400'
                          : 'bg-slate-900/70 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3.5 flex-1 min-w-0">
                          <span className="text-2xl shrink-0 mt-0.5">{item.fix.icon}</span>

                          <div className="flex-1 min-w-0 space-y-1.5">
                            <div className="flex flex-wrap items-center gap-2">
                              <h2 className="text-sm font-black text-white uppercase tracking-wide">
                                {item.fix.title}
                              </h2>
                              {item.isRecommended && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/40">
                                  ⭐ RECOMMENDED
                                </span>
                              )}
                            </div>

                            {/* One simple sentence */}
                            <p className="text-xs text-slate-300 leading-relaxed">
                              {item.fix.description}
                            </p>

                            {/* Protects: <service/services> */}
                            <div className="text-xs text-slate-400">
                              <span className="text-slate-500 font-bold text-[11px] mr-1">Protects:</span>
                              <span className="text-slate-300">{item.fix.protects}</span>
                            </div>

                            {/* Protected count info */}
                            {item.servicesProtected > 0 ? (
                              <div className="text-xs font-bold text-emerald-400 pt-0.5">
                                {item.servicesProtected} {item.servicesProtected === 1 ? 'service protected' : 'services protected'}
                              </div>
                            ) : (
                              <div className="text-xs font-medium text-slate-500 pt-0.5">
                                0 services protected
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Radio selection */}
                        <div className="shrink-0 mt-1">
                          <div
                            className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                              isSelected
                                ? 'border-cyan-400 bg-cyan-500'
                                : 'border-slate-600 bg-slate-900'
                            }`}
                          >
                            {isSelected && <div className="w-2 h-2 rounded-full bg-slate-950" />}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-6 rounded-2xl bg-slate-900/50 border border-slate-800 text-center text-slate-400 text-xs">
                No usable backup option was found in this city data.
              </div>
            )}

            {recommendationData.maxProtected <= 0 && recommendationData.evaluatedFixes.length > 0 && (
              <div className="mt-3 p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-center text-slate-400 text-xs">
                No available fix reduces the impact in this scenario.
              </div>
            )}
          </div>

          {/* Large Action Button: TEST THIS FIX */}
          {availableFixes.length > 0 && (
            <button
              onClick={handleTestFix}
              disabled={!selectedFixId}
              className="w-full py-4 bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 font-black text-sm uppercase tracking-wider rounded-2xl shadow-xl shadow-cyan-950/40 transition-all cursor-pointer active:scale-98 flex items-center justify-center gap-2"
            >
              <span>TEST THIS FIX</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          )}

          {/* Results: BEFORE vs AFTER */}
          {result && activeFix && (
            <div className="p-6 bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl space-y-6 animate-fade-in">
              {/* Large obvious comparison */}
              <div className="grid grid-cols-2 gap-4 text-center py-5 border-y border-slate-800">
                <div>
                  <div className="text-xs font-black text-red-400 uppercase tracking-wider mb-1">
                    BEFORE
                  </div>
                  <div className="text-5xl font-black text-red-400 font-mono">
                    {result.beforeAffectedCount}
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    {result.beforeAffectedCount === 1 ? 'Service Affected' : 'Services Affected'}
                  </div>
                </div>

                <div className="border-l border-slate-800">
                  <div className="text-xs font-black text-emerald-400 uppercase tracking-wider mb-1">
                    AFTER
                  </div>
                  <div className="text-5xl font-black text-emerald-400 font-mono">
                    {result.afterAffectedCount}
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    {result.afterAffectedCount === 1 ? 'Service Affected' : 'Services Affected'}
                  </div>
                </div>
              </div>

              {/* Status outcome */}
              {result.savedAssetsCount > 0 ? (
                <div className="p-5 rounded-2xl bg-emerald-950/40 border border-emerald-500/50 text-center space-y-4">
                  <div className="text-lg font-black text-emerald-400 flex items-center justify-center gap-2">
                    <CheckCircle2 className="w-6 h-6" />
                    <span>✓ {result.savedAssetsCount} {result.savedAssetsCount === 1 ? 'SERVICE' : 'SERVICES'} PROTECTED</span>
                  </div>

                  {/* WHY DID THIS HELP? */}
                  <div className="pt-3 border-t border-emerald-500/30 text-left">
                    <div className="text-[10px] font-black uppercase tracking-wider text-emerald-400 mb-1">
                      WHY DID THIS HELP?
                    </div>
                    <p className="text-xs text-emerald-200/90 leading-relaxed">
                      {getInterventionExplanation(dataset, result, activeFix)}
                    </p>
                  </div>

                  {/* VIEW WHAT CHANGED */}
                  <button
                    onClick={() => setShowAfterGraph(true)}
                    className="px-6 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs uppercase tracking-wider rounded-xl shadow-md cursor-pointer transition-all flex items-center justify-center gap-2 mx-auto"
                  >
                    <Network className="w-4 h-4" />
                    <span>VIEW WHAT CHANGED</span>
                  </button>
                </div>
              ) : (
                <div className="p-5 rounded-2xl bg-slate-800/60 border border-slate-700/60 text-center space-y-4">
                  <div className="text-sm font-bold text-slate-300 flex items-center justify-center gap-2">
                    <AlertCircle className="w-5 h-5 text-amber-400" />
                    <span>No services were protected by this fix.</span>
                  </div>
                  <div className="text-xs text-slate-400 text-center">
                    Try another available fix.
                  </div>

                  {/* WHY DID THIS HELP? */}
                  <div className="pt-3 border-t border-slate-700/60 text-left">
                    <div className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
                      WHY DID THIS HELP?
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      {getInterventionExplanation(dataset, result, activeFix)}
                    </p>
                  </div>

                  {/* VIEW WHAT CHANGED */}
                  <button
                    onClick={() => setShowAfterGraph(true)}
                    className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs uppercase tracking-wider rounded-xl border border-slate-700 cursor-pointer transition-colors flex items-center justify-center gap-1.5 mx-auto"
                  >
                    <Network className="w-3.5 h-3.5" />
                    <span>VIEW WHAT CHANGED</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        /* Visual Graph View: RED = still affected, GREEN = protected, DIM = unaffected */
        <div className="flex-1 w-full h-full relative overflow-hidden flex flex-col">
          {/* Subheader bar */}
          <div className="px-6 py-3 border-b border-slate-800 bg-slate-900/90 flex items-center justify-between text-xs shrink-0 z-10">
            <div className="flex items-center gap-3">
              <span className="font-black text-emerald-400 uppercase tracking-wider">
                NETWORK COMPARISON
              </span>
              <span className="text-slate-400 font-medium">
                🔴 Still Affected • 🟢 Protected by Fix • ⬛ Unaffected
              </span>
            </div>

            <button
              onClick={() => setShowAfterGraph(false)}
              className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl cursor-pointer transition-colors"
            >
              Back to Actions
            </button>
          </div>

          <div
            ref={containerRef}
            onMouseDown={(e) => {
              if (e.button !== 0) return;
              setIsDragging(true);
              dragStartRef.current = { x: e.clientX, y: e.clientY };
              panStartRef.current = { ...pan };
            }}
            onMouseMove={(e) => {
              if (!isDragging) return;
              const dx = e.clientX - dragStartRef.current.x;
              const dy = e.clientY - dragStartRef.current.y;
              setPan({
                x: panStartRef.current.x + dx,
                y: panStartRef.current.y + dy,
              });
            }}
            onMouseUp={() => setIsDragging(false)}
            onMouseLeave={() => setIsDragging(false)}
            onWheel={(e) => {
              e.preventDefault();
              const zoomFactor = e.deltaY < 0 ? 1.12 : 0.89;
              setZoom((prev) => Math.max(0.3, Math.min(2.5, +(prev * zoomFactor).toFixed(2))));
            }}
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
                  <path d="M 0 1 L 10 5 L 0 9 z" fill="#f97316" />
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
                {(result?.modifiedDataset || dataset).dependencies.map((dep, idx) => {
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

                  const tgtStatus = getAfterNodeStatus(dep.target);
                  let strokeColor = '#1e293b';
                  let markerEnd = 'url(#after-arrow-dim)';
                  let strokeWidth = 1;

                  if (tgtStatus === 'protected') {
                    strokeColor = '#10b981';
                    markerEnd = 'url(#after-arrow-protected)';
                    strokeWidth = 2;
                  } else if (tgtStatus === 'still_affected' || tgtStatus === 'failed') {
                    strokeColor = '#f97316';
                    markerEnd = 'url(#after-arrow-affected)';
                    strokeWidth = 1.8;
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
                  const status = getAfterNodeStatus(asset.id);

                  let bgColor = '#0f172a';
                  let borderColor = '#1e293b';
                  let textColor = '#475569';
                  let badgeText = '';
                  let badgeBg = '';

                  if (status === 'failed') {
                    bgColor = '#450a0a';
                    borderColor = '#ef4444';
                    textColor = '#fee2e2';
                    badgeText = 'FAILED';
                    badgeBg = 'bg-red-500 text-white';
                  } else if (status === 'protected') {
                    bgColor = '#064e3b';
                    borderColor = '#10b981';
                    textColor = '#d1fae5';
                    badgeText = 'SAVED';
                    badgeBg = 'bg-emerald-500 text-slate-950 font-black';
                  } else if (status === 'still_affected') {
                    bgColor = '#431407';
                    borderColor = '#ea580c';
                    textColor = '#ffedd5';
                    badgeText = 'AFFECTED';
                    badgeBg = 'bg-orange-500 text-white';
                  }

                  return (
                    <g
                      key={asset.id}
                      transform={`translate(${node.x}, ${node.y})`}
                      className="cursor-pointer group"
                    >
                      {status === 'protected' && (
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
                        strokeWidth={status !== 'unaffected' ? 2 : 1}
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
                        fill={status !== 'unaffected' ? '#94a3b8' : '#334155'}
                        fontSize="10"
                        fontWeight="500"
                        className="pointer-events-none"
                      >
                        {asset.sector}
                      </text>

                      {badgeText && (
                        <foreignObject
                          x={node.width - 76}
                          y={8}
                          width={68}
                          height={20}
                        >
                          <div
                            className={`text-[8px] font-black px-1.5 py-0.5 rounded text-center tracking-wider uppercase ${badgeBg}`}
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
          </div>
        </div>
      )}
    </div>
  );
};
