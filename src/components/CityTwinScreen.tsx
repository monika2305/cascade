import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import type { InfrastructureDataset } from '../types/infrastructure';
import { simulateCascade, getWhyPath, type CascadeResult } from '../utils/cascade';
import {
  generateContextualFixes,
  evaluateFixes,
  runIntervention,
  type InterventionResult,
} from '../utils/analysis';
import {
  computeSphereLayout,
  projectNodes,
  projectArcs,
  rotatePoint3D,
  projectToScreen,
} from '../utils/sphereLayout';
import {
  Play,
  RotateCcw,
  Zap,
  ShieldCheck,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';

interface CityTwinScreenProps {
  dataset: InfrastructureDataset;
  selectedFailureId?: string | null;
  onSelectFailureId?: (assetId: string) => void;
  onNavigateToFailureTest?: (assetId?: string) => void;
  onNavigateToHome?: () => void;
}

type SectorFilter = 'ALL' | 'Power' | 'Water' | 'Transport' | 'Communication' | 'Health' | 'Emergency Services';

export const CityTwinScreen: React.FC<CityTwinScreenProps> = ({
  dataset,
  selectedFailureId,
  onSelectFailureId,
  onNavigateToFailureTest,
  onNavigateToHome,
}) => {
  // 1. Failure selection & Simulation results
  const [activeFailureId, setActiveFailureId] = useState<string | null>(
    selectedFailureId || dataset?.assets[0]?.id || null
  );
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(activeFailureId);
  const [sectorFilter, setSectorFilter] = useState<SectorFilter>('ALL');
  const [afterViewMode, setAfterViewMode] = useState<'cascade' | 'fix'>('cascade');

  // Sync external failure ID
  useEffect(() => {
    if (selectedFailureId && selectedFailureId !== activeFailureId) {
      setActiveFailureId(selectedFailureId);
      setSelectedAssetId(selectedFailureId);
      if (onSelectFailureId) {
        onSelectFailureId(selectedFailureId);
      }
    }
  }, [selectedFailureId, activeFailureId, onSelectFailureId]);

  // Deterministic simulation result
  const cascadeResult: CascadeResult | null = useMemo(() => {
    if (!dataset || !activeFailureId) return null;
    return simulateCascade(dataset, activeFailureId);
  }, [dataset, activeFailureId]);

  // Available tested fix evaluation from Action Lab
  const { bestFix, fixResult } = useMemo(() => {
    if (!dataset || !activeFailureId) {
      return { bestFix: null, fixResult: null };
    }
    const fixes = generateContextualFixes(dataset, activeFailureId);
    const evals = evaluateFixes(dataset, activeFailureId, fixes);
    const top = evals.evaluatedFixes.length > 0 ? evals.evaluatedFixes[0].fix : null;
    const res: InterventionResult | null = top ? runIntervention(dataset, activeFailureId, top.action) : null;
    return { bestFix: top, fixResult: res };
  }, [dataset, activeFailureId]);

  // 2. Show Change Animation States
  // -1 = Show complete static state
  // 0, 1, 2, ... = Animated progressive cascade wavefront steps
  const [animatedStep, setAnimatedStep] = useState<number>(-1);
  const [isAnimatingChange, setIsAnimatingChange] = useState<boolean>(false);
  const animationTimerRef = useRef<number | null>(null);

  // 3. Synchronized 3D Rotation State
  // Shared by BOTH twins (rotX: pitch, rotY: yaw)
  const [rotation, setRotation] = useState<{ x: number; y: number }>({ x: 0.25, y: -0.4 });
  const isDraggingRef = useRef<boolean>(false);
  const dragStartPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const dragStartRotRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const hasUserInteractedRef = useRef<boolean>(false);
  const autoRotateRef = useRef<number | null>(null);

  // Canvas references
  const canvasBeforeRef = useRef<HTMLCanvasElement | null>(null);
  const canvasAfterRef = useRef<HTMLCanvasElement | null>(null);
  const [hoveredAssetId, setHoveredAssetId] = useState<string | null>(null);

  // Compute 3D Sphere Layout (Fibonacci sphere, 100% deterministic)
  const sphereNodes = useMemo(() => {
    return computeSphereLayout(dataset);
  }, [dataset]);

  // Handle slow initial idle rotation
  useEffect(() => {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) return;

    const animateIdle = () => {
      if (!hasUserInteractedRef.current && !isDraggingRef.current) {
        setRotation((prev) => ({
          x: prev.x,
          y: prev.y + 0.002,
        }));
      }
      autoRotateRef.current = requestAnimationFrame(animateIdle);
    };

    autoRotateRef.current = requestAnimationFrame(animateIdle);
    return () => {
      if (autoRotateRef.current) cancelAnimationFrame(autoRotateRef.current);
    };
  }, []);

  // Synchronized focus: smoothly rotate twins to bring selected asset front-and-center
  const focusAsset = useCallback((assetId: string) => {
    setSelectedAssetId(assetId);
    const node = sphereNodes.get(assetId);
    if (!node) return;

    // Calculate yaw and pitch that brings (node.x, node.y, node.z) to (0, 0, 1)
    const targetRotY = -Math.atan2(node.x, node.z);
    const targetRotX = Math.asin(Math.max(-1, Math.min(1, node.y)));

    hasUserInteractedRef.current = true;
    setRotation({ x: targetRotX * 0.7, y: targetRotY });
  }, [sphereNodes]);

  // Unified Drag Handlers for Synchronized Rotation
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    hasUserInteractedRef.current = true;
    isDraggingRef.current = true;
    dragStartPosRef.current = { x: e.clientX, y: e.clientY };
    dragStartRotRef.current = { ...rotation };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>, canvasType: 'before' | 'after') => {
    if (isDraggingRef.current) {
      const dx = e.clientX - dragStartPosRef.current.x;
      const dy = e.clientY - dragStartPosRef.current.y;

      const sensitivity = 0.006;
      setRotation({
        x: Math.max(-1.4, Math.min(1.4, dragStartRotRef.current.x + dy * sensitivity)),
        y: dragStartRotRef.current.y + dx * sensitivity,
      });
      return;
    }

    // Hover detection on front-facing nodes
    const canvas = canvasType === 'before' ? canvasBeforeRef.current : canvasAfterRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = Math.min(centerX, centerY) * 0.76;

    const projected = projectNodes(sphereNodes, centerX, centerY, radius, rotation.x, rotation.y);
    let foundId: string | null = null;

    // Check front-facing nodes in reverse (closest to viewer first)
    for (let i = projected.length - 1; i >= 0; i--) {
      const p = projected[i];
      if (!p.isFront) continue;
      const dist = Math.hypot(p.screenX - mouseX, p.screenY - mouseY);
      if (dist <= p.radius + 6) {
        foundId = p.asset.id;
        break;
      }
    }

    setHoveredAssetId(foundId);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDraggingRef.current) return;
    const dx = Math.abs(e.clientX - dragStartPosRef.current.x);
    const dy = Math.abs(e.clientY - dragStartPosRef.current.y);

    isDraggingRef.current = false;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // Ignored
    }

    // If mouse didn't drag significantly, treat as click
    if (dx < 4 && dy < 4 && hoveredAssetId) {
      focusAsset(hoveredAssetId);
    }
  };

  // Trigger Show Change Animation
  const handleTriggerShowChange = () => {
    if (!cascadeResult) return;
    if (animationTimerRef.current) clearInterval(animationTimerRef.current);

    setIsAnimatingChange(true);
    setAnimatedStep(0);

    const maxSteps = cascadeResult.totalSteps;
    let cur = 0;

    animationTimerRef.current = window.setInterval(() => {
      cur++;
      if (cur <= maxSteps) {
        setAnimatedStep(cur);
      } else {
        if (animationTimerRef.current) clearInterval(animationTimerRef.current);
        setIsAnimatingChange(false);
        setAnimatedStep(-1); // Show full final state
      }
    }, 650);
  };

  const handleResetChange = () => {
    if (animationTimerRef.current) clearInterval(animationTimerRef.current);
    setIsAnimatingChange(false);
    setAnimatedStep(-1);
  };

  // Helper to determine node visual status on AFTER twin
  const getNodeVisualState = useCallback(
    (assetId: string): 'normal' | 'failed' | 'affected' | 'recovered' => {
      if (!cascadeResult || !activeFailureId) return 'normal';

      // If After Fix mode is active
      if (afterViewMode === 'fix' && fixResult) {
        if (assetId === activeFailureId) return 'failed';
        if (fixResult.savedAssetIds.includes(assetId)) return 'recovered';
        if (fixResult.afterCascade.affectedNodes.has(assetId)) return 'affected';
        return 'normal';
      }

      // If Show Change animation is currently in progress
      if (isAnimatingChange && animatedStep >= 0) {
        if (assetId === activeFailureId) return 'failed';
        const affectedNode = cascadeResult.affectedNodes.get(assetId);
        if (affectedNode && affectedNode.step <= animatedStep && affectedNode.step > 0) {
          return 'affected';
        }
        return 'normal';
      }

      // Static Cascade view
      if (assetId === activeFailureId) return 'failed';
      if (cascadeResult.affectedNodes.has(assetId)) return 'affected';
      return 'normal';
    },
    [cascadeResult, activeFailureId, afterViewMode, fixResult, isAnimatingChange, animatedStep]
  );

  // Render 3D Spheres to Canvas
  const renderSphereCanvas = useCallback(
    (
      canvas: HTMLCanvasElement | null,
      isAfterTwin: boolean
    ) => {
      if (!canvas || !dataset) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const width = canvas.width;
      const height = canvas.height;
      const centerX = width / 2;
      const centerY = height / 2;
      const radius = Math.min(centerX, centerY) * 0.74;

      ctx.clearRect(0, 0, width, height);

      // 1. Draw 3D Sphere Background & Atmosphere
      const grad = ctx.createRadialGradient(
        centerX - radius * 0.35,
        centerY - radius * 0.35,
        radius * 0.1,
        centerX,
        centerY,
        radius
      );

      if (isAfterTwin && (isAnimatingChange || animatedStep !== 0)) {
        grad.addColorStop(0, '#090d16');
        grad.addColorStop(0.7, '#040711');
        grad.addColorStop(1, '#02040a');
      } else {
        grad.addColorStop(0, '#0a101d');
        grad.addColorStop(0.7, '#050914');
        grad.addColorStop(1, '#02040a');
      }

      ctx.save();
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();

      // Atmospheric edge ring
      ctx.strokeStyle = isAfterTwin ? 'rgba(239, 68, 68, 0.25)' : 'rgba(56, 189, 248, 0.25)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Atmospheric outer glow
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius + 2, 0, Math.PI * 2);
      ctx.strokeStyle = isAfterTwin ? 'rgba(249, 115, 22, 0.12)' : 'rgba(14, 165, 233, 0.12)';
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.restore();

      // 2. Subtle 3D Latitude / Longitude Digital Coordinate Rings
      ctx.save();
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.08)';
      ctx.lineWidth = 1;

      // Equator and latitude rings
      const latSteps = [-0.6, -0.3, 0, 0.3, 0.6];
      latSteps.forEach((latY) => {
        const ringRad = Math.sqrt(Math.max(0, 1 - latY * latY));
        ctx.beginPath();
        for (let a = 0; a <= 36; a++) {
          const rad = (a / 36) * Math.PI * 2;
          const rx = Math.cos(rad) * ringRad;
          const rz = Math.sin(rad) * ringRad;
          const rot = rotatePoint3D(rx, latY, rz, rotation.x, rotation.y);
          const p = projectToScreen(rot, centerX, centerY, radius);
          if (a === 0) ctx.moveTo(p.screenX, p.screenY);
          else ctx.lineTo(p.screenX, p.screenY);
        }
        ctx.stroke();
      });
      ctx.restore();

      // 3. Project Nodes and Arcs
      const projectedNodes = projectNodes(sphereNodes, centerX, centerY, radius, rotation.x, rotation.y);
      const projectedArcs = projectArcs(
        dataset.dependencies,
        sphereNodes,
        centerX,
        centerY,
        radius,
        rotation.x,
        rotation.y
      );

      // 4. Draw Dependency Arcs (Split by depth for layering)
      projectedArcs.forEach((arc) => {
        const isConnectedToSelected =
          selectedAssetId && (arc.sourceId === selectedAssetId || arc.targetId === selectedAssetId);

        let strokeColor = 'rgba(56, 189, 248, 0.16)';
        let lineWidth = 1;

        if (isAfterTwin) {
          const srcState = getNodeVisualState(arc.sourceId);
          const tgtState = getNodeVisualState(arc.targetId);

          if (srcState === 'failed' || (srcState === 'affected' && tgtState === 'affected')) {
            strokeColor = 'rgba(249, 115, 22, 0.65)';
            lineWidth = arc.isFront ? 2.2 : 1.2;
          } else if (tgtState === 'recovered') {
            strokeColor = 'rgba(16, 185, 129, 0.7)';
            lineWidth = arc.isFront ? 2.2 : 1.2;
          }
        }

        if (isConnectedToSelected) {
          strokeColor = isAfterTwin ? '#f97316' : '#38bdf8';
          lineWidth = arc.isFront ? 2.5 : 1.5;
        }

        // Draw curve through points
        ctx.beginPath();
        arc.points.forEach((pt, idx) => {
          if (idx === 0) ctx.moveTo(pt.x, pt.y);
          else ctx.lineTo(pt.x, pt.y);
        });

        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = lineWidth;
        ctx.stroke();
      });

      // 5. Draw Infrastructure Nodes
      projectedNodes.forEach((node) => {
        const isSelected = node.asset.id === selectedAssetId;
        const isHovered = node.asset.id === hoveredAssetId;
        const isSectorFiltered =
          sectorFilter === 'ALL' ||
          node.asset.sector.toLowerCase() === sectorFilter.toLowerCase();

        const baseColor = node.color;
        let nodeFill = baseColor;
        let ringColor = 'transparent';
        let pulseRing = false;

        if (isAfterTwin) {
          const status = getNodeVisualState(node.asset.id);
          if (status === 'failed') {
            nodeFill = '#ef4444';
            ringColor = '#ef4444';
            pulseRing = true;
          } else if (status === 'affected') {
            nodeFill = '#f97316';
            ringColor = '#f97316';
          } else if (status === 'recovered') {
            nodeFill = '#10b981';
            ringColor = '#10b981';
          } else {
            // Healthy/unaffected
            nodeFill = isSectorFiltered ? baseColor : '#475569';
          }
        } else {
          // BEFORE: all healthy
          nodeFill = isSectorFiltered ? baseColor : '#475569';
        }

        const alpha = isSectorFiltered ? node.opacity : node.opacity * 0.35;
        const drawRadius = (isSelected || isHovered ? node.radius * 1.35 : node.radius) * (isSectorFiltered ? 1 : 0.85);

        ctx.save();
        ctx.globalAlpha = alpha;

        // Draw Outer Glow / Highlight Ring
        if (isSelected || isHovered || pulseRing) {
          ctx.beginPath();
          ctx.arc(node.screenX, node.screenY, drawRadius + 4, 0, Math.PI * 2);
          ctx.strokeStyle = ringColor !== 'transparent' ? ringColor : nodeFill;
          ctx.lineWidth = 2;
          ctx.stroke();
        }

        // Draw Core Node Circle
        ctx.beginPath();
        ctx.arc(node.screenX, node.screenY, drawRadius, 0, Math.PI * 2);
        ctx.fillStyle = nodeFill;
        ctx.fill();

        // White specular center for front-facing nodes
        if (node.isFront) {
          ctx.beginPath();
          ctx.arc(node.screenX, node.screenY, drawRadius * 0.45, 0, Math.PI * 2);
          ctx.fillStyle = '#ffffff';
          ctx.fill();
        }

        // Label on Hover or Selection
        if (node.isFront && (isSelected || isHovered)) {
          ctx.globalAlpha = 1.0;
          ctx.font = 'bold 11px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';

          const text = node.asset.name;
          const textWidth = ctx.measureText(text).width;
          const pillX = node.screenX - textWidth / 2 - 8;
          const pillY = node.screenY - drawRadius - 26;

          // Tooltip backdrop
          ctx.fillStyle = 'rgba(2, 6, 23, 0.92)';
          ctx.beginPath();
          ctx.roundRect(pillX, pillY, textWidth + 16, 20, 6);
          ctx.fill();
          ctx.strokeStyle = nodeFill;
          ctx.lineWidth = 1;
          ctx.stroke();

          // Tooltip text
          ctx.fillStyle = '#f8fafc';
          ctx.fillText(text, node.screenX, pillY + 14);
        }

        ctx.restore();
      });
    },
    [
      dataset,
      sphereNodes,
      rotation,
      selectedAssetId,
      hoveredAssetId,
      sectorFilter,
      isAnimatingChange,
      animatedStep,
      getNodeVisualState,
    ]
  );

  // Redraw both canvases whenever rotation, selection, or scenario changes
  useEffect(() => {
    renderSphereCanvas(canvasBeforeRef.current, false);
    renderSphereCanvas(canvasAfterRef.current, true);
  }, [renderSphereCanvas]);

  // Handle Canvas Resize
  useEffect(() => {
    const handleResize = () => {
      const resize = (canvas: HTMLCanvasElement | null) => {
        if (!canvas) return;
        const rect = canvas.parentElement?.getBoundingClientRect();
        if (rect && rect.width > 0) {
          const side = Math.min(Math.floor(rect.width), 460);
          canvas.width = side;
          canvas.height = side;
        }
      };
      resize(canvasBeforeRef.current);
      resize(canvasAfterRef.current);
      renderSphereCanvas(canvasBeforeRef.current, false);
      renderSphereCanvas(canvasAfterRef.current, true);
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [renderSphereCanvas]);

  // Selected Asset Causal Path
  const selectedAsset = useMemo(() => {
    if (!selectedAssetId || !dataset) return null;
    return dataset.assets.find((a) => a.id === selectedAssetId) || null;
  }, [selectedAssetId, dataset]);

  const whyPath = useMemo(() => {
    if (!dataset || !cascadeResult || !selectedAssetId) return [];
    return [...getWhyPath(dataset, cascadeResult, selectedAssetId)].reverse();
  }, [dataset, cascadeResult, selectedAssetId]);

  // Counts
  const totalOperatingBefore = dataset?.assets?.length || 0;
  const affectedCount = cascadeResult?.affectedNodes?.size || 0;
  const recoveredCount = fixResult?.savedAssetsCount || 0;

  // Empty State 1: No dataset
  if (!dataset || !dataset.assets || dataset.assets.length === 0) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center p-8 text-center bg-slate-950 text-slate-100">
        <div className="w-14 h-14 rounded-2xl bg-cyan-950/60 border border-cyan-800 flex items-center justify-center text-cyan-400 mb-4">
          <Sparkles className="w-7 h-7" />
        </div>
        <h2 className="text-xl font-black tracking-wider uppercase mb-2">CASCADE City Twin</h2>
        <p className="text-sm text-slate-400 max-w-sm mb-6">
          Load or upload city infrastructure data to create the interactive digital twin.
        </p>
        {onNavigateToHome && (
          <button
            onClick={onNavigateToHome}
            className="px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black text-xs uppercase tracking-wider shadow-lg shadow-cyan-500/20 cursor-pointer transition-all"
          >
            GO TO HOME
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="w-full h-full flex-1 flex flex-col bg-slate-950 text-slate-100 overflow-y-auto select-none relative">
      {/* 1. Header & Controls */}
      <div className="px-6 py-3 border-b border-slate-800/80 bg-slate-950/90 flex flex-wrap items-center justify-between gap-4 shrink-0 z-10">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-base font-black tracking-wider text-white uppercase">
              CASCADE City Twin
            </h1>
            <span className="px-2 py-0.5 rounded-md bg-cyan-950/80 border border-cyan-500/40 text-[10px] font-black text-cyan-400 uppercase tracking-widest">
              SCHEMATIC DIGITAL TWIN
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Before vs After Infrastructure • Rotate either sphere to inspect in 3D
          </p>
        </div>

        {/* Sector Filter Bar */}
        <div className="flex items-center gap-1 bg-slate-900/90 border border-slate-800 p-1 rounded-xl overflow-x-auto">
          {(
            [
              { id: 'ALL', label: 'ALL' },
              { id: 'Power', label: '⚡ POWER' },
              { id: 'Water', label: '💧 WATER' },
              { id: 'Transport', label: '🛣 TRANSPORT' },
              { id: 'Communication', label: '📡 COMMS' },
              { id: 'Health', label: '🏥 HEALTH' },
              { id: 'Emergency Services', label: '🚨 EMERGENCY' },
            ] as const
          ).map((sec) => (
            <button
              key={sec.id}
              onClick={() => setSectorFilter(sec.id)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer shrink-0 ${
                sectorFilter === sec.id
                  ? 'bg-cyan-500 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              {sec.label}
            </button>
          ))}
        </div>
      </div>

      {/* 2. Main Dual Spheres Container */}
      <div className="flex-1 flex flex-col justify-between px-6 py-4 max-w-6xl mx-auto w-full">
        {/* The Two Digital Twins */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center justify-center my-auto">
          {/* LEFT: BEFORE TWIN */}
          <div className="flex flex-col items-center">
            <div className="flex items-center justify-between w-full max-w-[420px] px-2 mb-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-black text-emerald-400 uppercase tracking-widest">
                  BEFORE
                </span>
                <span className="text-[11px] text-slate-400 font-medium">Normal City</span>
              </div>
              <div className="px-2 py-0.5 rounded-full bg-emerald-950/60 border border-emerald-500/30 text-[11px] font-bold text-emerald-400">
                {totalOperatingBefore} operating
              </div>
            </div>

            {/* Canvas Viewport */}
            <div className="relative w-full max-w-[420px] aspect-square flex items-center justify-center bg-slate-950/40 rounded-3xl border border-slate-800/60 p-2 shadow-2xl">
              <canvas
                ref={canvasBeforeRef}
                onPointerDown={handlePointerDown}
                onPointerMove={(e) => handlePointerMove(e, 'before')}
                onPointerUp={handlePointerUp}
                className="w-full h-full cursor-grab active:cursor-grabbing touch-none"
              />
              <div className="absolute bottom-3 left-4 text-[10px] text-slate-500 font-mono pointer-events-none">
                DRAG TO ROTATE
              </div>
            </div>
          </div>

          {/* RIGHT: AFTER TWIN */}
          <div className="flex flex-col items-center">
            <div className="flex items-center justify-between w-full max-w-[420px] px-2 mb-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-black text-amber-400 uppercase tracking-widest">
                  AFTER
                </span>
                <span className="text-[11px] text-slate-400 font-medium">
                  {afterViewMode === 'fix' ? 'After Intervention' : 'Cascade State'}
                </span>
              </div>

              <div className="flex items-center gap-2">
                {/* Mode Toggle (if action lab fix exists) */}
                {bestFix && (
                  <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg p-0.5 text-[10px] font-bold">
                    <button
                      onClick={() => setAfterViewMode('cascade')}
                      className={`px-2 py-0.5 rounded cursor-pointer ${
                        afterViewMode === 'cascade'
                          ? 'bg-amber-500/20 text-amber-400 font-black'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      CASCADE
                    </button>
                    <button
                      onClick={() => setAfterViewMode('fix')}
                      className={`px-2 py-0.5 rounded cursor-pointer ${
                        afterViewMode === 'fix'
                          ? 'bg-emerald-500/20 text-emerald-400 font-black'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      AFTER FIX
                    </button>
                  </div>
                )}

                <div
                  className={`px-2 py-0.5 rounded-full border text-[11px] font-bold ${
                    afterViewMode === 'fix'
                      ? 'bg-emerald-950/60 border-emerald-500/30 text-emerald-400'
                      : 'bg-amber-950/60 border-amber-500/30 text-amber-400'
                  }`}
                >
                  {afterViewMode === 'fix'
                    ? `${(cascadeResult?.affectedNodes.size || 0) - recoveredCount} affected (+${recoveredCount} protected)`
                    : `${affectedCount} affected`}
                </div>
              </div>
            </div>

            {/* Canvas Viewport */}
            {activeFailureId && cascadeResult ? (
              <div className="relative w-full max-w-[420px] aspect-square flex items-center justify-center bg-slate-950/40 rounded-3xl border border-slate-800/60 p-2 shadow-2xl">
                <canvas
                  ref={canvasAfterRef}
                  onPointerDown={handlePointerDown}
                  onPointerMove={(e) => handlePointerMove(e, 'after')}
                  onPointerUp={handlePointerUp}
                  className="w-full h-full cursor-grab active:cursor-grabbing touch-none"
                />
                <div className="absolute bottom-3 left-4 text-[10px] text-slate-500 font-mono pointer-events-none">
                  SYNCHRONIZED VIEW
                </div>
              </div>
            ) : (
              <div className="w-full max-w-[420px] aspect-square flex flex-col items-center justify-center bg-slate-950/40 rounded-3xl border-2 border-dashed border-slate-800 p-6 text-center">
                <AlertTriangle className="w-8 h-8 text-amber-400 mb-3" />
                <h3 className="text-sm font-bold text-slate-200 mb-1">
                  Run a Failure Test to compare the city
                </h3>
                <p className="text-xs text-slate-400 mb-4 max-w-xs">
                  Select an infrastructure node to simulate cascade failure and view the digital twin.
                </p>
                {onNavigateToFailureTest && (
                  <button
                    onClick={() => onNavigateToFailureTest()}
                    className="px-4 py-2 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-bold text-xs rounded-xl shadow-lg cursor-pointer transition-all"
                  >
                    TEST A FAILURE →
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 3. Action Bar: Show Change Button */}
        <div className="flex items-center justify-center gap-3 my-3">
          <button
            onClick={isAnimatingChange ? handleResetChange : handleTriggerShowChange}
            disabled={!cascadeResult}
            className={`px-5 py-2.5 rounded-2xl font-black text-xs uppercase tracking-wider flex items-center gap-2 shadow-xl cursor-pointer transition-all active:scale-98 ${
              isAnimatingChange
                ? 'bg-amber-500 text-slate-950 hover:bg-amber-400 shadow-amber-500/20'
                : 'bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-black shadow-cyan-500/20'
            }`}
          >
            {isAnimatingChange ? (
              <>
                <RotateCcw className="w-4 h-4 animate-spin" />
                <span>CASCADE PROPAGATING... STEP {animatedStep >= 0 ? animatedStep : ''}</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-current" />
                <span>SHOW CHANGE</span>
              </>
            )}
          </button>
        </div>

        {/* 4. Selected Infrastructure Comparison Card */}
        {selectedAsset ? (
          <div className="bg-slate-900/90 border border-slate-800/90 rounded-2xl p-4 shadow-xl mb-1">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm text-white">{selectedAsset.name}</span>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-slate-800 text-slate-300">
                  {selectedAsset.sector}
                </span>
              </div>

              {/* Status Comparison Chips */}
              <div className="flex items-center gap-4 text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-500 font-medium">BEFORE:</span>
                  <span className="text-emerald-400 font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Operating
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-500 font-medium">AFTER:</span>
                  {selectedAsset.id === activeFailureId ? (
                    <span className="text-red-400 font-bold flex items-center gap-1">
                      <Zap className="w-3.5 h-3.5" /> Initial Failure
                    </span>
                  ) : getNodeVisualState(selectedAsset.id) === 'affected' ? (
                    <span className="text-amber-400 font-bold flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5" /> Affected
                    </span>
                  ) : getNodeVisualState(selectedAsset.id) === 'recovered' ? (
                    <span className="text-emerald-400 font-bold flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5" /> Protected
                    </span>
                  ) : (
                    <span className="text-slate-400 font-medium">Unaffected</span>
                  )}
                </div>
              </div>
            </div>

            {/* Causal Chain Trace */}
            {whyPath.length > 1 ? (
              <div className="text-xs text-slate-300 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/80 flex items-center gap-2 overflow-x-auto">
                <span className="text-[11px] text-slate-400 font-bold uppercase tracking-wider shrink-0">
                  CAUSE:
                </span>
                <div className="flex items-center gap-1.5 shrink-0">
                  {whyPath.map((step, idx) => (
                    <React.Fragment key={step.assetId}>
                      <span
                        className={`font-semibold ${
                          step.isInitialFailure
                            ? 'text-red-400'
                            : idx === whyPath.length - 1
                            ? 'text-amber-300'
                            : 'text-slate-300'
                        }`}
                      >
                        {step.assetName}
                      </span>
                      {idx < whyPath.length - 1 && (
                        <ArrowRight className="w-3 h-3 text-slate-600 shrink-0" />
                      )}
                    </React.Fragment>
                  ))}
                </div>
              </div>
            ) : selectedAsset.id === activeFailureId ? (
              <div className="text-xs text-slate-400 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/80">
                <span className="text-red-400 font-bold">{selectedAsset.name}</span> is the initial origin failure point.
              </div>
            ) : null}
          </div>
        ) : (
          <div className="p-3 text-center text-xs text-slate-500 bg-slate-900/40 rounded-xl border border-slate-800/50">
            Click any node on either sphere to inspect its before/after state and causal dependency path.
          </div>
        )}
      </div>
    </div>
  );
};
