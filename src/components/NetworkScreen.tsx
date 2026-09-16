import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import type { InfrastructureDataset, Asset } from '../types/infrastructure';
import { computeGraphLayout } from '../utils/graphLayout';
import { getSectorConfig } from '../utils/sectorConfig';
import { ZoomIn, ZoomOut, Maximize2, RotateCcw, X } from 'lucide-react';

interface NetworkScreenProps {
  dataset: InfrastructureDataset;
}

export const NetworkScreen: React.FC<NetworkScreenProps> = ({ dataset }) => {
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);

  // Pan & Zoom
  const [zoom, setZoom] = useState<number>(0.9);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const panStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement | null>(null);
  const initializedRef = useRef<boolean>(false);

  // Layout calculation
  const layoutNodes = useMemo(() => {
    return computeGraphLayout(dataset);
  }, [dataset]);

  // Compute dependency degrees
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

  // Readable Initial / Reset View: prioritizes immediate readability of nodes and names
  const resetToReadableGraph = useCallback(() => {
    if (!containerRef.current || layoutNodes.size === 0) return;
    const rect = containerRef.current.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const bounds = getGraphBounds();
    const readableZoom = 0.88;
    setZoom(readableZoom);

    // Center on the upstream entry layers so nodes and connections are immediately readable
    const targetX = bounds.minX + Math.min(bounds.graphWidth * 0.35, 420);
    const targetY = bounds.cy;
    setPan({
      x: rect.width / 2 - targetX * readableZoom,
      y: rect.height / 2 - targetY * readableZoom,
    });
  }, [layoutNodes, getGraphBounds]);

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

  return (
    <div className="w-full h-full flex-1 flex flex-col bg-slate-950 text-slate-100 overflow-hidden relative">
      {/* Header */}
      <div className="h-14 px-6 border-b border-slate-800/80 bg-slate-950/90 flex items-center justify-between shrink-0 z-10">
        <div>
          <h1 className="text-sm font-black text-white uppercase tracking-wider">
            YOUR CITY NETWORK
          </h1>
          <div className="text-xs font-mono text-cyan-400 mt-0.5">
            {dataset.assets.length} Services • {dataset.dependencies.length} Connections • {dataset.sectors.length} Sectors
          </div>
        </div>

        <div className="text-xs text-slate-500 hidden sm:block">
          Click any service to inspect its links
        </div>
      </div>

      {/* Main Full Viewport Graph Canvas */}
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
              id="net-arrow"
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
              id="net-arrow-selected"
              viewBox="0 0 10 10"
              refX="10"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#06b6d4" />
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

              const isLinked =
                selectedAsset?.id === dep.source || selectedAsset?.id === dep.target;

              return (
                <path
                  key={`dep-${idx}`}
                  d={pathD}
                  fill="none"
                  stroke={isLinked ? '#06b6d4' : '#334155'}
                  strokeWidth={isLinked ? 2.5 : 1.2}
                  markerEnd={isLinked ? 'url(#net-arrow-selected)' : 'url(#net-arrow)'}
                  className="transition-colors duration-200"
                />
              );
            })}

            {/* Asset Nodes */}
            {Array.from(layoutNodes.values()).map((node) => {
              const { asset } = node;
              const isSelected = selectedAsset?.id === asset.id;
              const sectorCfg = getSectorConfig(asset.sector);

              return (
                <g
                  key={asset.id}
                  transform={`translate(${node.x}, ${node.y})`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedAsset(asset);
                  }}
                  className="cursor-pointer group"
                >
                  {/* Selected glow */}
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

                  {/* Main Node Card */}
                  <rect
                    x={0}
                    y={0}
                    width={node.width}
                    height={node.height}
                    rx={10}
                    fill={isSelected ? '#1e293b' : '#0f172a'}
                    stroke={isSelected ? '#06b6d4' : '#334155'}
                    strokeWidth={isSelected ? 2 : 1.2}
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
                    fill="#f8fafc"
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
                    fill="#94a3b8"
                    fontSize="10"
                    fontWeight="500"
                    className="pointer-events-none"
                  >
                    {asset.sector}
                  </text>
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

        {/* Small Node Inspector Popup (only when a node is clicked) */}
        {selectedAsset && (
          <div className="absolute top-6 right-6 z-30 w-72 bg-slate-900/95 border border-slate-700 rounded-2xl shadow-2xl p-4.5 animate-fade-in backdrop-blur-md">
            <div className="flex items-start justify-between mb-3">
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
                <h4 className="text-sm font-bold text-white leading-tight">
                  {selectedAsset.name}
                </h4>
              </div>

              <button
                onClick={() => setSelectedAsset(null)}
                className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 cursor-pointer"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1.5 py-2.5 border-y border-slate-800 text-xs">
              <div className="flex justify-between text-slate-300">
                <span className="text-slate-400">Depends on:</span>
                <span className="font-mono font-bold text-white">
                  {inDegreeMap.get(selectedAsset.id) || 0} services
                </span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span className="text-slate-400">Supports:</span>
                <span className="font-mono font-bold text-cyan-300">
                  {outDegreeMap.get(selectedAsset.id) || 0} services
                </span>
              </div>
            </div>

            <button
              onClick={() => setSelectedAsset(null)}
              className="mt-3 w-full py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold cursor-pointer transition-colors"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
