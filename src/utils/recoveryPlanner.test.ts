import { describe, it, expect } from 'vitest';
import type { InfrastructureDataset } from '../types/infrastructure';
import demoDataset from '../data/sample_cascade_city.json';
import {
  evaluateRestorationCandidates,
  computeMultiStepRecoveryPlan,
} from './recoveryPlanner';
import { simulateCascade } from './cascade';

describe('Cascade Recovery Planner', () => {
  const dataset = demoDataset as unknown as InfrastructureDataset;

  it('correctly ranks restoration candidates for Main Grid Station (PWR-01)', () => {
    const baseline = simulateCascade(dataset, 'PWR-01');
    expect(baseline.affectedNodes.size).toBeGreaterThan(1);

    const candidates = evaluateRestorationCandidates(
      dataset,
      'PWR-01',
      new Set(),
      baseline
    );

    expect(candidates.length).toBeGreaterThan(0);
    // The top recommendation should recover multiple services
    const top = candidates[0];
    expect(top.servicesRecovered).toBeGreaterThan(1);
    expect(top.explanation).toBeDefined();
    expect(top.explanation.length).toBeGreaterThan(10);

    // Verify ordering: descending by servicesRecovered
    for (let i = 0; i < candidates.length - 1; i++) {
      expect(candidates[i].servicesRecovered).toBeGreaterThanOrEqual(
        candidates[i + 1].servicesRecovered
      );
    }
  });

  it('iteratively computes multi-step plan recalculating network state at each step', () => {
    const plan = computeMultiStepRecoveryPlan(dataset, 'PWR-01');

    expect(plan.initialFailureId).toBe('PWR-01');
    expect(plan.hasImprovements).toBe(true);
    expect(plan.steps.length).toBeGreaterThan(0);

    let prevRemaining = plan.initialAffectedCount;
    let prevCumulative = 0;

    for (const step of plan.steps) {
      expect(step.servicesRecovered).toBeGreaterThan(0);
      expect(step.remainingAffectedCount).toBeLessThan(prevRemaining);
      expect(step.cumulativeRecovered).toBe(prevCumulative + step.servicesRecovered);

      prevRemaining = step.remainingAffectedCount;
      prevCumulative = step.cumulativeRecovered;
    }
  });

  it('handles failures where no downstream restoration helps (isolated / leaf node)', () => {
    const leafDataset: InfrastructureDataset = {
      name: 'Leaf Test',
      assets: [
        { id: 'leaf-1', name: 'Isolated Streetlight', sector: 'Power', type: 'Streetlight', status: 'operational' },
        { id: 'node-2', name: 'Independent Water Well', sector: 'Water', type: 'Well', status: 'operational' },
      ],
      dependencies: [],
      sectors: ['Power', 'Water'],
      summary: {
        assetCount: 2,
        dependencyCount: 0,
        sectorCount: 2,
        sectorCounts: { Power: 1, Water: 1, Health: 0, Transport: 0, Communication: 0, 'Emergency Services': 0, Other: 0 },
      },
    };

    const plan = computeMultiStepRecoveryPlan(leafDataset, 'leaf-1');
    expect(plan.hasImprovements).toBe(false);
    expect(plan.steps.length).toBe(0);
  });

  it('handles deterministic tie-breaking when two candidates have equal recovery counts', () => {
    const tieDataset: InfrastructureDataset = {
      name: 'Tie Test',
      assets: [
        { id: 'root', name: 'Power Plant', sector: 'Power', type: 'Plant', status: 'operational' },
        { id: 'sub-A', name: 'Substation A', sector: 'Power', type: 'Substation', status: 'operational' },
        { id: 'sub-B', name: 'Substation B', sector: 'Power', type: 'Substation', status: 'operational' },
        { id: 'pump-A', name: 'Water Pump A', sector: 'Water', type: 'Pump', status: 'operational' },
        { id: 'pump-B', name: 'Water Pump B', sector: 'Water', type: 'Pump', status: 'operational' },
      ],
      dependencies: [
        { id: 'd1', source: 'root', target: 'sub-A', type: 'powers' },
        { id: 'd2', source: 'root', target: 'sub-B', type: 'powers' },
        { id: 'd3', source: 'sub-A', target: 'pump-A', type: 'powers' },
        { id: 'd4', source: 'sub-B', target: 'pump-B', type: 'powers' },
      ],
      sectors: ['Power', 'Water'],
      summary: {
        assetCount: 5,
        dependencyCount: 4,
        sectorCount: 2,
        sectorCounts: { Power: 3, Water: 2, Health: 0, Transport: 0, Communication: 0, 'Emergency Services': 0, Other: 0 },
      },
    };

    const baseline = simulateCascade(tieDataset, 'root');
    const candidates = evaluateRestorationCandidates(
      tieDataset,
      'root',
      new Set(),
      baseline
    );

    // sub-A and sub-B both recover 2 services (themselves + pump)
    expect(candidates[0].servicesRecovered).toBe(2);
    expect(candidates[1].servicesRecovered).toBe(2);

    // Tie-breaker should consistently sort deterministically
    expect(candidates[0].assetName).toBe('Substation A');
    expect(candidates[1].assetName).toBe('Substation B');
  });

  it('recalculates candidate benefits dynamically after the first candidate is applied', () => {
    const diamondDataset: InfrastructureDataset = {
      name: 'Diamond Test',
      assets: [
        { id: 'root', name: 'Grid', sector: 'Power', type: 'Grid', status: 'operational' },
        { id: 'hub', name: 'Central Hub', sector: 'Power', type: 'Hub', status: 'operational' },
        { id: 'b1', name: 'Branch 1', sector: 'Power', type: 'Branch', status: 'operational' },
        { id: 'b2', name: 'Branch 2', sector: 'Power', type: 'Branch', status: 'operational' },
      ],
      dependencies: [
        { id: 'd1', source: 'root', target: 'hub', type: 'powers' },
        { id: 'd2', source: 'hub', target: 'b1', type: 'powers' },
        { id: 'd3', source: 'hub', target: 'b2', type: 'powers' },
      ],
      sectors: ['Power'],
      summary: {
        assetCount: 4,
        dependencyCount: 3,
        sectorCount: 1,
        sectorCounts: { Power: 4, Water: 0, Health: 0, Transport: 0, Communication: 0, 'Emergency Services': 0, Other: 0 },
      },
    };

    const plan = computeMultiStepRecoveryPlan(diamondDataset, 'root');
    // Step 1 should restore Central Hub, which brings back Hub + b1 + b2 (3 services)
    expect(plan.steps.length).toBe(1);
    expect(plan.steps[0].assetId).toBe('hub');
    expect(plan.steps[0].servicesRecovered).toBe(3);
    // After Central Hub is restored, 0 remaining affected services besides root
    expect(plan.steps[0].remainingAffectedCount).toBe(1); // only root
  });

  it('generates accurate dependency-derived explanations', () => {
    const baseline = simulateCascade(dataset, 'PWR-01');
    const candidates = evaluateRestorationCandidates(
      dataset,
      'PWR-01',
      new Set(),
      baseline
    );

    const top = candidates[0];
    expect(top.explanation).toMatch(/Restoring .* first reconnects/);
  });
});
