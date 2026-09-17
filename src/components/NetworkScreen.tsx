import React, { useState, useMemo, useRef } from 'react';
import type { InfrastructureDataset, Asset } from '../types/infrastructure';
import { computeGraphLayout } from '../utils/graphLayout';
import { getSectorConfig, getSectorOrderIndex } from '../utils/sectorConfig';
import { useGraphViewport } from '../hooks/useGraphViewport';
import { GraphControls } from './GraphControls';
import { X } from 'lucide-react';

interface NetworkScreenProps {
  dataset: InfrastructureDataset;
}

export const NetworkScreen: React.FC<NetworkScreenProps> = ({ dataset }) => {
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [hoveredAssetId, setHoveredAssetId] = useState<string | null>(null);
  const [activeSectorFilter, setActiveSectorFilter] = useState<string | null>(null);
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
    padding: 28,
    minZoom: 0.25,
    maxZoom: 2.5,
    targetMaxZoom: 1.85,
    targetOccupancy: 0.88,
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

  // Unique sorted sectors in the dataset
  const uniqueSectors = useMemo(() => {
    const set = new Set<string>();
    dataset.assets.forEach((a) => {
      if (a.sector) set.add(a.sector);
    });
    return Array.from(set).sort((a, b) => getSectorOrderIndex(a) - getSectorOrderIndex(b));
  }, [dataset.assets]);

  // Connected nodes and edges for hover/selection highlight
  const activeFocusId = selectedAsset?.id || hoveredAssetId;

  const { connectedNodeIds, connectedEdgeKeys } = useMemo(() => {
    if (!activeFocusId) {
      return { connectedNodeIds: new Set<string>(), connectedEdgeKeys: new Set<string>() };
    }
    const nodes = new Set<string>([activeFocusId]);
    const edges = new Set<string>();

    for (const dep of dataset.dependencies) {
      if (dep.source === activeFocusId) {
        nodes.add(dep.target);
        edges.add(`${dep.source}->${dep.target}`);
      }
      if (dep.target === activeFocusId) {
        nodes.add(dep.source);
        edges.add(`${dep.source}->${dep.target}`);
      }
    }
    return { connectedNodeIds: nodes, connectedEdgeKeys: edges };
  }, [activeFocusId, dataset.dependencies]);

  return (
    <div className="w-full h-full flex-1 flex flex-col bg-[#061019] text-[#f2f4f0] overflow-hidden relative select-none">
      {/* 1. Header with Eyebrow, Title, and Dataset Stats */}
      <div className="h-14 px-6 border-b border-[#182c3f] bg-[#071321]/90 flex items-center justify-between shrink-0 z-10 backdrop-blur-md">
        <div>
          <div className="flex items-center gap-1.5 text-[9px] font-medium tracking-[0.2em] text-[#b9cecf] uppercase">
            <span className="w-3 h-px bg-[#addcd7]" />
            <span>Infrastructure Topology</span>
          </div>
          <div className="flex items-center gap-3">
            <h1 className="text-xs font-semibold text-[#f2f4f0] uppercase tracking-wider">
              City Infrastructure Network
            </h1>
            <span className="text-[10px] text-[#8096a4] font-mono">
              {dataset.assets.length} Services • {dataset.dependencies.length} Connections • {uniqueSectors.length} Sectors
            </span>
          </div>
        </div>

        <div className="text-[11px] text-[#8096a4] hidden sm:block">
          Select any infrastructure node to inspect links & dependencies
        </div>
      </div>

      {/* 2. Main Full Viewport Graph Canvas */}
      <div
        ref={containerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        className={`flex-1 w-full h-full relative select-none overflow-hidden bg-[#061019] ${
          isDragging ? 'cursor-grabbing' : 'cursor-grab'
        }`}
      >
        {/* Floating Sector Legend Bar at Top Left */}
        <div className="absolute top-4 left-6 z-20 flex flex-wrap items-center gap-1.5 bg-[#071321]/90 border border-[#182c3f] rounded-xl p-1.5 backdrop-blur-md shadow-xl">
          {uniqueSectors.map((sector) => {
            const cfg = getSectorConfig(sector);
            const Icon = cfg.icon;
            const isActive = activeSectorFilter === sector;

            return (
              <button
                key={sector}
                type="button"
                onClick={() => setActiveSectorFilter(isActive ? null : sector)}
                className={`px-3 py-1 rounded-lg flex items-center gap-1.5 text-xs font-medium cursor-pointer transition-all ${
                  isActive
                    ? 'bg-[#0d1e2e] text-white border border-[#a8e2dc]/60 shadow-sm'
                    : 'text-[#a9b9c3] hover:text-white hover:bg-[#0a1726]'
                }`}
                title={`Filter by ${sector}`}
              >
                <Icon className="w-3.5 h-3.5" style={{ color: cfg.hex }} />
                <span>{sector.replace(' Services', '')}</span>
              </button>
            );
          })}
          {activeSectorFilter && (
            <button
              type="button"
              onClick={() => setActiveSectorFilter(null)}
              className="px-2 py-0.5 rounded text-[10px] text-[#8096a4] hover:text-white cursor-pointer ml-1"
            >
              Clear
            </button>
          )}
        </div>

        {/* SVG Visualization Canvas */}
        <svg className="w-full h-full pointer-events-auto">
          <defs>
            {/* Dotted Canvas Grid Pattern */}
            <pattern
              id="net-dot-grid"
              width="24"
              height="24"
              patternUnits="userSpaceOnUse"
            >
              <circle cx="2" cy="2" r="1.1" fill="#1e3850" opacity="0.75" />
            </pattern>

            {/* Sector Arrowhead Markers */}
            {uniqueSectors.map((sec) => {
              const cfg = getSectorConfig(sec);
              const id = `arrow-${sec.replace(/\s+/g, '-')}`;
              return (
                <marker
                  key={id}
                  id={id}
                  viewBox="0 0 10 10"
                  refX="8"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill={cfg.hex} />
                </marker>
              );
            })}

            {/* Default Arrowhead Marker */}
            <marker
              id="arrow-default"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#8096a4" />
            </marker>
          </defs>

          {/* Dotted Canvas Grid Background */}
          <rect width="100%" height="100%" fill="url(#net-dot-grid)" className="pointer-events-none" />

          {/* Zoomable & Pannable Graph Group */}
          <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
            {/* 1. Smooth Curved Dependency Connections */}
            {dataset.dependencies.map((dep, idx) => {
              const src = layoutNodes.get(dep.source);
              const tgt = layoutNodes.get(dep.target);
              if (!src || !tgt) return null;

              const srcCfg = getSectorConfig(src.asset.sector);
              const isDirectlyConnected = connectedEdgeKeys.has(`${dep.source}->${dep.target}`);
              const isDimmed =
                (activeFocusId && !isDirectlyConnected) ||
                (activeSectorFilter &&
                  src.asset.sector !== activeSectorFilter &&
                  tgt.asset.sector !== activeSectorFilter);

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

              const markerId = `arrow-${src.asset.sector.replace(/\s+/g, '-')}`;

              return (
                <path
                  key={`${dep.source}-${dep.target}-${idx}`}
                  d={pathD}
                  fill="none"
                  stroke={srcCfg.hex}
                  strokeWidth={isDirectlyConnected ? 2.2 : 1.4}
                  strokeOpacity={isDirectlyConnected ? 1 : isDimmed ? 0.12 : 0.65}
                  markerEnd={`url(#${markerId})`}
                  className="transition-all duration-200"
                />
              );
            })}

            {/* 2. Upgraded Infrastructure Node Cards */}
            {Array.from(layoutNodes.values()).map((node) => {
              const { asset } = node;
              const isSelected = selectedAsset?.id === asset.id;
              const isHovered = hoveredAssetId === asset.id;
              const isConnected = connectedNodeIds.has(asset.id);
              const isSectorFiltered = activeSectorFilter && asset.sector === activeSectorFilter;
              const isDimmedNode =
                (activeFocusId && !isConnected) ||
                (activeSectorFilter && !isSectorFiltered);

              const sectorCfg = getSectorConfig(asset.sector);
              const SectorIcon = sectorCfg.icon;

              return (
                <g
                  key={asset.id}
                  transform={`translate(${node.x}, ${node.y})`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedAsset(asset);
                  }}
                  onMouseEnter={() => setHoveredAssetId(asset.id)}
                  onMouseLeave={() => setHoveredAssetId(null)}
                  className="cursor-pointer group"
                >
                  {/* Outer Glow on Selected or Hovered */}
                  {(isSelected || isHovered) && (
                    <rect
                      x={-3}
                      y={-3}
                      width={node.width + 6}
                      height={node.height + 6}
                      rx={17}
                      fill="none"
                      stroke={sectorCfg.hex}
                      strokeWidth={isSelected ? 2.5 : 1.5}
                      strokeOpacity={isSelected ? 0.85 : 0.45}
                      style={{ filter: `drop-shadow(0 0 10px ${sectorCfg.glowHex})` }}
                    />
                  )}

                  {/* Main Node Card Surface */}
                  <rect
                    x={0}
                    y={0}
                    width={node.width}
                    height={node.height}
                    rx={14}
                    fill="#08131e"
                    stroke={isSelected ? '#ffffff' : sectorCfg.borderHex}
                    strokeWidth={isSelected ? 2 : 1.3}
                    strokeOpacity={isDimmedNode ? 0.35 : 1}
                    className="transition-all duration-200"
                  />

                  {/* Left Icon Container Box */}
                  <rect
                    x={10}
                    y={10}
                    width={36}
                    height={36}
                    rx={9}
                    fill={sectorCfg.bgHex}
                    stroke={sectorCfg.borderHex}
                    strokeWidth={1}
                    strokeOpacity={isDimmedNode ? 0.2 : 0.45}
                  />

                  <foreignObject x={10} y={10} width={36} height={36} className="pointer-events-none">
                    <div
                      className="w-full h-full flex items-center justify-center transition-opacity"
                      style={{ color: sectorCfg.hex, opacity: isDimmedNode ? 0.35 : 1 }}
                    >
                      <SectorIcon className="w-4 h-4" />
                    </div>
                  </foreignObject>

                  {/* Asset Name Label */}
                  <text
                    x={56}
                    y={26}
                    fill={isDimmedNode ? '#64748b' : '#f2f4f0'}
                    fontSize="12.5"
                    fontWeight="600"
                    className="pointer-events-none tracking-tight select-none"
                  >
                    {asset.name.length > 17
                      ? asset.name.substring(0, 15) + '...'
                      : asset.name}
                  </text>

                  {/* Sector Subtitle Label */}
                  <text
                    x={56}
                    y={43}
                    fill={isDimmedNode ? '#475569' : '#8096a4'}
                    fontSize="10"
                    fontWeight="400"
                    className="pointer-events-none tracking-wide select-none"
                  >
                    {asset.sector}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>

        {/* 3. Reusable Vertical Graph Controls (Right Side) */}
        <GraphControls
          onZoomIn={zoomIn}
          onZoomOut={zoomOut}
          onFit={() => fitGraph()}
          className="absolute right-6 bottom-6 z-20"
        />

        {/* 4. Small Node Inspector Popup (when a node is selected) */}
        {selectedAsset && (
          <div className="absolute top-6 right-6 z-30 w-72 bg-[#0a1726]/95 border border-[#84979a35] rounded-xl shadow-2xl p-4.5 animate-in fade-in zoom-in-95 duration-150 backdrop-blur-md">
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: getSectorConfig(selectedAsset.sector).hex }}
                  />
                  <span
                    className="text-[10px] font-semibold uppercase tracking-wider"
                    style={{ color: getSectorConfig(selectedAsset.sector).hex }}
                  >
                    {selectedAsset.sector}
                  </span>
                </div>
                <h4 className="text-sm font-semibold text-[#f2f4f0] leading-tight">
                  {selectedAsset.name}
                </h4>
              </div>

              <button
                onClick={() => setSelectedAsset(null)}
                className="p-1 text-[#8096a4] hover:text-[#f2f4f0] rounded-md hover:bg-[#071321] cursor-pointer"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1.5 py-2.5 border-y border-[#182c3f] text-xs">
              <div className="flex justify-between text-[#8096a4]">
                <span>Depends on:</span>
                <span className="font-mono font-semibold text-[#f2f4f0]">
                  {inDegreeMap.get(selectedAsset.id) || 0} services
                </span>
              </div>
              <div className="flex justify-between text-[#8096a4]">
                <span>Supports:</span>
                <span className="font-mono font-semibold text-[#a8e2dc]">
                  {outDegreeMap.get(selectedAsset.id) || 0} services
                </span>
              </div>
            </div>

            <button
              onClick={() => setSelectedAsset(null)}
              className="mt-3 w-full py-1.5 rounded-md bg-[#071321] hover:bg-[#0d1e30] border border-[#84979a40] text-[#f2f4f0] text-xs font-semibold cursor-pointer transition-colors"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
