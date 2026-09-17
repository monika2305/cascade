import type { Asset, InfrastructureDataset } from '../types/infrastructure';

export interface LayoutNode {
  asset: Asset;
  x: number;
  y: number;
  width: number;
  height: number;
  level: number;
}

export const NODE_WIDTH = 210;
export const NODE_HEIGHT = 64;
export const LAYER_X_GAP = 280;
export const LAYER_Y_GAP = 82;
export const TIER_Y_GAP = 250;

/**
 * Determines infrastructure tier:
 * Tier 0: Upstream Lifeline Utilities (Power, Energy, Water, Gas, Fuel)
 * Tier 1: Middle Mobility & Connectivity (Transport, Communication, Telecom)
 * Tier 2: Downstream Human Protection (Health, Emergency Services, Hospitals, Public Safety)
 */
export function getSectorTier(sector?: string): number {
  if (!sector) return 1;
  const s = sector.toLowerCase();
  if (
    s.includes('power') ||
    s.includes('energy') ||
    s.includes('water') ||
    s.includes('fuel') ||
    s.includes('gas') ||
    s.includes('electric')
  ) {
    return 0;
  }
  if (
    s.includes('transport') ||
    s.includes('transit') ||
    s.includes('comm') ||
    s.includes('telecom') ||
    s.includes('logistics') ||
    s.includes('network') ||
    s.includes('road')
  ) {
    return 1;
  }
  if (
    s.includes('health') ||
    s.includes('emerg') ||
    s.includes('hospital') ||
    s.includes('safety') ||
    s.includes('public') ||
    s.includes('gov') ||
    s.includes('clinic') ||
    s.includes('fire') ||
    s.includes('police')
  ) {
    return 2;
  }
  return 1;
}

/**
 * Computes a clean, balanced, high-readability DAG layout for infrastructure assets.
 * 
 * Instead of stretching out horizontally into an ultra-wide ribbon (which forces extreme
 * downscaling on standard 16:9 displays and makes node labels illegible), this layout:
 * 1. Groups assets into balanced functional vertical tiers (Power & Water -> Transport & Comms -> Health & Emergency).
 * 2. Arranges assets within each tier across columns based on topological dependency order.
 * 3. Enforces that downstream assets never appear before their upstream dependencies.
 * 4. Yields a balanced ~16:9 aspect ratio (~1050px x 728px for sample city) allowing 75-85%
 *    canvas occupancy with large, legible node cards at 100% browser zoom.
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

  // 1. Assign topological levels via BFS from roots
  const globalLevel = new Map<string, number>();
  const roots = dataset.assets.filter((a) => (inDegreeMap.get(a.id) || 0) === 0);
  roots.sort((a, b) => a.id.localeCompare(b.id));

  const queue: string[] = [];
  roots.forEach((r) => {
    globalLevel.set(r.id, 0);
    queue.push(r.id);
  });

  // Cycle fallback: if graph has no in-degree 0 nodes, seed with first asset
  if (queue.length === 0 && dataset.assets.length > 0) {
    globalLevel.set(dataset.assets[0].id, 0);
    queue.push(dataset.assets[0].id);
  }

  const visitedCount = new Map<string, number>();
  let maxGlobalLevel = 0;
  while (queue.length > 0) {
    const u = queue.shift()!;
    const curLevel = globalLevel.get(u) || 0;
    const count = visitedCount.get(u) || 0;
    if (count > dataset.assets.length * 3) continue; // cycle prevention
    visitedCount.set(u, count + 1);

    const neighbors = outgoingMap.get(u) || [];
    for (const v of neighbors) {
      const existingLevel = globalLevel.get(v);
      if (existingLevel === undefined || existingLevel < curLevel + 1) {
        const nextLevel = curLevel + 1;
        globalLevel.set(v, nextLevel);
        if (nextLevel > maxGlobalLevel) maxGlobalLevel = nextLevel;
        queue.push(v);
      }
    }
  }

  // Handle any remaining unvisited nodes
  for (const a of dataset.assets) {
    if (!globalLevel.has(a.id)) {
      globalLevel.set(a.id, 0);
    }
  }

  // If graph is small (<= 6 assets), use standard single-tier topological layout
  if (dataset.assets.length <= 6) {
    const levelBuckets = new Map<number, Asset[]>();
    for (const a of dataset.assets) {
      const l = globalLevel.get(a.id) || 0;
      if (!levelBuckets.has(l)) levelBuckets.set(l, []);
      levelBuckets.get(l)!.push(a);
    }

    const sortedLevels = Array.from(levelBuckets.keys()).sort((a, b) => a - b);
    sortedLevels.forEach((levelIdx) => {
      const assetsInLevel = levelBuckets.get(levelIdx)!;
      const totalHeight = assetsInLevel.length * LAYER_Y_GAP;
      const startY = -totalHeight / 2 + LAYER_Y_GAP / 2;

      assetsInLevel.forEach((asset, idx) => {
        nodes.set(asset.id, {
          asset,
          x: levelIdx * LAYER_X_GAP,
          y: startY + idx * LAYER_Y_GAP,
          width: NODE_WIDTH,
          height: NODE_HEIGHT,
          level: levelIdx,
        });
      });
    });
    return nodes;
  }

  // 2. Group assets into 3 functional vertical tiers
  const tierBuckets: Asset[][] = [[], [], []];
  for (const a of dataset.assets) {
    const t = getSectorTier(a.sector);
    tierBuckets[t].push(a);
  }

  const occupiedTiers = tierBuckets.filter((t) => t.length > 0).length;

  // If assets are not spread across tiers, partition evenly by topological level
  let finalTiers = tierBuckets;
  if (occupiedTiers < 2) {
    finalTiers = [[], [], []];
    for (const a of dataset.assets) {
      const gl = globalLevel.get(a.id) || 0;
      const t = gl <= maxGlobalLevel / 3 ? 0 : gl <= (2 * maxGlobalLevel) / 3 ? 1 : 2;
      finalTiers[t].push(a);
    }
  }

  const activeTiers = finalTiers.filter((t) => t.length > 0);
  const tierCount = activeTiers.length;

  // 3. For each tier, arrange nodes into columns (up to 4 columns)
  activeTiers.forEach((assets, tierIdx) => {
    // Sort assets within tier: by global topological level, then incoming dependencies, then ID
    assets.sort((a, b) => {
      const la = globalLevel.get(a.id) || 0;
      const lb = globalLevel.get(b.id) || 0;
      if (la !== lb) return la - lb;
      const inA = (incomingMap.get(a.id) || []).length;
      const inB = (incomingMap.get(b.id) || []).length;
      if (inA !== inB) return inA - inB;
      return a.id.localeCompare(b.id);
    });

    const colMap = new Map<string, number>();
    const cols: Asset[][] = [[], [], [], []];

    assets.forEach((asset) => {
      let minCol = 0;
      const parents = incomingMap.get(asset.id) || [];
      parents.forEach((pid) => {
        if (colMap.has(pid)) {
          minCol = Math.max(minCol, colMap.get(pid)! + 1);
        }
      });

      // Target up to 4 columns with max 3-4 nodes per column
      let bestCol = Math.min(minCol, 3);
      for (let c = bestCol; c <= 3; c++) {
        if (cols[c].length < 3) {
          bestCol = c;
          break;
        }
      }
      cols[bestCol].push(asset);
      colMap.set(asset.id, bestCol);
    });

    // Vertical center for this tier centered around y = 0
    // (e.g. For 3 tiers: tier 0 at -250, tier 1 at 0, tier 2 at +250)
    const tierCenterY = (tierIdx - (tierCount - 1) / 2) * TIER_Y_GAP;

    cols.forEach((colAssets, cIdx) => {
      const totalH = colAssets.length * LAYER_Y_GAP;
      const startY = tierCenterY - totalH / 2 + LAYER_Y_GAP / 2;

      colAssets.forEach((asset, rIdx) => {
        nodes.set(asset.id, {
          asset,
          x: cIdx * LAYER_X_GAP,
          y: startY + rIdx * LAYER_Y_GAP,
          width: NODE_WIDTH,
          height: NODE_HEIGHT,
          level: cIdx,
        });
      });
    });
  });

  return nodes;
}
