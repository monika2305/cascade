import type { Asset, Dependency, InfrastructureDataset, Sector } from '../types/infrastructure';
import { simulateCascade, type CascadeResult } from './cascade';

export interface WeakPoint {
  assetId: string;
  name: string;
  sector: Sector;
  directDependentsCount: number;
  totalCascadeAffected: number;
  sectorsReachedCount: number;
  sectorsReached: Sector[];
  maxSteps: number;
  criticalServicesImpacted: number; // Health & Emergency Services downstream
  criticality: 'Critical' | 'High' | 'Moderate' | 'Low';
  rank: number;
}

/**
 * Deterministically analyzes the current dataset to identify the assets whose failure
 * would cause the largest downstream cascade disruption.
 * Strictly calculated by running the deterministic cascade engine for each candidate asset.
 */
export function findWeakPoints(dataset: InfrastructureDataset): WeakPoint[] {
  if (!dataset.assets || dataset.assets.length === 0) return [];

  const results: Omit<WeakPoint, 'rank'>[] = [];

  for (const asset of dataset.assets) {
    // Run deterministic cascade treating this asset as the initial failure
    const cascade = simulateCascade(dataset, asset.id);

    // Direct downstream dependents
    const directCount = dataset.dependencies.filter((d) => d.source === asset.id).length;
    const totalAffected = cascade.affectedNodes.size;
    const sectorsReached = cascade.sectorsReached;

    // Critical downstream services: Health + Emergency Services affected downstream
    let criticalCount = 0;
    cascade.affectedNodes.forEach((node) => {
      if (node.step > 0) {
        const a = dataset.assets.find((item) => item.id === node.assetId);
        if (a && (a.sector === 'Health' || a.sector === 'Emergency Services')) {
          criticalCount += 1;
        }
      }
    });

    // Determine criticality tier based on downstream cascade disruption
    const downstreamAffected = totalAffected - 1;
    let criticality: WeakPoint['criticality'] = 'Low';
    if (downstreamAffected >= 8 || criticalCount >= 3) {
      criticality = 'Critical';
    } else if (downstreamAffected >= 3 || criticalCount >= 1) {
      criticality = 'High';
    } else if (downstreamAffected >= 1) {
      criticality = 'Moderate';
    }

    results.push({
      assetId: asset.id,
      name: asset.name,
      sector: asset.sector,
      directDependentsCount: directCount,
      totalCascadeAffected: totalAffected,
      sectorsReachedCount: sectorsReached.length,
      sectorsReached,
      maxSteps: cascade.totalSteps,
      criticalServicesImpacted: criticalCount,
      criticality,
    });
  }

  // Rank from highest impact to lowest impact
  results.sort((a, b) => {
    if (b.totalCascadeAffected !== a.totalCascadeAffected) {
      return b.totalCascadeAffected - a.totalCascadeAffected;
    }
    if (b.criticalServicesImpacted !== a.criticalServicesImpacted) {
      return b.criticalServicesImpacted - a.criticalServicesImpacted;
    }
    if (b.sectorsReachedCount !== a.sectorsReachedCount) {
      return b.sectorsReachedCount - a.sectorsReachedCount;
    }
    return b.directDependentsCount - a.directDependentsCount;
  });

  return results.map((item, idx) => ({
    ...item,
    rank: idx + 1,
  }));
}

export type InterventionType = 'isolate_connection' | 'add_connection' | 'protect_asset';

export interface InterventionAction {
  type: InterventionType;
  name: string;
  sourceAssetId?: string;
  targetAssetId?: string;
  assetId?: string; // target asset for islanding / protection
}

export interface InterventionResult {
  action: InterventionAction;
  initialFailureId: string;
  beforeAffectedCount: number;
  afterAffectedCount: number;
  savedAssetsCount: number;
  savedAssetIds: string[];
  beforeSectorsCount: number;
  afterSectorsCount: number;
  modifiedDataset: InfrastructureDataset;
  afterCascade: CascadeResult;
}

/**
 * Action Lab: Simulates an intervention strategy on a copy of the dataset
 * and compares the cascade outcome against the unmitigated baseline.
 */
export function runIntervention(
  dataset: InfrastructureDataset,
  initialFailureId: string,
  action: InterventionAction
): InterventionResult {
  // Baseline simulation
  const beforeCascade = simulateCascade(dataset, initialFailureId);
  const beforeAffectedIds = new Set(Array.from(beforeCascade.affectedNodes.keys()));

  // Clone dataset to avoid mutating original state
  const modifiedAssets: Asset[] = dataset.assets.map((a) => ({ ...a }));
  let modifiedDependencies: Dependency[] = dataset.dependencies.map((d) => ({ ...d }));

  if (action.type === 'isolate_connection' && action.sourceAssetId && action.targetAssetId) {
    // Sever a compromised line to quarantine the cascade
    modifiedDependencies = modifiedDependencies.filter(
      (d) => !(d.source === action.sourceAssetId && d.target === action.targetAssetId)
    );
  } else if (action.type === 'add_connection' && action.sourceAssetId && action.targetAssetId) {
    // Add a redundant backup link
    const exists = modifiedDependencies.some(
      (d) => d.source === action.sourceAssetId && d.target === action.targetAssetId
    );
    if (!exists) {
      modifiedDependencies.push({
        id: `redundant-${Date.now()}`,
        source: action.sourceAssetId,
        target: action.targetAssetId,
        type: 'backup_supply',
        strength: 5,
      });
    }
  } else if (action.type === 'protect_asset' && action.assetId) {
    // Islanding / local backup: Protects this specific asset so upstream failures do not disrupt it
    // Cut incoming dependency links that would pull this asset down from failure
    modifiedDependencies = modifiedDependencies.filter((d) => d.target !== action.assetId);
  }

  const modifiedDataset: InfrastructureDataset = {
    ...dataset,
    assets: modifiedAssets,
    dependencies: modifiedDependencies,
    summary: {
      ...dataset.summary,
      dependencyCount: modifiedDependencies.length,
    },
  };

  // Re-run the cascade engine on the modified scenario
  const afterCascade = simulateCascade(modifiedDataset, initialFailureId);
  const afterAffectedIds = new Set(Array.from(afterCascade.affectedNodes.keys()));

  // Calculate saved assets (assets that failed in baseline but are now protected)
  const savedAssetIds: string[] = [];
  beforeAffectedIds.forEach((id) => {
    if (!afterAffectedIds.has(id)) {
      savedAssetIds.push(id);
    }
  });

  return {
    action,
    initialFailureId,
    beforeAffectedCount: beforeCascade.affectedNodes.size,
    afterAffectedCount: afterCascade.affectedNodes.size,
    savedAssetsCount: savedAssetIds.length,
    savedAssetIds,
    beforeSectorsCount: beforeCascade.sectorsReached.length,
    afterSectorsCount: afterCascade.sectorsReached.length,
    modifiedDataset,
    afterCascade,
  };
}

export interface ContextualFix {
  id: string;
  icon: string;
  title: string;
  description: string;
  protects: string;
  whatWillWeDo?: string;
  whatCouldThisProtect?: string;
  action: InterventionAction;
}

export interface EvaluatedFix {
  fix: ContextualFix;
  result: InterventionResult;
  servicesProtected: number;
  isRecommended: boolean;
}

export interface RecommendationEvaluation {
  evaluatedFixes: EvaluatedFix[];
  recommendedFixIds: string[];
  maxProtected: number;
  hasTie: boolean;
  tieCount: number;
  statusMessage?: string;
}

/**
 * Context-aware fixes generator:
 * Analyzes the failed asset's sector, outgoing connections, and downstream impact.
 * Produces 2-3 realistic, simulatable fix options derived strictly from the dataset.
 */
export function generateContextualFixes(
  dataset: InfrastructureDataset,
  failedAssetId: string
): ContextualFix[] {
  const assetMap = new Map<string, Asset>();
  for (const a of dataset.assets) {
    assetMap.set(a.id, a);
  }

  const failedAsset = assetMap.get(failedAssetId);
  if (!failedAsset) return [];

  const baselineCascade = simulateCascade(dataset, failedAssetId);
  if (baselineCascade.affectedNodes.size <= 1) {
    // No downstream cascade occurs; no downstream fix is possible
    return [];
  }

  const outgoingDeps = dataset.dependencies.filter((d) => d.source === failedAssetId);
  const fixes: ContextualFix[] = [];

  // 1. Primary Line / Route Isolation (Stop failure propagation down main connection)
  if (outgoingDeps.length > 0) {
    const primaryDep = outgoingDeps[0];
    const target = assetMap.get(primaryDep.target);
    if (target) {
      let icon = '🔄';
      let title = 'USE ANOTHER ROUTE';
      let description = `Send connections through another available route away from ${failedAsset.name}.`;
      let protects = `${target.name} and connected services.`;

      switch (failedAsset.sector) {
        case 'Power':
          icon = '⚡';
          title = 'USE ANOTHER POWER LINE';
          description = `Send power through another available connection.`;
          protects = `${target.name} and connected services.`;
          break;
        case 'Water':
          icon = '💧';
          title = 'USE ANOTHER WATER ROUTE';
          description = `Send water through another available pipeline route.`;
          protects = `${target.name} and connected services.`;
          break;
        case 'Transport':
          icon = '🚗';
          title = 'USE ANOTHER ROUTE';
          description = `Reroute traffic through another open corridor.`;
          protects = `${target.name} and connected transit routes.`;
          break;
        case 'Communication':
          icon = '📡';
          title = 'USE ANOTHER COMMUNICATION ROUTE';
          description = `Reroute network traffic through another communication line.`;
          protects = `${target.name} and connected network services.`;
          break;
        case 'Health':
          icon = '🏥';
          title = 'REDIRECT TO ANOTHER HEALTH FACILITY';
          description = `Divert incoming patients to another available facility.`;
          protects = `${target.name} and emergency medical capacity.`;
          break;
        case 'Emergency Services':
          icon = '🚨';
          title = 'USE ANOTHER RESPONSE ROUTE';
          description = `Dispatch emergency units using another available route.`;
          protects = `${target.name} and emergency coverage.`;
          break;
      }

      fixes.push({
        id: `isolate-${primaryDep.source}-${primaryDep.target}`,
        icon,
        title,
        description,
        protects,
        whatWillWeDo: description,
        whatCouldThisProtect: protects,
        action: {
          type: 'isolate_connection',
          name: `${title}: ${failedAsset.name} → ${target.name}`,
          sourceAssetId: primaryDep.source,
          targetAssetId: primaryDep.target,
        },
      });
    }
  }

  // 2. Protect Downstream Critical Facility (Hospital, Water Pump, Emergency dispatch)
  const criticalDownstream = Array.from(baselineCascade.affectedNodes.keys())
    .filter((id) => id !== failedAssetId)
    .map((id) => assetMap.get(id))
    .filter((a): a is Asset => Boolean(a))
    .sort((a, b) => {
      // Prioritize Health & Emergency Services, then Water
      const priority = (sector: string) => {
        if (sector === 'Health') return 4;
        if (sector === 'Emergency Services') return 3;
        if (sector === 'Water') return 2;
        return 1;
      };
      return priority(b.sector) - priority(a.sector);
    });

  if (criticalDownstream.length > 0) {
    const criticalTarget = criticalDownstream[0];
    let icon = '🛡️';
    let title = `KEEP ${criticalTarget.name.toUpperCase()} RUNNING`;
    let description = `Keep ${criticalTarget.name} operating using dedicated local backup.`;
    let protects = `${criticalTarget.name}.`;

    if (failedAsset.sector === 'Power' || criticalTarget.sector === 'Health') {
      icon = '🏥';
      title = criticalTarget.sector === 'Health'
        ? `GIVE HOSPITAL BACKUP POWER`
        : `GIVE ${criticalTarget.name.toUpperCase()} BACKUP POWER`;
      description = `Keep ${criticalTarget.name} running using backup power.`;
      protects = `${criticalTarget.name}.`;
    } else if (failedAsset.sector === 'Water' || criticalTarget.sector === 'Water') {
      icon = '💧';
      title = `PROTECT ${criticalTarget.name.toUpperCase()} WITH BACKUP WATER`;
      description = `Keep ${criticalTarget.name} running using emergency water reserves.`;
      protects = `${criticalTarget.name}.`;
    } else if (failedAsset.sector === 'Transport' || criticalTarget.sector === 'Emergency Services') {
      icon = '🚨';
      title = `KEEP EMERGENCY ROUTE OPEN FOR ${criticalTarget.name.toUpperCase()}`;
      description = `Prioritize access corridors to keep ${criticalTarget.name} reachable.`;
      protects = `${criticalTarget.name}.`;
    }

    fixes.push({
      id: `protect-${criticalTarget.id}`,
      icon,
      title,
      description,
      protects,
      whatWillWeDo: description,
      whatCouldThisProtect: protects,
      action: {
        type: 'protect_asset',
        name: `${title}: ${criticalTarget.name}`,
        assetId: criticalTarget.id,
      },
    });
  }

  // 3. Alternate Backup Provider / Secondary Route
  // Check if there is an alternative healthy provider in the same sector not affected by failure
  const healthyPeers = dataset.assets.filter(
    (a) => a.sector === failedAsset.sector && !baselineCascade.affectedNodes.has(a.id) && a.id !== failedAssetId
  );

  if (healthyPeers.length > 0 && outgoingDeps.length > 0) {
    const peer = healthyPeers[0];
    const target = assetMap.get(outgoingDeps[0].target);
    if (target) {
      let icon = '🔄';
      let title = 'USE ANOTHER AVAILABLE SOURCE';
      let description = `Supply ${target.name} from ${peer.name}.`;
      let protects = `${target.name} and connected services.`;

      if (failedAsset.sector === 'Power') {
        icon = '⚡';
        title = 'USE ANOTHER AVAILABLE POWER SOURCE';
        description = `Send power to ${target.name} from ${peer.name}.`;
        protects = `${target.name} and connected services.`;
      } else if (failedAsset.sector === 'Water') {
        icon = '💧';
        title = 'USE ANOTHER WATER SUPPLY';
        description = `Supply water to ${target.name} from ${peer.name}.`;
        protects = `${target.name} and connected services.`;
      } else if (failedAsset.sector === 'Transport') {
        icon = '🚗';
        title = 'USE ANOTHER ROUTE';
        description = `Reroute traffic flow through ${peer.name} to ${target.name}.`;
        protects = `${target.name} and connected transit routes.`;
      } else if (failedAsset.sector === 'Communication') {
        icon = '📡';
        title = 'USE BACKUP COMMUNICATION LINK';
        description = `Transmit data through ${peer.name} to ${target.name}.`;
        protects = `${target.name} and connected systems.`;
      } else if (failedAsset.sector === 'Health') {
        icon = '🏥';
        title = 'REDIRECT TO ANOTHER HEALTH FACILITY';
        description = `Transfer patients to ${peer.name} to relieve ${target.name}.`;
        protects = `${target.name} and healthcare continuity.`;
      } else if (failedAsset.sector === 'Emergency Services') {
        icon = '🚨';
        title = 'USE ANOTHER RESPONSE FACILITY';
        description = `Dispatch response teams from ${peer.name} to support ${target.name}.`;
        protects = `${target.name} and emergency coverage.`;
      }

      fixes.push({
        id: `backup-${peer.id}-${target.id}`,
        icon,
        title,
        description,
        protects,
        whatWillWeDo: description,
        whatCouldThisProtect: protects,
        action: {
          type: 'add_connection',
          name: `${title}: ${peer.name} → ${target.name}`,
          sourceAssetId: peer.id,
          targetAssetId: target.id,
        },
      });
    }
  } else if (outgoingDeps.length > 1) {
    // Secondary outgoing connection from failed asset
    const secondaryDep = outgoingDeps[1];
    const secondTarget = assetMap.get(secondaryDep.target);
    if (secondTarget) {
      let icon = '🔄';
      let title = `USE ANOTHER ROUTE TO ${secondTarget.name.toUpperCase()}`;
      let description = `Send connections to ${secondTarget.name} through another available route.`;
      let protects = `${secondTarget.name} and connected services.`;

      if (failedAsset.sector === 'Power') {
        icon = '⚡';
        title = `USE ANOTHER POWER LINE TO ${secondTarget.name.toUpperCase()}`;
        description = `Send power to ${secondTarget.name} through another available connection.`;
        protects = `${secondTarget.name} and connected services.`;
      } else if (failedAsset.sector === 'Water') {
        icon = '💧';
        title = `USE ANOTHER WATER ROUTE TO ${secondTarget.name.toUpperCase()}`;
        description = `Send water to ${secondTarget.name} through another available route.`;
        protects = `${secondTarget.name} and connected services.`;
      } else if (failedAsset.sector === 'Transport') {
        icon = '🚗';
        title = `USE ANOTHER ROUTE TO ${secondTarget.name.toUpperCase()}`;
        description = `Reroute traffic flow away from ${failedAsset.name} to ${secondTarget.name}.`;
        protects = `${secondTarget.name} and connected transit routes.`;
      }

      fixes.push({
        id: `isolate-${secondaryDep.source}-${secondaryDep.target}`,
        icon,
        title,
        description,
        protects,
        whatWillWeDo: description,
        whatCouldThisProtect: protects,
        action: {
          type: 'isolate_connection',
          name: `${title}: ${failedAsset.name} → ${secondTarget.name}`,
          sourceAssetId: secondaryDep.source,
          targetAssetId: secondaryDep.target,
        },
      });
    }
  }

  return fixes.slice(0, 3);
}

/**
 * Deterministically evaluates all available fixes using the SAME cascade simulation engine.
 * Computes servicesProtected = beforeAffected - afterAffected.
 * Automatically identifies the recommended fix (or ties, or no-improvement).
 */
export function evaluateFixes(
  dataset: InfrastructureDataset,
  failedAssetId: string,
  fixes: ContextualFix[]
): RecommendationEvaluation {
  if (fixes.length === 0) {
    return {
      evaluatedFixes: [],
      recommendedFixIds: [],
      maxProtected: 0,
      hasTie: false,
      tieCount: 0,
      statusMessage: 'No usable backup option was found in this city data.',
    };
  }

  const evaluated: { fix: ContextualFix; result: InterventionResult; servicesProtected: number }[] = [];

  for (const fix of fixes) {
    const res = runIntervention(dataset, failedAssetId, fix.action);
    const protectedCount = Math.max(0, res.savedAssetsCount);
    evaluated.push({
      fix,
      result: res,
      servicesProtected: protectedCount,
    });
  }

  let maxProtected = 0;
  for (const item of evaluated) {
    if (item.servicesProtected > maxProtected) {
      maxProtected = item.servicesProtected;
    }
  }

  if (maxProtected <= 0) {
    return {
      evaluatedFixes: evaluated.map((item) => ({
        ...item,
        isRecommended: false,
      })),
      recommendedFixIds: [],
      maxProtected: 0,
      hasTie: false,
      tieCount: 0,
      statusMessage: 'No available fix reduces the impact in this scenario.',
    };
  }

  const bestItems = evaluated.filter((item) => item.servicesProtected === maxProtected);
  const recommendedFixIds = bestItems.map((item) => item.fix.id);
  const hasTie = bestItems.length > 1;

  return {
    evaluatedFixes: evaluated.map((item) => ({
      ...item,
      isRecommended: recommendedFixIds.includes(item.fix.id),
    })),
    recommendedFixIds,
    maxProtected,
    hasTie,
    tieCount: bestItems.length,
    statusMessage: hasTie ? 'Both give the same improvement.' : undefined,
  };
}

/**
 * Generates a 1-2 sentence plain English explanation of why an intervention worked or did not work.
 * Strictly derived from the actual intervention and changed cascade path.
 */
export function getInterventionExplanation(
  dataset: InfrastructureDataset,
  result: InterventionResult,
  fix: ContextualFix
): string {
  const assetMap = new Map<string, Asset>();
  for (const a of dataset.assets) {
    assetMap.set(a.id, a);
  }

  if (result.savedAssetsCount === 0) {
    return 'No services were protected by this fix because affected services still lose supply through secondary connecting paths.';
  }

  if (fix.action.type === 'protect_asset') {
    const target = assetMap.get(fix.action.assetId || '');
    const targetName = target?.name || 'the facility';
    if (result.savedAssetsCount > 1) {
      return `The backup power keeps ${targetName} running, so the failure cannot spread through that dependency to downstream services.`;
    }
    return `Dedicated backup keeps ${targetName} running, preventing it from failing along with upstream feeds.`;
  }

  if (fix.action.type === 'isolate_connection') {
    const target = assetMap.get(fix.action.targetAssetId || '');
    const targetName = target?.name || 'the connection';
    return `Rerouting connections away from ${targetName} stops the failure from spreading, protecting ${result.savedAssetsCount} ${result.savedAssetsCount === 1 ? 'service' : 'services'}.`;
  }

  const source = assetMap.get(fix.action.sourceAssetId || '');
  const target = assetMap.get(fix.action.targetAssetId || '');
  return `Supplying ${target?.name || 'affected services'} from ${source?.name || 'an alternate source'} maintains essential operations, protecting ${result.savedAssetsCount} ${result.savedAssetsCount === 1 ? 'service' : 'services'}.`;
}
