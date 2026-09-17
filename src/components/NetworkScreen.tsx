import React, { useState, useMemo, useRef } from 'react';
import type { InfrastructureDataset, Asset } from '../types/infrastructure';
import { computeGraphLayout } from '../utils/graphLayout';
import { getSectorConfig } from '../utils/sectorConfig';
import { useGraphViewport } from '../hooks/useGraphViewport';
import { GraphControls } from './GraphControls';
import { X } from 'lucide-react';

interface NetworkScreenProps {
  dataset: InfrastructureDataset;
}

export const NetworkScreen: React.FC<NetworkScreenProps> = ({ dataset }) => {
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Layout calculation
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
    padding: 80,
    minZoom: 0.25,
    maxZoom: 2.2,
    targetMaxZoom: 1.05,
  });

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

  return (
    <div className="w-full h-full flex-1 flex flex-col bg-slate-950 text-slate-100 overflow-hidden relative">
      {/* Header */}
      <div className="h-14 px-6 border-b border-slate-800/80 bg-slate-950/90 flex items-center justify-between shrink-0 z-10">
        <div>
          <h1 className="text-sm font-black text-white uppercase tracking-wider">
            YOUR CITY NETWORK
          </h1>
          <div className="text-xs font-mono text-cyan-400 mt-0.5">
            {dataset.assets.length} Services • {dataset.dependencies.length} Connections • {(dataset.sectors || []).length} Sectors
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

        {/* Graph Controls */}
        <GraphControls
          onZoomIn={zoomIn}
          onZoomOut={zoomOut}
          onFit={() => fitGraph()}
          className="absolute right-6 bottom-6"
        />

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
