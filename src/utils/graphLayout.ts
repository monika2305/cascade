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
export const LAYER_X_GAP = 280;
export const LAYER_Y_GAP = 95;

/**
 * Computes a clean, deterministic layered DAG layout for infrastructure assets.
 * Layers are assigned via topological distance from root nodes (in-degree 0).
 * Nodes in each layer are centered vertically around y = 0.
 */
export function computeGraphLayout(dataset: InfrastructureDataset): Map<string, LayoutNode> {
  const nodes = new Map<string, LayoutNode>();
  if (!dataset.assets || dataset.assets.length === 0) return nodes;

  const inDegreeMap = new Map<string, number>();
  const outgoingMap = new Map<string, string[]>();

  for (const a of dataset.assets) {
    inDegreeMap.set(a.id, 0);
    outgoingMap.set(a.id, []);
  }

  for (const dep of dataset.dependencies) {
    if (outgoingMap.has(dep.source)) {
      outgoingMap.get(dep.source)!.push(dep.target);
    }
    if (inDegreeMap.has(dep.target)) {
      inDegreeMap.set(dep.target, (inDegreeMap.get(dep.target) || 0) + 1);
    }
  }

  // Assign layers via longest path / BFS from roots
  const layerMap = new Map<string, number>();
  const queue: string[] = [];

  for (const [id, deg] of inDegreeMap.entries()) {
    if (deg === 0) {
      layerMap.set(id, 0);
      queue.push(id);
    }
  }

  // If graph has cycles with no in-degree 0 nodes, pick the first asset as layer 0
  if (queue.length === 0 && dataset.assets.length > 0) {
    layerMap.set(dataset.assets[0].id, 0);
    queue.push(dataset.assets[0].id);
  }

  const visitedCount = new Map<string, number>();

  while (queue.length > 0) {
    const u = queue.shift()!;
    const curLayer = layerMap.get(u) || 0;
    const count = visitedCount.get(u) || 0;
    if (count > dataset.assets.length * 2) continue; // cycle prevention
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

  // Group assets by layer
  const layerBuckets = new Map<number, Asset[]>();
  for (const a of dataset.assets) {
    const l = layerMap.get(a.id) || 0;
    if (!layerBuckets.has(l)) {
      layerBuckets.set(l, []);
    }
    layerBuckets.get(l)!.push(a);
  }

  // Compute coordinates: vertically center each column around y = 0
  const sortedLayers = Array.from(layerBuckets.keys()).sort((a, b) => a - b);
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
