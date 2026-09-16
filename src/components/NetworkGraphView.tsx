import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import type { InfrastructureDataset, UserRole, Asset } from '../types/infrastructure';
import { ROLES } from '../types/roles';
import { getSectorConfig } from '../utils/sectorConfig';
import { simulateCascade, getWhyPath, type CascadeResult, type WhyStep } from '../utils/cascade';
import { findWeakPoints, type InterventionResult } from '../utils/analysis';
import { WeakPointModal } from './WeakPointModal';
import { ActionLabModal } from './ActionLabModal';
import {
  ArrowLeft,
  RotateCcw,
  ZoomIn,
  ZoomOut,
  Maximize2,
  AlertTriangle,
  Play,
  Pause,
  FastForward,
  X,
  Eye,
  Info,
  ShieldAlert,
  FlaskConical,
  ShieldCheck,
} from 'lucide-react';

interface NetworkGraphViewProps {
  dataset: InfrastructureDataset;
  role: UserRole;
  onBackToPreview: () => void;
  onResetAll: () => void;
}

interface LayoutNode {
  asset: Asset;
  x: number;
  y: number;
  width: number;
  height: number;
  level: number;
  inDegree: number;
  outDegree: number;
}

const NODE_WIDTH = 190;
const NODE_HEIGHT = 56;
const LAYER_X_GAP = 280;
const LAYER_Y_GAP = 90;

export const NetworkGraphView: React.FC<NetworkGraphViewProps> = ({
  dataset,
  role,
  onBackToPreview,
  onResetAll,
}) => {
  const currentRole = ROLES.find((r) => r.id === role) || ROLES[0];

  // Pipeline logging
  useEffect(() => {
    console.log('[PIPELINE] dataset.dependencies.length received by NetworkGraphView:', dataset.dependencies.length);
  }, [dataset]);

  // View state
  const [isFullNetwork, setIsFullNetwork] = useState<boolean>(false);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [hoveredAssetId, setHoveredAssetId] = useState<string | null>(null);
  const [isUnconnectedDrawerOpen, setIsUnconnectedDrawerOpen] = useState<boolean>(false);
  const [unconnectedFilter, setUnconnectedFilter] = useState<string>('');

  // Feature modals state
  const [isWeakPointModalOpen, setIsWeakPointModalOpen] = useState<boolean>(false);
  const [isActionLabModalOpen, setIsActionLabModalOpen] = useState<boolean>(false);
  const [activeIntervention, setActiveIntervention] = useState<InterventionResult | null>(null);
  const [showTechnicalDetails, setShowTechnicalDetails] = useState<boolean>(false);

  // Pan & Zoom
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 60, y: 60 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const panStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const svgContainerRef = useRef<HTMLDivElement | null>(null);

  // Cascade Simulation State
  const [cascadeResult, setCascadeResult] = useState<CascadeResult | null>(null);
  const [currentAnimatedStep, setCurrentAnimatedStep] = useState<number>(0);
  const [isPlayingAnimation, setIsPlayingAnimation] = useState<boolean>(false);
  const animationTimerRef = useRef<any>(null);

  // Active dataset reflects intervention if applied
  const activeDataset = useMemo(() => {
    return activeIntervention ? activeIntervention.modifiedDataset : dataset;
  }, [activeIntervention, dataset]);

  // Fast asset lookup
  const assetMap = useMemo(() => {
    const map = new Map<string, Asset>();
    for (const a of activeDataset.assets) {
      map.set(a.id, a);
    }
    return map;
  }, [activeDataset.assets]);

  // Compute degrees & categorize connected vs unconnected
  const { inDegreeMap, outDegreeMap, connectedAssets, unconnectedAssets } = useMemo(() => {
    const inDeg = new Map<string, number>();
    const outDeg = new Map<string, number>();

    for (const a of activeDataset.assets) {
      inDeg.set(a.id, 0);
      outDeg.set(a.id, 0);
    }

    for (const dep of activeDataset.dependencies) {
      if (outDeg.has(dep.source)) {
        outDeg.set(dep.source, (outDeg.get(dep.source) || 0) + 1);
      }
      if (inDeg.has(dep.target)) {
        inDeg.set(dep.target, (inDeg.get(dep.target) || 0) + 1);
      }
    }

    const connected: Asset[] = [];
    const unconnected: Asset[] = [];

    for (const a of activeDataset.assets) {
      const totalLinks = (inDeg.get(a.id) || 0) + (outDeg.get(a.id) || 0);
      if (totalLinks > 0) {
        connected.push(a);
      } else {
        unconnected.push(a);
      }
    }

    return {
      inDegreeMap: inDeg,
      outDegreeMap: outDeg,
      connectedAssets: connected,
      unconnectedAssets: unconnected,
    };
  }, [activeDataset.assets, activeDataset.dependencies]);

  // Nodes to position on primary canvas based on view mode
  const activeCanvasAssets = useMemo(() => {
    if (isFullNetwork || unconnectedAssets.length === 0) {
      return activeDataset.assets;
    }
    return connectedAssets.length > 0 ? connectedAssets : activeDataset.assets;
  }, [isFullNetwork, activeDataset.assets, connectedAssets, unconnectedAssets]);

  // Deterministic Topological Layered DAG Layout
  const layoutNodes = useMemo(() => {
    const nodes = activeCanvasAssets;
    const nodeIds = new Set(nodes.map((n) => n.id));

    // Filter dependencies whose source and target are both in active canvas
    const activeDeps = activeDataset.dependencies.filter(
      (d) => nodeIds.has(d.source) && nodeIds.has(d.target)
    );

    // Compute topological rank / level for each node
    const inDeg = new Map<string, number>();
    const outgoing = new Map<string, string[]>();

    for (const n of nodes) {
      inDeg.set(n.id, 0);
      outgoing.set(n.id, []);
    }

    for (const d of activeDeps) {
      inDeg.set(d.target, (inDeg.get(d.target) || 0) + 1);
      outgoing.get(d.source)?.push(d.target);
    }

    const levels = new Map<string, number>();
    const queue: string[] = [];
    for (const n of nodes) {
      if ((inDeg.get(n.id) || 0) === 0) {
        levels.set(n.id, 0);
        queue.push(n.id);
      }
    }

    if (queue.length === 0 && nodes.length > 0) {
      levels.set(nodes[0].id, 0);
      queue.push(nodes[0].id);
    }

    const visited = new Set<string>();
    while (queue.length > 0) {
      const curr = queue.shift()!;
      if (visited.has(curr)) continue;
      visited.add(curr);

      const currLvl = levels.get(curr) || 0;
      const targets = outgoing.get(curr) || [];

      for (const t of targets) {
        const existingLvl = levels.get(t) ?? -1;
        if (currLvl + 1 > existingLvl) {
          levels.set(t, currLvl + 1);
        }
        if (!visited.has(t)) {
          queue.push(t);
        }
      }
    }

    for (const n of nodes) {
      if (!levels.has(n.id)) {
        levels.set(n.id, 0);
      }
    }

    const levelBuckets = new Map<number, Asset[]>();
    for (const n of nodes) {
      const lvl = levels.get(n.id) || 0;
      const bucket = levelBuckets.get(lvl) || [];
      bucket.push(n);
      levelBuckets.set(lvl, bucket);
    }

    const sortedLevels = Array.from(levelBuckets.keys()).sort((a, b) => a - b);
    const layoutMap = new Map<string, LayoutNode>();

    sortedLevels.forEach((lvl, lvlIdx) => {
      const bucket = levelBuckets.get(lvl) || [];
      const totalInLvl = bucket.length;
      const startY = Math.max(40, (8 - totalInLvl) * 30);

      bucket.forEach((asset, rowIdx) => {
        layoutMap.set(asset.id, {
          asset,
          x: 60 + lvlIdx * LAYER_X_GAP,
          y: startY + rowIdx * LAYER_Y_GAP,
          width: NODE_WIDTH,
          height: NODE_HEIGHT,
          level: lvl,
          inDegree: inDegreeMap.get(asset.id) || 0,
          outDegree: outDegreeMap.get(asset.id) || 0,
        });
      });
    });

    return layoutMap;
  }, [activeCanvasAssets, activeDataset.dependencies, inDegreeMap, outDegreeMap]);

  // Auto-fit initial graph into view
  const handleFitView = useCallback(() => {
    if (!svgContainerRef.current || layoutNodes.size === 0) return;
    const rect = svgContainerRef.current.getBoundingClientRect();

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

    const graphWidth = maxX - minX + 120;
    const graphHeight = maxY - minY + 120;

    const scaleX = (rect.width - 60) / graphWidth;
    const scaleY = (rect.height - 60) / graphHeight;
    const newZoom = Math.max(0.35, Math.min(1.2, Math.min(scaleX, scaleY)));

    setZoom(newZoom);
    setPan({
      x: (rect.width - graphWidth * newZoom) / 2 - minX * newZoom + 40,
      y: (rect.height - graphHeight * newZoom) / 2 - minY * newZoom + 40,
    });
  }, [layoutNodes]);

  useEffect(() => {
    const timer = setTimeout(handleFitView, 120);
    return () => clearTimeout(timer);
  }, [handleFitView]);

  // Focus and center an asset on the graph
  const handleFocusAsset = useCallback((assetId: string) => {
    setSelectedAssetId(assetId);
    const node = layoutNodes.get(assetId);
    if (node && svgContainerRef.current) {
      const rect = svgContainerRef.current.getBoundingClientRect();
      setPan({
        x: rect.width / 2 - (node.x + node.width / 2) * zoom,
        y: rect.height / 2 - (node.y + node.height / 2) * zoom,
      });
    }
  }, [layoutNodes, zoom]);

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

  // Wheel zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.12 : 0.89;
    setZoom((prev) => Math.max(0.25, Math.min(2.5, prev * zoomFactor)));
  };

  // Trigger cascade simulation
  const handleRunCascade = useCallback((assetId: string) => {
    const result = simulateCascade(activeDataset, assetId);
    setCascadeResult(result);
    setCurrentAnimatedStep(0);
    setIsPlayingAnimation(true);

    if (animationTimerRef.current) clearInterval(animationTimerRef.current);
    let step = 0;
    const maxSteps = result.totalSteps;

    animationTimerRef.current = setInterval(() => {
      step += 1;
      if (step <= maxSteps) {
        setCurrentAnimatedStep(step);
      } else {
        clearInterval(animationTimerRef.current);
        setIsPlayingAnimation(false);
      }
    }, 600);
  }, [activeDataset]);

  // Pause / Resume animation
  const handleTogglePlayPause = () => {
    if (!cascadeResult) return;
    if (isPlayingAnimation) {
      clearInterval(animationTimerRef.current);
      setIsPlayingAnimation(false);
    } else {
      setIsPlayingAnimation(true);
      if (currentAnimatedStep >= cascadeResult.totalSteps) {
        setCurrentAnimatedStep(0);
      }
      let step = currentAnimatedStep;
      animationTimerRef.current = setInterval(() => {
        step += 1;
        if (step <= cascadeResult.totalSteps) {
          setCurrentAnimatedStep(step);
        } else {
          clearInterval(animationTimerRef.current);
          setIsPlayingAnimation(false);
        }
      }, 600);
    }
  };

  const handleSkipToEnd = () => {
    if (!cascadeResult) return;
    clearInterval(animationTimerRef.current);
    setIsPlayingAnimation(false);
    setCurrentAnimatedStep(cascadeResult.totalSteps);
  };

  const handleResetCascade = () => {
    if (animationTimerRef.current) clearInterval(animationTimerRef.current);
    setCascadeResult(null);
    setCurrentAnimatedStep(0);
    setIsPlayingAnimation(false);
  };

  // Selected asset details
  const selectedAsset = selectedAssetId ? assetMap.get(selectedAssetId) : null;

  // Incoming and outgoing dependencies for selected asset
  const selectedIncoming = useMemo(() => {
    if (!selectedAssetId) return [];
    return activeDataset.dependencies.filter((d) => d.target === selectedAssetId);
  }, [activeDataset.dependencies, selectedAssetId]);

  const selectedOutgoing = useMemo(() => {
    if (!selectedAssetId) return [];
    return activeDataset.dependencies.filter((d) => d.source === selectedAssetId);
  }, [activeDataset.dependencies, selectedAssetId]);

  // WHY Path for selected asset if cascade is active
  const whyPath: WhyStep[] = useMemo(() => {
    if (!cascadeResult || !selectedAssetId) return [];
    if (!cascadeResult.affectedNodes.has(selectedAssetId)) return [];
    return getWhyPath(activeDataset, cascadeResult, selectedAssetId);
  }, [cascadeResult, selectedAssetId, activeDataset]);

  // Check if a node is currently affected based on animated step
  const getNodeCascadeState = (assetId: string) => {
    if (!cascadeResult) return null;
    const nodeInfo = cascadeResult.affectedNodes.get(assetId);
    if (!nodeInfo) return null;
    if (nodeInfo.step <= currentAnimatedStep) {
      return nodeInfo;
    }
    return null;
  };

  // Check if edge is currently highlighted in cascade
  const isEdgeInCascade = (sourceId: string, targetId: string) => {
    if (!cascadeResult) return false;
    const targetNode = cascadeResult.affectedNodes.get(targetId);
    if (!targetNode) return false;
    return targetNode.parentAssetId === sourceId && targetNode.step <= currentAnimatedStep;
  };

  // Is node related to active role
  const isRolePriority = (sector: string) => {
    if (currentRole.id === 'general') return false;
    return currentRole.primarySectors.includes(sector as any);
  };

  // 4-step workflow tracking
  const currentStepIndex = useMemo(() => {
    if (activeIntervention || isActionLabModalOpen) return 4;
    if (cascadeResult) {
      if (!isPlayingAnimation && currentAnimatedStep >= cascadeResult.totalSteps) {
        return 4; // Ready for next step: Try a fix!
      }
      return 3;
    }
    if (isWeakPointModalOpen) return 2;
    return 1;
  }, [activeIntervention, isActionLabModalOpen, cascadeResult, isPlayingAnimation, currentAnimatedStep, isWeakPointModalOpen]);

  // Automated Hackathon Demo for Judges
  const handleRunDemoForMe = useCallback(() => {
    const weakPoints = findWeakPoints(activeDataset);
    if (weakPoints.length === 0) return;
    const topWp = weakPoints[0];

    // Focus on top weak point
    handleFocusAsset(topWp.assetId);

    // Run cascade
    handleRunCascade(topWp.assetId);

    // After animation, automatically select a downstream affected asset to show the causation trace ("WHY")
    setTimeout(() => {
      const result = simulateCascade(activeDataset, topWp.assetId);
      let targetAssetId: string | null = null;
      for (const [id, node] of result.affectedNodes.entries()) {
        if (id !== topWp.assetId && node.step > 0) {
          const a = activeDataset.assets.find((item) => item.id === id);
          if (a?.sector === 'Health' || a?.sector === 'Water' || a?.sector === 'Emergency Services') {
            targetAssetId = id;
            break;
          }
          if (!targetAssetId) targetAssetId = id;
        }
      }
      if (targetAssetId) {
        setSelectedAssetId(targetAssetId);
      }
    }, (topWp.maxSteps + 1) * 600 + 400);
  }, [activeDataset, handleFocusAsset]);

  return (
    <div className="w-full flex-1 flex flex-col bg-slate-950 text-slate-100 min-h-[calc(100vh-64px)]">
      {/* HOW CASCADE WORKS Guide Banner (Point 1) */}
      <div className="px-6 py-2.5 bg-slate-900/90 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
            HOW CASCADE WORKS:
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2.5 text-[11px]">
          <div
            className={`flex items-center gap-1 px-3 py-1 rounded-lg border transition-all ${
              currentStepIndex === 1
                ? 'bg-amber-500/20 border-amber-500/70 text-amber-300 font-black ring-1 ring-amber-500/40'
                : 'bg-slate-950/40 border-slate-800/80 text-slate-400'
            }`}
          >
            <span>① Find a weak point</span>
          </div>
          <span className="text-slate-600 font-bold">→</span>
          <div
            className={`flex items-center gap-1 px-3 py-1 rounded-lg border transition-all ${
              currentStepIndex === 2
                ? 'bg-red-500/20 border-red-500/70 text-red-300 font-black ring-1 ring-red-500/40'
                : 'bg-slate-950/40 border-slate-800/80 text-slate-400'
            }`}
          >
            <span>② Test its failure</span>
          </div>
          <span className="text-slate-600 font-bold">→</span>
          <div
            className={`flex items-center gap-1 px-3 py-1 rounded-lg border transition-all ${
              currentStepIndex === 3
                ? 'bg-amber-500/20 border-amber-500/70 text-amber-300 font-black ring-1 ring-amber-500/40'
                : 'bg-slate-950/40 border-slate-800/80 text-slate-400'
            }`}
          >
            <span>③ Watch impact spread</span>
          </div>
          <span className="text-slate-600 font-bold">→</span>
          <div
            className={`flex items-center gap-1 px-3 py-1 rounded-lg border transition-all ${
              currentStepIndex === 4
                ? 'bg-emerald-500/20 border-emerald-500/70 text-emerald-300 font-black ring-1 ring-emerald-500/40'
                : 'bg-slate-950/40 border-slate-800/80 text-slate-400'
            }`}
          >
            <span>④ Try a fix</span>
          </div>
        </div>
      </div>

      {/* Top Header Bar */}
      <div className="px-6 py-3 border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-4">
          <button
            onClick={onBackToPreview}
            className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white px-2.5 py-1.5 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Summary</span>
          </button>

          <div className="flex items-center gap-2.5">
            <h1 className="text-base sm:text-lg font-bold text-white tracking-tight">
              {activeDataset.name}
            </h1>
            <span className="text-xs text-slate-500 font-mono">
              ({activeDataset.assets.length} services · {activeDataset.dependencies.length} connections)
            </span>
          </div>
        </div>

        {/* View Controls & Action Toolbar */}
        <div className="flex items-center gap-2.5">
          {/* Feature 1: Find Weak Points Button (Point 2) */}
          <div className="flex flex-col items-end">
            <button
              onClick={() => setIsWeakPointModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-black transition-all shadow-md shadow-red-950/60 cursor-pointer"
              title="Which service would cause the most impact if it failed?"
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>① FIND THE BIGGEST RISK</span>
            </button>
            <span className="text-[9px] text-slate-400 mt-0.5">Which service causes most impact?</span>
          </div>

          {/* Feature 2: Action Lab Button (Point 2) */}
          <div className="flex flex-col items-end">
            <button
              onClick={() => setIsActionLabModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-black transition-all shadow-md shadow-cyan-950/60 cursor-pointer"
              title="Test whether an action reduces the impact."
            >
              <FlaskConical className="w-3.5 h-3.5 text-slate-950" />
              <span>④ TRY A FIX</span>
            </button>
            <span className="text-[9px] text-slate-400 mt-0.5">Test if an action reduces impact</span>
          </div>

          {/* Role Badge Indicator */}
          <div className="hidden xl:inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800/90 border border-slate-700 text-xs text-cyan-300 font-medium">
            <span>{currentRole.icon}</span>
            <span>{currentRole.name}</span>
          </div>

          {/* Unconnected Assets Chip (Drawer Trigger) */}
          {unconnectedAssets.length > 0 && !isFullNetwork && (
            <button
              onClick={() => setIsUnconnectedDrawerOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800/70 hover:bg-slate-800 border border-slate-700 text-xs text-slate-300 font-medium cursor-pointer transition-colors"
            >
              <Eye className="w-3.5 h-3.5 text-amber-400" />
              <span>{unconnectedAssets.length} Unconnected</span>
            </button>
          )}

          {/* Simple View / Full Network Toggle (Point 2) */}
          <div className="inline-flex rounded-lg bg-slate-900 p-1 border border-slate-800 text-xs">
            <button
              onClick={() => setIsFullNetwork(false)}
              className={`px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                !isFullNetwork
                  ? 'bg-cyan-500 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              CONNECTED NETWORK
            </button>
            <button
              onClick={() => setIsFullNetwork(true)}
              className={`px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                isFullNetwork
                  ? 'bg-cyan-500 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              ALL SERVICES
            </button>
          </div>

          {/* Reset All Button */}
          <button
            onClick={onResetAll}
            className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
            title="Reset All"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* START HERE Callout + Demo For Me (Point 3 & 14) */}
      {!cascadeResult && !activeIntervention && (
        <div className="mx-6 mt-3 p-3.5 rounded-2xl bg-gradient-to-r from-red-950/60 via-slate-900 to-slate-900 border border-red-800/60 flex flex-wrap items-center justify-between gap-3 text-xs animate-fade-in shrink-0 shadow-xl">
          <div className="flex items-center gap-3">
            <span className="px-2.5 py-1 rounded-full bg-red-500 text-slate-950 font-black text-[10px] uppercase tracking-wider shadow-sm">
              START HERE
            </span>
            <div>
              <div className="text-white font-bold text-sm">
                Find which city service could cause the biggest disruption.
              </div>
              <div className="text-[11px] text-slate-400">
                Click below to find the critical weak point or watch an automated demo.
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={() => setIsWeakPointModalOpen(true)}
              className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-black text-xs transition-all shadow-md shadow-red-950 flex items-center gap-1.5 cursor-pointer"
            >
              <ShieldAlert className="w-4 h-4" />
              <span>① FIND THE BIGGEST RISK</span>
            </button>

            <button
              onClick={handleRunDemoForMe}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-slate-950 font-black text-xs transition-all shadow-md shadow-cyan-950 flex items-center gap-1.5 cursor-pointer"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>▶ SHOW ME A DEMO</span>
            </button>
          </div>
        </div>
      )}

      {/* Active Mitigation Banner (When Action Lab is Applied) */}
      {activeIntervention && (
        <div className="px-6 py-2 bg-gradient-to-r from-emerald-950/90 via-slate-900 to-slate-900 border-b border-emerald-800/80 flex items-center justify-between gap-3 text-xs animate-fade-in shrink-0">
          <div className="flex items-center gap-2 text-emerald-300">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>
              Mitigation Active: <strong className="text-white">{activeIntervention.action.name}</strong>
              {' — '}
              Protected <strong className="text-emerald-300 font-mono">{activeIntervention.savedAssetsCount}</strong> facilities from disruption!
            </span>
          </div>

          <button
            onClick={() => {
              setActiveIntervention(null);
              handleResetCascade();
            }}
            className="px-2.5 py-0.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-[11px] font-semibold transition-colors flex items-center gap-1 cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Revert Action</span>
          </button>
        </div>
      )}

      {/* Dynamic Cascade Simulation Bar & Story (Point 5, 6, 8) */}
      {cascadeResult && (
        <div className="flex flex-col border-b border-red-900/60 shrink-0">
          {/* Top Row: Stepper & Controls */}
          <div className="px-6 py-2.5 bg-gradient-to-r from-red-950/80 via-slate-900 to-slate-900 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-1.5 text-red-400 font-black">
                <AlertTriangle className="w-4 h-4 text-red-400" />
                <span>CASCADE SIMULATION</span>
              </div>

              {/* Color Legend (Point 5) */}
              <div className="flex flex-wrap items-center gap-2 px-2.5 py-1 rounded-lg bg-slate-950/80 border border-slate-800 text-[11px]">
                <div className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
                  <span className="font-bold text-red-300">🔴 FAILED:</span>
                  <span className="text-slate-400">Switched off</span>
                </div>
                <span className="text-slate-700">·</span>
                <div className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                  <span className="font-bold text-amber-300">🟠 AFFECTED:</span>
                  <span className="text-slate-400">Depends on failure</span>
                </div>
                <span className="text-slate-700">·</span>
                <div className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-slate-700" />
                  <span className="font-bold text-slate-400">⚫ UNAFFECTED:</span>
                  <span className="text-slate-500">Not reached</span>
                </div>
              </div>

              {/* Stepper Breadcrumb (Point 5) */}
              <div className="flex items-center gap-1 text-[11px] font-mono text-slate-300">
                <span className={currentAnimatedStep === 0 ? 'text-red-400 font-bold underline' : 'text-slate-500'}>
                  FAILED
                </span>
                {Array.from({ length: cascadeResult.totalSteps }, (_, idx) => idx + 1).map((s) => (
                  <React.Fragment key={s}>
                    <span className="text-slate-600">→</span>
                    <span className={currentAnimatedStep === s ? 'text-amber-400 font-bold underline' : currentAnimatedStep > s ? 'text-slate-300' : 'text-slate-600'}>
                      STEP {s}
                    </span>
                  </React.Fragment>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleTogglePlayPause}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer font-medium"
              >
                {isPlayingAnimation ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                <span>{isPlayingAnimation ? 'Pause' : 'Play'}</span>
              </button>

              <button
                onClick={handleSkipToEnd}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer font-medium"
                title="Fast forward to final cascade"
              >
                <FastForward className="w-3.5 h-3.5" />
                <span>SHOW FULL IMPACT</span>
              </button>

              <button
                onClick={handleResetCascade}
                className="px-3 py-1 rounded-md bg-red-950 hover:bg-red-900 border border-red-800 text-red-300 font-semibold cursor-pointer"
              >
                Reset
              </button>
            </div>
          </div>

          {/* Story Bar: WHAT HAPPENED? + NEXT: TRY A FIX (Point 6 & 8) */}
          {currentAnimatedStep >= cascadeResult.totalSteps && (
            <div className="px-6 py-2.5 bg-gradient-to-r from-red-950/90 via-slate-900 to-slate-900 border-t border-red-900/40 flex flex-wrap items-center justify-between gap-3 text-xs animate-fade-in">
              <div className="flex flex-wrap items-center gap-3">
                <span className="px-2 py-0.5 rounded bg-red-900/80 text-red-200 font-black uppercase text-[10px]">
                  WHAT HAPPENED?
                </span>
                <div className="text-slate-200 font-medium">
                  <strong className="text-white">
                    {activeDataset.assets.find((a) => a.id === cascadeResult.initialFailureId)?.name || 'Service'}
                  </strong>{' '}
                  failed
                  <span className="text-slate-500 mx-1.5">↓</span>
                  <strong className="text-amber-400 font-mono">
                    {cascadeResult.affectedNodes.size - 1}
                  </strong>{' '}
                  other services were affected
                  <span className="text-slate-500 mx-1.5">↓</span>
                  <strong className="text-cyan-300 font-mono">
                    {cascadeResult.sectorsReached.length}
                  </strong>{' '}
                  city sectors were reached
                </div>
                <span className="text-slate-600">·</span>
                <div className="text-cyan-300 text-[11px] font-semibold flex items-center gap-1">
                  <span>💡 Click any orange service to see WHY</span>
                </div>
              </div>

              <button
                onClick={() => setIsActionLabModalOpen(true)}
                className="px-3.5 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs transition-all shadow-md shadow-emerald-950 flex items-center gap-1.5 cursor-pointer animate-pulse"
              >
                <FlaskConical className="w-3.5 h-3.5" />
                <span>NEXT: CAN WE REDUCE THE DAMAGE? [ ④ TRY A FIX ]</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* 0 Connections Warning Banner */}
      {activeDataset.dependencies.length === 0 && (
        <div className="mx-6 mt-4 p-3.5 rounded-xl bg-amber-950/40 border border-amber-800/60 text-amber-200 flex items-center gap-2.5 text-xs font-medium shrink-0">
          <Info className="w-4 h-4 text-amber-400 shrink-0" />
          <span>Connections are needed to test a cascade.</span>
        </div>
      )}

      {/* Main Viewport: Real Interactive Graph (75-80% height) + Side Inspector */}
      <div className="relative flex-1 w-full overflow-hidden flex flex-row min-h-[580px]">
        {/* Interactive SVG Canvas */}
        <div
          ref={svgContainerRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
          className={`relative flex-1 w-full h-full select-none ${
            isDragging ? 'cursor-grabbing' : 'cursor-grab'
          }`}
          style={{ minHeight: '580px' }}
        >
          {/* Floating Pan/Zoom Controls */}
          <div className="absolute top-4 left-4 z-20 flex flex-col gap-1.5 p-1.5 rounded-xl bg-slate-900/90 border border-slate-800 shadow-xl backdrop-blur-sm">
            <button
              onClick={() => setZoom((z) => Math.min(2.5, z * 1.2))}
              className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white cursor-pointer"
              title="Zoom In"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              onClick={() => setZoom((z) => Math.max(0.25, z / 1.2))}
              className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white cursor-pointer"
              title="Zoom Out"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <button
              onClick={handleFitView}
              className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white cursor-pointer"
              title="Fit to Screen"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
            <button
              onClick={() => {
                setZoom(1);
                setPan({ x: 60, y: 60 });
              }}
              className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white cursor-pointer"
              title="Reset Position"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>

          {/* Sector Legend in Bottom Left */}
          <div className="absolute bottom-4 left-4 z-20 hidden md:flex flex-wrap items-center gap-2 px-3 py-2 rounded-xl bg-slate-900/85 border border-slate-800 text-xs backdrop-blur-sm pointer-events-none">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              Sectors:
            </span>
            {activeDataset.sectors.map((sec) => {
              const cfg = getSectorConfig(sec);
              const Icon = cfg.icon;
              return (
                <span
                  key={sec}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] border ${cfg.color}`}
                >
                  <Icon className="w-3 h-3" />
                  <span>{sec}</span>
                </span>
              );
            })}
          </div>

          {/* SVG Rendering Container */}
          <svg
            className="w-full h-full absolute inset-0"
            style={{ width: '100%', height: '100%' }}
          >
            <defs>
              {/* Directed Arrow Markers */}
              <marker
                id="arrow-default"
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="5"
                markerHeight="5"
                orient="auto-start-reverse"
              >
                <path d="M 0 1 L 9 5 L 0 9 z" fill="#06b6d4" />
              </marker>

              <marker
                id="arrow-hover"
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 1 L 9 5 L 0 9 z" fill="#38bdf8" />
              </marker>

              <marker
                id="arrow-cascade"
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 1 L 9 5 L 0 9 z" fill="#ef4444" />
              </marker>

              <marker
                id="arrow-protected"
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 1 L 9 5 L 0 9 z" fill="#10b981" />
              </marker>

              <marker
                id="arrow-dimmed"
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="4"
                markerHeight="4"
                orient="auto-start-reverse"
              >
                <path d="M 0 1 L 9 5 L 0 9 z" fill="#1e293b" />
              </marker>
            </defs>

            {/* Transform Group for Pan and Zoom */}
            <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
              {/* Directed Edges */}
              {activeDataset.dependencies.map((dep, idx) => {
                const srcNode = layoutNodes.get(dep.source);
                const tgtNode = layoutNodes.get(dep.target);
                if (!srcNode || !tgtNode) return null;

                const x1 = srcNode.x + srcNode.width;
                const y1 = srcNode.y + srcNode.height / 2;
                const x2 = tgtNode.x;
                const y2 = tgtNode.y + tgtNode.height / 2;

                const isHovered =
                  hoveredAssetId === dep.source ||
                  hoveredAssetId === dep.target ||
                  selectedAssetId === dep.source ||
                  selectedAssetId === dep.target;

                const inCascade = isEdgeInCascade(dep.source, dep.target);
                const hasCascade = Boolean(cascadeResult);
                const isInterventionAdded = dep.id?.startsWith('redundant-');

                // Bezier curve calculations
                const dx = Math.abs(x2 - x1);
                const cx1 = x1 + Math.max(40, dx * 0.45);
                const cy1 = y1;
                const cx2 = x2 - Math.max(40, dx * 0.45);
                const cy2 = y2;

                const pathData = `M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`;

                let strokeColor = '#0891b2';
                let strokeWidth = 1.75;
                let markerEnd = 'url(#arrow-default)';
                let opacity = 0.55;

                if (isInterventionAdded) {
                  strokeColor = '#10b981';
                  strokeWidth = 2.5;
                  markerEnd = 'url(#arrow-protected)';
                  opacity = 1;
                } else if (inCascade) {
                  strokeColor = '#ef4444';
                  strokeWidth = 3;
                  markerEnd = 'url(#arrow-cascade)';
                  opacity = 1;
                } else if (isHovered) {
                  strokeColor = '#38bdf8';
                  strokeWidth = 2.5;
                  markerEnd = 'url(#arrow-hover)';
                  opacity = 1;
                } else if (hasCascade) {
                  strokeColor = '#1e293b';
                  strokeWidth = 1;
                  markerEnd = 'url(#arrow-dimmed)';
                  opacity = 0.2;
                }

                return (
                  <g key={dep.id || `edge-${idx}`}>
                    <path
                      d={pathData}
                      fill="none"
                      stroke={strokeColor}
                      strokeWidth={strokeWidth}
                      opacity={opacity}
                      markerEnd={markerEnd}
                      strokeDasharray={isInterventionAdded ? '6 3' : inCascade ? '6 3' : 'none'}
                      className="transition-colors duration-200"
                    />
                  </g>
                );
              })}

              {/* Node Cards */}
              {Array.from(layoutNodes.values()).map((node) => {
                const asset = node.asset;
                const cfg = getSectorConfig(asset.sector);
                const Icon = cfg.icon;

                const isSelected = selectedAssetId === asset.id;
                const isHovered = hoveredAssetId === asset.id;
                const cascadeState = getNodeCascadeState(asset.id);
                const hasCascade = Boolean(cascadeResult);
                const isUnaffected = hasCascade && !cascadeState;
                const isPriorityRole = isRolePriority(asset.sector);
                const isSavedByAction = activeIntervention?.savedAssetIds.includes(asset.id);

                let cardBg = 'rgba(15, 23, 42, 0.95)';
                let cardBorder = 'rgba(51, 65, 85, 0.8)';
                let statusDotColor =
                  asset.status === 'failed'
                    ? '#ef4444'
                    : asset.status === 'degraded'
                    ? '#f59e0b'
                    : '#10b981';

                if (isSavedByAction) {
                  cardBg = 'rgba(6, 78, 59, 0.95)';
                  cardBorder = '#10b981';
                  statusDotColor = '#10b981';
                } else if (cascadeState) {
                  if (cascadeState.step === 0) {
                    cardBg = 'rgba(69, 10, 10, 0.95)';
                    cardBorder = '#ef4444';
                    statusDotColor = '#ef4444';
                  } else {
                    cardBg = 'rgba(67, 20, 7, 0.95)';
                    cardBorder = '#f97316';
                    statusDotColor = '#f97316';
                  }
                } else if (isSelected) {
                  cardBorder = '#06b6d4';
                  cardBg = 'rgba(8, 47, 73, 0.95)';
                } else if (isHovered) {
                  cardBorder = '#38bdf8';
                }

                return (
                  <g
                    key={asset.id}
                    transform={`translate(${node.x}, ${node.y})`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedAssetId(isSelected ? null : asset.id);
                    }}
                    onMouseEnter={() => setHoveredAssetId(asset.id)}
                    onMouseLeave={() => setHoveredAssetId(null)}
                    className="cursor-pointer transition-opacity duration-200"
                    opacity={isUnaffected && !isSavedByAction ? 0.35 : 1}
                  >
                    {/* Background Rect */}
                    <rect
                      width={node.width}
                      height={node.height}
                      rx={10}
                      fill={cardBg}
                      stroke={cardBorder}
                      strokeWidth={isSelected || cascadeState || isSavedByAction ? 2.5 : 1.25}
                      className="transition-all duration-150"
                    />

                    {/* Sector Icon Container */}
                    <rect
                      x={8}
                      y={8}
                      width={32}
                      height={32}
                      rx={8}
                      fill="rgba(30, 41, 59, 0.8)"
                      stroke={cardBorder}
                      strokeWidth={0.5}
                    />
                    <foreignObject x={12} y={12} width={24} height={24} className="pointer-events-none">
                      <div className="w-full h-full flex items-center justify-center">
                        <Icon className="w-4 h-4 text-slate-300" />
                      </div>
                    </foreignObject>

                    {/* Asset Name & Type */}
                    <foreignObject x={46} y={6} width={138} height={44} className="pointer-events-none">
                      <div className="w-full h-full flex flex-col justify-center pr-2">
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-[12px] font-bold text-white truncate max-w-[105px]">
                            {asset.name}
                          </span>
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: statusDotColor }}
                          />
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-slate-400 mt-0.5">
                          <span className="truncate max-w-[95px]">{asset.type}</span>
                          <span className="font-mono text-[9px] text-slate-500">
                            {node.inDegree + node.outDegree} links
                          </span>
                        </div>
                      </div>
                    </foreignObject>

                    {/* Simulation Step Badge OR Saved Badge */}
                    {isSavedByAction ? (
                      <g transform={`translate(${node.width - 64}, -10)`}>
                        <rect width={60} height={18} rx={9} fill="#10b981" />
                        <text
                          x={30}
                          y={13}
                          textAnchor="middle"
                          fill="#ffffff"
                          fontSize="9"
                          fontWeight="bold"
                          fontFamily="sans-serif"
                        >
                          SAVED ✓
                        </text>
                      </g>
                    ) : cascadeState ? (
                      <g transform={`translate(${node.width - 64}, -10)`}>
                        <rect
                          width={60}
                          height={18}
                          rx={9}
                          fill={cascadeState.step === 0 ? '#ef4444' : '#f97316'}
                        />
                        <text
                          x={30}
                          y={13}
                          textAnchor="middle"
                          fill="#ffffff"
                          fontSize="9"
                          fontWeight="bold"
                          fontFamily="sans-serif"
                        >
                          {cascadeState.step === 0 ? 'FAILED' : `STEP ${cascadeState.step}`}
                        </text>
                      </g>
                    ) : null}

                    {/* Role Priority Ring */}
                    {isPriorityRole && !cascadeState && !isSavedByAction && (
                      <circle cx={node.width - 8} cy={8} r={3.5} fill="#06b6d4" />
                    )}
                  </g>
                );
              })}
            </g>
          </svg>
        </div>

        {/* Compact Side Inspector Panel */}
        {selectedAsset && (
          <div className="w-80 lg:w-96 bg-slate-900 border-l border-slate-800 p-5 flex flex-col shrink-0 shadow-2xl z-30 overflow-y-auto max-h-full">
            {/* Inspector Header */}
            <div className="flex items-start justify-between pb-3.5 mb-4 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-xl border ${getSectorConfig(selectedAsset.sector).color}`}>
                  {React.createElement(getSectorConfig(selectedAsset.sector).icon, {
                    className: 'w-5 h-5',
                  })}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white leading-tight">
                    {selectedAsset.name}
                  </h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[11px] font-semibold text-cyan-400">
                      {selectedAsset.sector}
                    </span>
                    <span className="text-slate-600">·</span>
                    <span className="text-[11px] font-mono text-slate-400">
                      {selectedAsset.id}
                    </span>
                  </div>
                </div>
              </div>

              <button
                onClick={() => setSelectedAssetId(null)}
                className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 cursor-pointer transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Core Actions: WHAT IF THIS FAILS? + Action Lab Shortcut */}
            <div className="mb-5 space-y-2">
              <button
                onClick={() => handleRunCascade(selectedAsset.id)}
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-red-600 via-rose-600 to-amber-600 hover:from-red-500 hover:to-amber-500 text-white font-extrabold text-sm tracking-wide uppercase shadow-lg shadow-red-950/80 transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <AlertTriangle className="w-4 h-4" />
                <span>What if this fails?</span>
              </button>

              <button
                onClick={() => setIsActionLabModalOpen(true)}
                className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-750 border border-cyan-500/40 text-cyan-300 font-bold text-xs tracking-wide uppercase transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <FlaskConical className="w-3.5 h-3.5 text-cyan-400" />
                <span>Test Action in Action Lab</span>
              </button>
              <p className="text-[11px] text-slate-400 text-center mt-1">
                Simulate downstream disruption or test preventive protections
              </p>
            </div>

            {/* WHY IS THIS AFFECTED? Plain-Language Story (Point 7) */}
            {whyPath.length > 0 && (
              <div className="mb-5 p-4 rounded-2xl bg-gradient-to-br from-red-950/60 via-slate-900 to-slate-900 border border-red-800/80 text-xs animate-fade-in space-y-3 shadow-lg">
                <div className="text-xs font-black text-red-300 uppercase tracking-wider flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                  <span>WHY WAS {selectedAsset.name.toUpperCase()} AFFECTED?</span>
                </div>

                <div className="space-y-2 pl-1">
                  {whyPath.map((step, idx) => {
                    const cfg = getSectorConfig(step.sector);
                    const StepIcon = cfg.icon;
                    const isRoot = idx === 0;
                    const prevStep = idx > 0 ? whyPath[idx - 1] : null;

                    return (
                      <div key={idx} className="relative pl-4 border-l-2 border-red-500/50 pb-2.5 last:pb-0">
                        <div className="flex items-center gap-1.5 font-bold text-slate-100">
                          <StepIcon className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                          <span>
                            {isRoot ? (
                              <span className="text-red-400 font-extrabold">{step.assetName} failed</span>
                            ) : (
                              <span>
                                {step.assetName} depends on {prevStep?.assetName || 'upstream feed'}
                              </span>
                            )}
                          </span>
                        </div>

                        {step.dependencyType && (
                          <div className="text-[10px] text-slate-400 mt-0.5 font-mono">
                            via {step.dependencyType.replace(/_/g, ' ')}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="pt-2 border-t border-red-900/50 text-[11px] text-slate-300 leading-relaxed bg-red-950/40 p-2.5 rounded-lg">
                  <strong className="text-red-200">Therefore:</strong> "{selectedAsset.name} is affected through this dependency chain."
                </div>
              </div>
            )}

            {/* Progressive Disclosure: Technical Details (Point 13) */}
            <div className="mb-4 pt-1">
              <button
                onClick={() => setShowTechnicalDetails(!showTechnicalDetails)}
                className="w-full py-2 px-3 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-xs text-slate-400 hover:text-slate-200 transition-colors flex items-center justify-between cursor-pointer font-medium"
              >
                <span>{showTechnicalDetails ? '▲ Hide Technical Details' : '▼ Technical Details'}</span>
                <span className="text-[10px] font-mono text-slate-500">{selectedAsset.id}</span>
              </button>

              {showTechnicalDetails && (
                <div className="mt-2.5 p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-2 animate-fade-in">
                  <div className="flex justify-between text-slate-400">
                    <span>Unique ID:</span>
                    <span className="font-mono text-white">{selectedAsset.id}</span>
                  </div>
                  {selectedAsset.capacity !== undefined && (
                    <div className="flex justify-between text-slate-400">
                      <span>Capacity:</span>
                      <span className="font-mono text-white">{selectedAsset.capacity}</span>
                    </div>
                  )}
                  {selectedAsset.currentLoad !== undefined && (
                    <div className="flex justify-between text-slate-400">
                      <span>Current Load:</span>
                      <span className="font-mono text-cyan-300">{selectedAsset.currentLoad}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-slate-400">
                    <span>Direct Connections:</span>
                    <span className="font-mono text-slate-200">{selectedIncoming.length + selectedOutgoing.length}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Depends On (Upstream Providers) */}
            <div className="mb-4">
              <div className="flex items-center justify-between text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                <span>Depends On ({selectedIncoming.length})</span>
                <span className="text-[10px] text-slate-500 font-normal">Incoming feeds</span>
              </div>

              {selectedIncoming.length === 0 ? (
                <div className="p-2.5 rounded-lg bg-slate-950/40 border border-slate-800/80 text-xs text-slate-500 italic">
                  {activeDataset.dependencies.length === 0
                    ? 'Connections are needed to test a cascade.'
                    : 'No upstream dependencies in dataset'}
                </div>
              ) : (
                <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                  {selectedIncoming.map((dep, i) => {
                    const src = assetMap.get(dep.source);
                    return (
                      <button
                        key={i}
                        onClick={() => setSelectedAssetId(dep.source)}
                        className="w-full text-left p-2 rounded-lg bg-slate-950/70 hover:bg-slate-800 border border-slate-800 hover:border-cyan-500/50 transition-all flex items-center justify-between text-xs cursor-pointer group"
                      >
                        <div className="min-w-0 pr-2">
                          <div className="font-medium text-slate-200 group-hover:text-cyan-300 truncate">
                            ← {src?.name || dep.source}
                          </div>
                          <div className="text-[10px] text-slate-500">
                            {dep.type.replace(/_/g, ' ')}
                          </div>
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono shrink-0">
                          {src?.sector}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Supports (Downstream Dependents) */}
            <div className="mb-4">
              <div className="flex items-center justify-between text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                <span>Supports ({selectedOutgoing.length})</span>
                <span className="text-[10px] text-slate-500 font-normal">Downstream services</span>
              </div>

              {selectedOutgoing.length === 0 ? (
                <div className="p-2.5 rounded-lg bg-slate-950/40 border border-slate-800/80 text-xs text-slate-500 italic">
                  {activeDataset.dependencies.length === 0
                    ? 'Connections are needed to test a cascade.'
                    : 'No downstream services rely on this asset'}
                </div>
              ) : (
                <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                  {selectedOutgoing.map((dep, i) => {
                    const tgt = assetMap.get(dep.target);
                    return (
                      <button
                        key={i}
                        onClick={() => setSelectedAssetId(dep.target)}
                        className="w-full text-left p-2 rounded-lg bg-slate-950/70 hover:bg-slate-800 border border-slate-800 hover:border-cyan-500/50 transition-all flex items-center justify-between text-xs cursor-pointer group"
                      >
                        <div className="min-w-0 pr-2">
                          <div className="font-medium text-slate-200 group-hover:text-cyan-300 truncate">
                            → {tgt?.name || dep.target}
                          </div>
                          <div className="text-[10px] text-slate-500">
                            {dep.type.replace(/_/g, ' ')}
                          </div>
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono shrink-0">
                          {tgt?.sector}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Slide-over Drawer for Unconnected Assets */}
        {isUnconnectedDrawerOpen && (
          <div className="absolute top-0 right-0 bottom-0 w-80 lg:w-96 bg-slate-900 border-l border-slate-800 p-5 flex flex-col z-40 shadow-2xl animate-fade-in">
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800">
              <div>
                <h3 className="text-sm font-bold text-white">
                  Unconnected Assets ({unconnectedAssets.length})
                </h3>
                <p className="text-xs text-slate-400">
                  Assets without recorded connections
                </p>
              </div>
              <button
                onClick={() => setIsUnconnectedDrawerOpen(false)}
                className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <input
              type="text"
              placeholder="Search unconnected..."
              value={unconnectedFilter}
              onChange={(e) => setUnconnectedFilter(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 placeholder-slate-500 mb-3 focus:border-cyan-500 focus:outline-none"
            />

            <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
              {unconnectedAssets
                .filter(
                  (a) =>
                    a.name.toLowerCase().includes(unconnectedFilter.toLowerCase()) ||
                    a.id.toLowerCase().includes(unconnectedFilter.toLowerCase())
                )
                .map((a) => {
                  const cfg = getSectorConfig(a.sector);
                  const Icon = cfg.icon;
                  return (
                    <div
                      key={a.id}
                      onClick={() => {
                        setSelectedAssetId(a.id);
                        setIsUnconnectedDrawerOpen(false);
                      }}
                      className="p-2 rounded-lg bg-slate-950/70 hover:bg-slate-850 border border-slate-800/80 hover:border-cyan-500/50 transition-all flex items-center justify-between text-xs cursor-pointer"
                    >
                      <div className="flex items-center gap-2 min-w-0 pr-2">
                        <Icon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="font-medium text-slate-200 truncate">
                          {a.name}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-500 font-mono shrink-0">
                        {a.sector}
                      </span>
                    </div>
                  );
                })}
            </div>
          </div>
        )}
      </div>

      {/* Feature 1: Weak Point Finder Modal */}
      <WeakPointModal
        dataset={activeDataset}
        isOpen={isWeakPointModalOpen}
        onClose={() => setIsWeakPointModalOpen(false)}
        onFocusAsset={handleFocusAsset}
        onSelectAndSimulate={(id) => {
          handleFocusAsset(id);
          handleRunCascade(id);
        }}
      />

      {/* Feature 2: Action Lab Modal */}
      <ActionLabModal
        dataset={dataset}
        currentFailureId={selectedAssetId || cascadeResult?.initialFailureId || null}
        isOpen={isActionLabModalOpen}
        onClose={() => setIsActionLabModalOpen(false)}
        onApplyIntervention={(res) => {
          setActiveIntervention(res);
          setCascadeResult(res.afterCascade);
          setCurrentAnimatedStep(res.afterCascade.totalSteps);
        }}
      />
    </div>
  );
};
