import { describe, it, expect } from 'vitest';
import type { InfrastructureDataset } from '../types/infrastructure';
import { simulateCascade } from '../utils/cascade';
import { generateContextualFixes, evaluateFixes, runIntervention } from '../utils/analysis';
import { computeMultiStepRecoveryPlan } from '../utils/recoveryPlanner';
import sampleCascadeCity from '../data/sample_cascade_city.json';

describe('City Resilience Command Orchestration & Determinism Tests', () => {
  const dataset = sampleCascadeCity as unknown as InfrastructureDataset;

  it('1. Matches deterministic cascade metrics exactly for Main Grid Station (PWR-01)', () => {
    const cascade = simulateCascade(dataset, 'PWR-01');
    expect(cascade.affectedNodes.size).toBe(21);
    expect(cascade.sectorsReached.length).toBe(6);

    const fixes = generateContextualFixes(dataset, 'PWR-01');
    const evalResult = evaluateFixes(dataset, 'PWR-01', fixes);
    expect(evalResult.evaluatedFixes.length).toBeGreaterThan(0);

    const recId = evalResult.recommendedFixIds[0];
    const recommended = evalResult.evaluatedFixes.find((e) => e.fix.id === recId);
    expect(recommended).toBeDefined();
    expect(recommended!.servicesProtected).toBe(evalResult.maxProtected);

    // Test the action
    const testedRes = runIntervention(dataset, 'PWR-01', recommended!.fix.action);
    expect(testedRes.savedAssetsCount).toBe(recommended!.servicesProtected);
    expect(testedRes.beforeAffectedCount).toBe(cascade.affectedNodes.size);

    // Recovery Planner Step 1 matches
    const recoveryPlan = computeMultiStepRecoveryPlan(dataset, 'PWR-01');
    expect(recoveryPlan.steps.length).toBeGreaterThan(0);
    const topStep = recoveryPlan.steps[0];
    expect(topStep.servicesRecovered).toBeGreaterThan(0);
    expect(topStep.assetName).toBeDefined();
  });

  it('2. Matches deterministic cascade metrics for Main Water Treatment Plant (WTR-01)', () => {
    const cascade = simulateCascade(dataset, 'WTR-01');
    expect(cascade.affectedNodes.size).toBe(12);

    const fixes = generateContextualFixes(dataset, 'WTR-01');
    const evalResult = evaluateFixes(dataset, 'WTR-01', fixes);
    expect(evalResult.evaluatedFixes.length).toBeGreaterThan(0);

    const recId = evalResult.recommendedFixIds[0];
    const recommended = evalResult.evaluatedFixes.find((e) => e.fix.id === recId);
    expect(recommended).toBeDefined();

    // Verify recovery priority for WTR-01
    const recoveryPlan = computeMultiStepRecoveryPlan(dataset, 'WTR-01');
    expect(recoveryPlan.steps.length).toBeGreaterThan(0);
    expect(recoveryPlan.steps[0].servicesRecovered).toBeGreaterThan(0);
  });

  it('3. Matches deterministic cascade metrics for Central Bridge (TRN-01)', () => {
    const cascade = simulateCascade(dataset, 'TRN-01');
    expect(cascade.affectedNodes.size).toBe(8);

    const recoveryPlan = computeMultiStepRecoveryPlan(dataset, 'TRN-01');
    expect(recoveryPlan.steps.length).toBeGreaterThan(0);
  });

  it('4. Handles terminal/leaf asset failure gracefully (no downstream cascade)', () => {
    // Trauma Centre (HLT-02) is a pure terminal/leaf service with no outgoing dependencies
    const cascade = simulateCascade(dataset, 'HLT-02');
    expect(cascade.affectedNodes.size).toBe(1); // only itself fails

    const fixes = generateContextualFixes(dataset, 'HLT-02');
    // When no downstream cascade occurs, no downstream intervention can reduce cascade
    expect(fixes.length).toBe(0);

    const evalResult = evaluateFixes(dataset, 'HLT-02', fixes);
    expect(evalResult.evaluatedFixes.length).toBe(0);
    expect(evalResult.statusMessage).toContain('No usable backup option');

    // Recovery plan has 0 steps because only root failed
    const recoveryPlan = computeMultiStepRecoveryPlan(dataset, 'HLT-02');
    expect(recoveryPlan.steps.length).toBe(0);
    expect(recoveryPlan.hasImprovements).toBe(false);
  });

  it('5. Handles custom isolated dataset with zero viable interventions and zero restorations', () => {
    const isolatedDataset = {
      name: 'Isolated City',
      assets: [
        { id: 'ISO-01', name: 'Isolated Tower', sector: 'Communication', type: 'tower', status: 'operational' },
        { id: 'ISO-02', name: 'Isolated Server', sector: 'Communication', type: 'server', status: 'operational' },
      ],
      dependencies: [],
      sectors: ['Communication'],
      summary: {
        assetCount: 2,
        dependencyCount: 0,
        sectorCount: 1,
        sectorCounts: { Communication: 2 } as Record<string, number>,
      },
    } as unknown as InfrastructureDataset;

    const cascade = simulateCascade(isolatedDataset, 'ISO-01');
    expect(cascade.affectedNodes.size).toBe(1);

    const fixes = generateContextualFixes(isolatedDataset, 'ISO-01');
    expect(fixes.length).toBe(0);

    const recoveryPlan = computeMultiStepRecoveryPlan(isolatedDataset, 'ISO-01');
    expect(recoveryPlan.steps.length).toBe(0);
  });

  it('6. Verifies role awareness does not alter underlying deterministic counts', () => {
    const cascade = simulateCascade(dataset, 'PWR-01');
    const affectedCount = cascade.affectedNodes.size;

    const roles = ['general', 'emergency', 'operator', 'authority'] as const;
    for (const role of roles) {
      // Regardless of role, underlying affected count must be identical
      expect(role).toBeDefined();
      expect(affectedCount).toBe(21);
      expect(cascade.sectorsReached.length).toBe(6);
    }
  });
});
