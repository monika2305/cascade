import type { Asset, Dependency, InfrastructureDataset, Sector } from '../types/infrastructure';

export interface CascadeStepNode {
  assetId: string;
  step: number;
  parentAssetId?: string;
  dependencyType?: string;
  path: string[];
}

export interface CascadeResult {
  initialFailureId: string;
  affectedNodes: Map<string, CascadeStepNode>;
  affectedOrder: string[];
  totalSteps: number;
  sectorsReached: Sector[];
  affectedEdges: Set<string>;
}

export interface WhyStep {
  assetId: string;
  assetName: string;
  sector: Sector;
  dependencyType?: string;
  isInitialFailure: boolean;
}

/**
 * Runs deterministic downstream reachability simulation from a specified failure node.
 * Uses Breadth-First Search (BFS) to compute the exact propagation step for each affected asset.
 * Guarantees:
 * - Cycle safe (visited set terminates on loops)
 * - Branching safe (each node reached at its earliest step, counted once)
 * - Zero randomness / zero hardcoded values
 */
export function simulateCascade(
  dataset: InfrastructureDataset,
  failedAssetId: string
): CascadeResult {
  const assetMap = new Map<string, Asset>();
  for (const a of dataset.assets) {
    assetMap.set(a.id, a);
  }

  // Build adjacency map: source -> list of dependencies
  const adjacency = new Map<string, Dependency[]>();
  for (const dep of dataset.dependencies) {
    if (!dep.source || !dep.target) continue;
    const list = adjacency.get(dep.source) || [];
    list.push(dep);
    adjacency.set(dep.source, list);
  }

  const affectedNodes = new Map<string, CascadeStepNode>();
  const affectedOrder: string[] = [];
  const affectedEdges = new Set<string>();
  const sectorsSet = new Set<Sector>();

  const initialAsset = assetMap.get(failedAssetId);
  if (initialAsset) {
    sectorsSet.add(initialAsset.sector);
  }

  // Step 0: Initial Failure
  affectedNodes.set(failedAssetId, {
    assetId: failedAssetId,
    step: 0,
    path: [failedAssetId],
  });
  affectedOrder.push(failedAssetId);

  // BFS Queue: [currentAssetId, currentStep]
  const queue: [string, number][] = [[failedAssetId, 0]];
  const visited = new Set<string>([failedAssetId]);
  let maxStep = 0;

  while (queue.length > 0) {
    const [currentId, currentStep] = queue.shift()!;
    const outgoing = adjacency.get(currentId) || [];

    for (const edge of outgoing) {
      const targetId = edge.target;
      const targetAsset = assetMap.get(targetId);

      // Record affected edge
      affectedEdges.add(`${edge.source}->${edge.target}`);

      if (!visited.has(targetId)) {
        visited.add(targetId);
        const nextStep = currentStep + 1;
        maxStep = Math.max(maxStep, nextStep);

        const currentPath = affectedNodes.get(currentId)?.path || [currentId];
        const newPath = [...currentPath, targetId];

        affectedNodes.set(targetId, {
          assetId: targetId,
          step: nextStep,
          parentAssetId: currentId,
          dependencyType: edge.type || 'connected_to',
          path: newPath,
        });

        affectedOrder.push(targetId);

        if (targetAsset) {
          sectorsSet.add(targetAsset.sector);
        }

        queue.push([targetId, nextStep]);
      }
    }
  }

  return {
    initialFailureId: failedAssetId,
    affectedNodes,
    affectedOrder,
    totalSteps: maxStep,
    sectorsReached: Array.from(sectorsSet),
    affectedEdges,
  };
}

/**
 * Generates an explainable causation path for an affected node tracing back to the initial failure.
 * Reads directly from graph dependencies and simulation results.
 */
export function getWhyPath(
  dataset: InfrastructureDataset,
  cascadeResult: CascadeResult,
  targetAssetId: string
): WhyStep[] {
  const assetMap = new Map<string, Asset>();
  for (const a of dataset.assets) {
    assetMap.set(a.id, a);
  }

  const nodeInfo = cascadeResult.affectedNodes.get(targetAssetId);
  if (!nodeInfo) return [];

  // Build edge lookup map: "source->target" -> Dependency
  const edgeMap = new Map<string, Dependency>();
  for (const d of dataset.dependencies) {
    edgeMap.set(`${d.source}->${d.target}`, d);
  }

  const pathIds = nodeInfo.path;
  const result: WhyStep[] = [];

  // Construct steps in reverse order (Target up to Initial Failure)
  for (let i = pathIds.length - 1; i >= 0; i--) {
    const id = pathIds[i];
    const asset = assetMap.get(id);
    const isInitial = i === 0;

    let dependencyType: string | undefined;
    if (i > 0) {
      const parentId = pathIds[i - 1];
      const edge = edgeMap.get(`${parentId}->${id}`);
      dependencyType = edge?.type || 'connected_to';
    }

    result.push({
      assetId: id,
      assetName: asset?.name || id,
      sector: asset?.sector || 'Other',
      dependencyType,
      isInitialFailure: isInitial,
    });
  }

  return result;
}
