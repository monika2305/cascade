import type { Asset, InfrastructureDataset } from '../types/infrastructure';

export interface LayoutNode {
  asset: Asset;
  x: number;
  y: number;
  width: number;
  height: number;
  level: number;
}

export const NODE_WIDTH = 200;
export const NODE_HEIGHT = 58;
export const LAYER_X_GAP = 290;
export const LAYER_Y_GAP = 88;

// Deterministic sector sorting priority (upstream providers first, critical downstream last)
const SECTOR_PRIORITY: Record<string, number> = {
  Power: 1,
  Water: 2,
  Transport: 3,
  Communication: 4,
  'Emergency Services': 5,
  Health: 6,
};

function getSectorWeight(sector?: string): number {
  return (sector && SECTOR_PRIORITY[sector]) || 99;
}

/**
 * Computes a clean, deterministic layered DAG layout for infrastructure assets.
 * Layers are assigned via topological distance from root nodes (in-degree 0).
 * Within each layer, nodes are sorted using barycentric heuristics to minimize line crossings
 * and keep connected nodes vertically adjacent.
 * Nodes in each layer are centered vertically around y = 0.
 */
export function computeGraphLayout(dataset: InfrastructureDataset): Map<string, LayoutNode> {
  const nodes = new Map<string, LayoutNode>();
  if (!dataset.assets || dataset.assets.length === 0) return nodes;

  const inDegreeMap = new Map<string, number>();
  const incomingMap = new Map<string, string[]>();
  const outgoingMap = new Map<string, string[]>();

  for (const a of dataset.assets) {
    inDegreeMap.set(a.id, 0);
    incomingMap.set(a.id, []);
    outgoingMap.set(a.id, []);
  }

  for (const dep of dataset.dependencies) {
    if (outgoingMap.has(dep.source)) {
      outgoingMap.get(dep.source)!.push(dep.target);
    }
    if (incomingMap.has(dep.target)) {
      incomingMap.get(dep.target)!.push(dep.source);
    }
    if (inDegreeMap.has(dep.target)) {
      inDegreeMap.set(dep.target, (inDegreeMap.get(dep.target) || 0) + 1);
    }
  }

  // 1. Assign layers via topological BFS from root sources (in-degree 0)
  const layerMap = new Map<string, number>();
  const queue: string[] = [];

  // Sort root nodes deterministically by sector priority, then ID
  const roots = dataset.assets.filter((a) => (inDegreeMap.get(a.id) || 0) === 0);
  roots.sort((a, b) => getSectorWeight(a.sector) - getSectorWeight(b.sector) || a.id.localeCompare(b.id));

  for (const r of roots) {
    layerMap.set(r.id, 0);
    queue.push(r.id);
  }

  // Cycle fallback: if graph has no in-degree 0 nodes, seed with first asset
  if (queue.length === 0 && dataset.assets.length > 0) {
    layerMap.set(dataset.assets[0].id, 0);
    queue.push(dataset.assets[0].id);
  }

  const visitedCount = new Map<string, number>();
  while (queue.length > 0) {
    const u = queue.shift()!;
    const curLayer = layerMap.get(u) || 0;
    const count = visitedCount.get(u) || 0;
    if (count > dataset.assets.length * 3) continue; // cycle prevention
    visitedCount.set(u, count + 1);

    const neighbors = outgoingMap.get(u) || [];
    for (const v of neighbors) {
      const existingLayer = layerMap.get(v);
      if (existingLayer === undefined || existingLayer < curLayer + 1) {
        layerMap.set(v, curLayer + 1);
        queue.push(v);
      }
    }
  }

  // Handle any remaining unvisited nodes (e.g. disconnected components)
  for (const a of dataset.assets) {
    if (!layerMap.has(a.id)) {
      layerMap.set(a.id, 0);
    }
  }

  // 2. Group assets by layer
  const layerBuckets = new Map<number, Asset[]>();
  for (const a of dataset.assets) {
    const l = layerMap.get(a.id) || 0;
    if (!layerBuckets.has(l)) {
      layerBuckets.set(l, []);
    }
    layerBuckets.get(l)!.push(a);
  }

  const sortedLayers = Array.from(layerBuckets.keys()).sort((a, b) => a - b);

  // 3. Barycentric ordering to minimize crossing lines
  const nodeOrderIndex = new Map<string, number>();

  // Layer 0 initial ordering: sector priority, then ID
  if (layerBuckets.has(0)) {
    const l0 = layerBuckets.get(0)!;
    l0.sort((a, b) => getSectorWeight(a.sector) - getSectorWeight(b.sector) || a.id.localeCompare(b.id));
    l0.forEach((a, idx) => nodeOrderIndex.set(a.id, idx));
  }

  // Forward pass: order layer L by the average position of incoming parents in earlier layers
  for (let i = 1; i < sortedLayers.length; i++) {
    const layerIdx = sortedLayers[i];
    const assets = layerBuckets.get(layerIdx)!;

    assets.sort((a, b) => {
      const parentsA = incomingMap.get(a.id) || [];
      const parentsB = incomingMap.get(b.id) || [];

      const avgA = parentsA.length > 0
        ? parentsA.reduce((sum, pid) => sum + (nodeOrderIndex.get(pid) ?? 50), 0) / parentsA.length
        : 50;

      const avgB = parentsB.length > 0
        ? parentsB.reduce((sum, pid) => sum + (nodeOrderIndex.get(pid) ?? 50), 0) / parentsB.length
        : 50;

      if (Math.abs(avgA - avgB) > 0.001) {
        return avgA - avgB;
      }
      return getSectorWeight(a.sector) - getSectorWeight(b.sector) || a.id.localeCompare(b.id);
    });

    assets.forEach((a, idx) => nodeOrderIndex.set(a.id, idx));
  }

  // Backward pass: align parents closer to their target children
  for (let i = sortedLayers.length - 2; i >= 0; i--) {
    const layerIdx = sortedLayers[i];
    const assets = layerBuckets.get(layerIdx)!;

    assets.sort((a, b) => {
      const childrenA = outgoingMap.get(a.id) || [];
      const childrenB = outgoingMap.get(b.id) || [];

      const avgA = childrenA.length > 0
        ? childrenA.reduce((sum, cid) => sum + (nodeOrderIndex.get(cid) ?? 50), 0) / childrenA.length
        : nodeOrderIndex.get(a.id) ?? 50;

      const avgB = childrenB.length > 0
        ? childrenB.reduce((sum, cid) => sum + (nodeOrderIndex.get(cid) ?? 50), 0) / childrenB.length
        : nodeOrderIndex.get(b.id) ?? 50;

      if (Math.abs(avgA - avgB) > 0.001) {
        return avgA - avgB;
      }
      return getSectorWeight(a.sector) - getSectorWeight(b.sector) || a.id.localeCompare(b.id);
    });

    assets.forEach((a, idx) => nodeOrderIndex.set(a.id, idx));
  }

  // 4. Compute final coordinates: vertically center each column around y = 0
  sortedLayers.forEach((layerIdx) => {
    const assetsInLayer = layerBuckets.get(layerIdx)!;
    const totalHeight = assetsInLayer.length * LAYER_Y_GAP;
    const startY = -totalHeight / 2 + LAYER_Y_GAP / 2;

    assetsInLayer.forEach((asset, idxInLayer) => {
      nodes.set(asset.id, {
        asset,
        x: layerIdx * LAYER_X_GAP,
        y: startY + idxInLayer * LAYER_Y_GAP,
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
        level: layerIdx,
      });
    });
  });

  return nodes;
}
