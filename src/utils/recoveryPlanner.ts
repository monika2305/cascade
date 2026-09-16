import type { Asset, Dependency, InfrastructureDataset, Sector } from '../types/infrastructure';
import { simulateCascade, type CascadeResult, type CascadeStepNode } from './cascade';

export interface RestorationCandidate {
  assetId: string;
  assetName: string;
  sector: Sector;
  servicesRecovered: number;
  recoveredAssetIds: string[];
  explanation: string;
}

export interface RecoveryPlanStep {
  stepNumber: number;
  assetId: string;
  assetName: string;
  sector: Sector;
  servicesRecovered: number;
  cumulativeRecovered: number;
  recoveredAssetIds: string[];
  remainingAffectedCount: number;
  explanation: string;
}

export interface RecoveryPlanResult {
  initialFailureId: string;
  initialAffectedCount: number;
  steps: RecoveryPlanStep[];
  unrestoredAssetIds: string[];
  hasImprovements: boolean;
}

/**
 * Runs deterministic cascade simulation from failedAssetId, but where a set of
 * restored assets are operational and intercept/stop the cascade from propagating through them.
 */
export function simulateCascadeWithRestorations(
  dataset: InfrastructureDataset,
  failedAssetId: string,
  restoredAssetIds: Set<string>
): CascadeResult {
  const assetMap = new Map<string, Asset>();
  for (const a of dataset.assets) {
    assetMap.set(a.id, a);
  }

  // If the initial failure itself was restored, 0 nodes fail
  if (restoredAssetIds.has(failedAssetId)) {
    return {
      initialFailureId: failedAssetId,
      affectedNodes: new Map(),
      affectedOrder: [],
      totalSteps: 0,
      sectorsReached: [],
      affectedEdges: new Set(),
    };
  }

  // Build adjacency: source -> list of outgoing dependencies
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

  affectedNodes.set(failedAssetId, {
    assetId: failedAssetId,
    step: 0,
    path: [failedAssetId],
  });
  affectedOrder.push(failedAssetId);

  const queue: [string, number][] = [[failedAssetId, 0]];
  const visited = new Set<string>([failedAssetId]);
  let maxStep = 0;

  while (queue.length > 0) {
    const [currentId, currentStep] = queue.shift()!;
    const outgoing = adjacency.get(currentId) || [];

    for (const edge of outgoing) {
      const targetId = edge.target;
      const targetAsset = assetMap.get(targetId);

      affectedEdges.add(`${edge.source}->${edge.target}`);

      // If targetId has been RESTORED, the failure is blocked here!
      // It is operational and does not fail or propagate failure further.
      if (restoredAssetIds.has(targetId)) {
        continue;
      }

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
 * Generates an explainable causation reason for why restoring this asset helps.
 * Derived purely from actual dependency graph links and recovered nodes.
 */
function generateRestorationExplanation(
  dataset: InfrastructureDataset,
  assetMap: Map<string, Asset>,
  candidateId: string,
  recoveredIds: string[]
): string {
  const candName = assetMap.get(candidateId)?.name || candidateId;

  if (recoveredIds.length <= 1) {
    return `Restoring ${candName} brings this facility directly back online.`;
  }

  // Find direct dependent targets that were recovered
  const directDependents = dataset.dependencies
    .filter((d) => d.source === candidateId && recoveredIds.includes(d.target))
    .map((d) => assetMap.get(d.target)?.name || d.target);

  const uniqueDependents = Array.from(new Set(directDependents));

  if (uniqueDependents.length === 1) {
    const extraCount = recoveredIds.length - 2;
    if (extraCount > 0) {
      return `Restoring ${candName} first reconnects ${uniqueDependents[0]} and ${extraCount} dependent ${
        extraCount === 1 ? 'service' : 'services'
      }.`;
    }
    return `Restoring ${candName} first reconnects ${uniqueDependents[0]} and services that depend on it.`;
  }

  if (uniqueDependents.length >= 2) {
    const primaryTwo = uniqueDependents.slice(0, 2).join(' and ');
    const remaining = recoveredIds.length - 1 - Math.min(2, uniqueDependents.length);
    if (remaining > 0) {
      return `Restoring ${candName} first reconnects ${primaryTwo} and ${remaining} downstream ${
        remaining === 1 ? 'service' : 'services'
      }.`;
    }
    return `Restoring ${candName} first reconnects ${primaryTwo}.`;
  }

  return `Restoring ${candName} first reconnects ${recoveredIds.length - 1} downstream services.`;
}

/**
 * Evaluates all currently eligible restoration candidates from the current state.
 * For EACH candidate:
 * 1. Temporarily restore candidate.
 * 2. Rerun deterministic cascade.
 * 3. Calculate how many previously affected services become operational.
 * 4. Undo temporary restoration.
 * 5. Rank by actual recovery benefit.
 */
export function evaluateRestorationCandidates(
  dataset: InfrastructureDataset,
  failedAssetId: string,
  currentlyRestoredIds: Set<string>,
  currentCascade: CascadeResult
): RestorationCandidate[] {
  const assetMap = new Map<string, Asset>();
  for (const a of dataset.assets) assetMap.set(a.id, a);

  // Eligible candidates: affected nodes excluding failedAssetId and already restored nodes
  const eligibleIds = Array.from(currentCascade.affectedNodes.keys()).filter(
    (id) => id !== failedAssetId && !currentlyRestoredIds.has(id)
  );

  const candidates: RestorationCandidate[] = [];

  for (const candId of eligibleIds) {
    const candAsset = assetMap.get(candId);
    if (!candAsset) continue;

    // Temporarily restore candId
    const tempRestored = new Set([...currentlyRestoredIds, candId]);

    // Rerun deterministic simulation
    const tempCascade = simulateCascadeWithRestorations(
      dataset,
      failedAssetId,
      tempRestored
    );

    // Calculate which previously affected services are now operational
    const recoveredAssetIds = Array.from(currentCascade.affectedNodes.keys()).filter(
      (id) => !tempCascade.affectedNodes.has(id)
    );

    const servicesRecovered = recoveredAssetIds.length;

    const explanation = generateRestorationExplanation(
      dataset,
      assetMap,
      candId,
      recoveredAssetIds
    );

    candidates.push({
      assetId: candId,
      assetName: candAsset.name,
      sector: candAsset.sector,
      servicesRecovered,
      recoveredAssetIds,
      explanation,
    });
  }

  // Deterministic ranking:
  // 1. Greatest servicesRecovered first
  // 2. Tie breaker: Most outgoing connections
  // 3. Tie breaker: Alphabetical by assetName
  candidates.sort((a, b) => {
    if (b.servicesRecovered !== a.servicesRecovered) {
      return b.servicesRecovered - a.servicesRecovered;
    }
    const aOut = dataset.dependencies.filter((d) => d.source === a.assetId).length;
    const bOut = dataset.dependencies.filter((d) => d.source === b.assetId).length;
    if (bOut !== aOut) return bOut - aOut;
    return a.assetName.localeCompare(b.assetName);
  });

  return candidates;
}

/**
 * Computes an iterative multi-step recovery plan.
 * At each recovery step:
 * - Evaluates all candidates from current state.
 * - Picks the candidate with greatest real recovery benefit.
 * - Applies it and recalculates network from the new state.
 * - Repeats until all restorable services are recovered or no improvement is possible.
 */
export function computeMultiStepRecoveryPlan(
  dataset: InfrastructureDataset,
  failedAssetId: string
): RecoveryPlanResult {
  const assetMap = new Map<string, Asset>();
  for (const a of dataset.assets) assetMap.set(a.id, a);

  const baseline = simulateCascade(dataset, failedAssetId);
  const initialAffectedCount = baseline.affectedNodes.size;

  const currentRestored = new Set<string>();
  const steps: RecoveryPlanStep[] = [];
  let cumulativeRecovered = 0;
  let currentCascade = baseline;

  while (true) {
    const candidates = evaluateRestorationCandidates(
      dataset,
      failedAssetId,
      currentRestored,
      currentCascade
    );

    // Find the candidate with greatest recovery benefit > 0
    const best = candidates.find((c) => c.servicesRecovered > 0);
    if (!best) break;

    // Apply the best candidate
    currentRestored.add(best.assetId);
    cumulativeRecovered += best.servicesRecovered;

    // Recalculate network from the new state
    const nextCascade = simulateCascadeWithRestorations(
      dataset,
      failedAssetId,
      currentRestored
    );

    steps.push({
      stepNumber: steps.length + 1,
      assetId: best.assetId,
      assetName: best.assetName,
      sector: best.sector,
      servicesRecovered: best.servicesRecovered,
      cumulativeRecovered,
      recoveredAssetIds: best.recoveredAssetIds,
      remainingAffectedCount: nextCascade.affectedNodes.size,
      explanation: best.explanation,
    });

    currentCascade = nextCascade;

    // Stop if only the root failure remains (or 0 affected)
    if (currentCascade.affectedNodes.size <= 1) {
      break;
    }
  }

  const unrestoredAssetIds = Array.from(currentCascade.affectedNodes.keys()).filter(
    (id) => id !== failedAssetId
  );

  return {
    initialFailureId: failedAssetId,
    initialAffectedCount,
    steps,
    unrestoredAssetIds,
    hasImprovements: steps.length > 0,
  };
}
