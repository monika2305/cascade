import { describe, it, expect } from 'vitest';
import { simulateCascade, getWhyPath } from './cascade';
import type { InfrastructureDataset } from '../types/infrastructure';

describe('Deterministic Cascade Simulation Engine', () => {
  it('handles linear cascade A -> B -> C correctly', () => {
    const dataset: InfrastructureDataset = {
      name: 'Linear Test',
      assets: [
        { id: 'A', name: 'Asset A', sector: 'Power', type: 'Substation', status: 'operational' },
        { id: 'B', name: 'Asset B', sector: 'Water', type: 'Pump', status: 'operational' },
        { id: 'C', name: 'Asset C', sector: 'Health', type: 'Hospital', status: 'operational' },
      ],
      dependencies: [
        { id: 'd1', source: 'A', target: 'B', type: 'powers' },
        { id: 'd2', source: 'B', target: 'C', type: 'water_supply' },
      ],
      sectors: ['Power', 'Water', 'Health'],
      summary: {
        assetCount: 3,
        dependencyCount: 2,
        sectorCount: 3,
        sectorCounts: { Power: 1, Water: 1, Health: 1, Transport: 0, Communication: 0, 'Emergency Services': 0, Other: 0 },
      },
    };

    const result = simulateCascade(dataset, 'A');

    expect(result.initialFailureId).toBe('A');
    expect(result.affectedNodes.size).toBe(3);
    expect(result.affectedNodes.get('A')?.step).toBe(0);
    expect(result.affectedNodes.get('B')?.step).toBe(1);
    expect(result.affectedNodes.get('C')?.step).toBe(2);
    expect(result.totalSteps).toBe(2);
    expect(result.sectorsReached).toContain('Power');
    expect(result.sectorsReached).toContain('Water');
    expect(result.sectorsReached).toContain('Health');

    // Test WHY path for C
    const whyC = getWhyPath(dataset, result, 'C');
    expect(whyC.length).toBe(3);
    expect(whyC[0].assetId).toBe('C');
    expect(whyC[0].dependencyType).toBe('water_supply');
    expect(whyC[1].assetId).toBe('B');
    expect(whyC[1].dependencyType).toBe('powers');
    expect(whyC[2].assetId).toBe('A');
    expect(whyC[2].isInitialFailure).toBe(true);
  });

  it('handles branching and diamond convergence without duplicate counts', () => {
    // Diamond: A -> B, A -> C, B -> D, C -> D
    const dataset: InfrastructureDataset = {
      name: 'Diamond Test',
      assets: [
        { id: 'A', name: 'A', sector: 'Power', type: 'Node', status: 'operational' },
        { id: 'B', name: 'B', sector: 'Transport', type: 'Node', status: 'operational' },
        { id: 'C', name: 'C', sector: 'Communication', type: 'Node', status: 'operational' },
        { id: 'D', name: 'D', sector: 'Health', type: 'Node', status: 'operational' },
      ],
      dependencies: [
        { id: 'd1', source: 'A', target: 'B', type: 'powers' },
        { id: 'd2', source: 'A', target: 'C', type: 'powers' },
        { id: 'd3', source: 'B', target: 'D', type: 'access' },
        { id: 'd4', source: 'C', target: 'D', type: 'data' },
      ],
      sectors: ['Power', 'Transport', 'Communication', 'Health'],
      summary: {
        assetCount: 4,
        dependencyCount: 4,
        sectorCount: 4,
        sectorCounts: { Power: 1, Transport: 1, Communication: 1, Health: 1, Water: 0, 'Emergency Services': 0, Other: 0 },
      },
    };

    const result = simulateCascade(dataset, 'A');

    // D must be counted exactly once
    expect(result.affectedNodes.size).toBe(4);
    expect(result.affectedOrder.length).toBe(4);
    expect(result.affectedNodes.get('B')?.step).toBe(1);
    expect(result.affectedNodes.get('C')?.step).toBe(1);
    expect(result.affectedNodes.get('D')?.step).toBe(2);
    expect(result.totalSteps).toBe(2);
  });

  it('handles disconnected subgraphs cleanly', () => {
    // A -> B and C -> D (disconnected)
    const dataset: InfrastructureDataset = {
      name: 'Disconnected Test',
      assets: [
        { id: 'A', name: 'A', sector: 'Power', type: 'Node', status: 'operational' },
        { id: 'B', name: 'B', sector: 'Water', type: 'Node', status: 'operational' },
        { id: 'C', name: 'C', sector: 'Transport', type: 'Node', status: 'operational' },
        { id: 'D', name: 'D', sector: 'Health', type: 'Node', status: 'operational' },
      ],
      dependencies: [
        { id: 'd1', source: 'A', target: 'B', type: 'powers' },
        { id: 'd2', source: 'C', target: 'D', type: 'access' },
      ],
      sectors: ['Power', 'Water', 'Transport', 'Health'],
      summary: {
        assetCount: 4,
        dependencyCount: 2,
        sectorCount: 4,
        sectorCounts: { Power: 1, Water: 1, Transport: 1, Health: 1, Communication: 0, 'Emergency Services': 0, Other: 0 },
      },
    };

    const result = simulateCascade(dataset, 'A');

    expect(result.affectedNodes.size).toBe(2);
    expect(result.affectedNodes.has('A')).toBe(true);
    expect(result.affectedNodes.has('B')).toBe(true);
    expect(result.affectedNodes.has('C')).toBe(false);
    expect(result.affectedNodes.has('D')).toBe(false);
    expect(result.sectorsReached).toEqual(['Power', 'Water']);
  });

  it('safely terminates and avoids infinite loops on cyclic dependencies A -> B -> C -> A', () => {
    const dataset: InfrastructureDataset = {
      name: 'Cycle Test',
      assets: [
        { id: 'A', name: 'A', sector: 'Power', type: 'Node', status: 'operational' },
        { id: 'B', name: 'B', sector: 'Water', type: 'Node', status: 'operational' },
        { id: 'C', name: 'C', sector: 'Communication', type: 'Node', status: 'operational' },
      ],
      dependencies: [
        { id: 'd1', source: 'A', target: 'B', type: 'powers' },
        { id: 'd2', source: 'B', target: 'C', type: 'cools' },
        { id: 'd3', source: 'C', target: 'A', type: 'telecom' },
      ],
      sectors: ['Power', 'Water', 'Communication'],
      summary: {
        assetCount: 3,
        dependencyCount: 3,
        sectorCount: 3,
        sectorCounts: { Power: 1, Water: 1, Communication: 1, Transport: 0, Health: 0, 'Emergency Services': 0, Other: 0 },
      },
    };

    const result = simulateCascade(dataset, 'A');

    expect(result.affectedNodes.size).toBe(3);
    expect(result.totalSteps).toBe(2);
    expect(result.affectedNodes.get('A')?.step).toBe(0);
    expect(result.affectedNodes.get('B')?.step).toBe(1);
    expect(result.affectedNodes.get('C')?.step).toBe(2);
  });

  it('changing input dependencies changes cascade reachability', () => {
    const baseAssets: any[] = [
      { id: 'A', name: 'A', sector: 'Power', type: 'Node', status: 'operational' },
      { id: 'B', name: 'B', sector: 'Water', type: 'Node', status: 'operational' },
      { id: 'C', name: 'C', sector: 'Health', type: 'Node', status: 'operational' },
    ];

    // Config 1: A -> B only
    const dataset1: InfrastructureDataset = {
      name: 'Test 1',
      assets: baseAssets,
      dependencies: [{ id: 'd1', source: 'A', target: 'B', type: 'powers' }],
      sectors: ['Power', 'Water', 'Health'],
      summary: { assetCount: 3, dependencyCount: 1, sectorCount: 3, sectorCounts: { Power: 1, Water: 1, Health: 1, Transport: 0, Communication: 0, 'Emergency Services': 0, Other: 0 } },
    };
    const res1 = simulateCascade(dataset1, 'A');
    expect(res1.affectedNodes.size).toBe(2);
    expect(res1.affectedNodes.has('C')).toBe(false);

    // Config 2: A -> B and B -> C
    const dataset2: InfrastructureDataset = {
      name: 'Test 2',
      assets: baseAssets,
      dependencies: [
        { id: 'd1', source: 'A', target: 'B', type: 'powers' },
        { id: 'd2', source: 'B', target: 'C', type: 'powers' },
      ],
      sectors: ['Power', 'Water', 'Health'],
      summary: { assetCount: 3, dependencyCount: 2, sectorCount: 3, sectorCounts: { Power: 1, Water: 1, Health: 1, Transport: 0, Communication: 0, 'Emergency Services': 0, Other: 0 } },
    };
    const res2 = simulateCascade(dataset2, 'A');
    expect(res2.affectedNodes.size).toBe(3);
    expect(res2.affectedNodes.has('C')).toBe(true);
  });
});
