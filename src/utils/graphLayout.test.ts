import { describe, it, expect } from 'vitest';
import { computeGraphLayout, NODE_WIDTH, NODE_HEIGHT } from './graphLayout';
import type { InfrastructureDataset } from '../types/infrastructure';
import sampleCascadeCity from '../data/sample_cascade_city.json';

describe('Graph Layout Algorithm', () => {
  it('computes valid layout nodes for empty dataset', () => {
    const emptyDataset: InfrastructureDataset = {
      name: 'Empty City',
      assets: [],
      dependencies: [],
      sectors: [],
      summary: { assetCount: 0, dependencyCount: 0, sectorCount: 0, sectorCounts: {} as any },
    };
    const layout = computeGraphLayout(emptyDataset);
    expect(layout.size).toBe(0);
  });

  it('computes clean layered positions for sample city', () => {
    const dataset = sampleCascadeCity as unknown as InfrastructureDataset;
    const layout = computeGraphLayout(dataset);

    expect(layout.size).toBe(dataset.assets.length);

    // Verify all nodes have finite positive width/height and numeric x/y
    layout.forEach((node) => {
      expect(Number.isFinite(node.x)).toBe(true);
      expect(Number.isFinite(node.y)).toBe(true);
      expect(node.width).toBe(NODE_WIDTH);
      expect(node.height).toBe(NODE_HEIGHT);
      expect(node.level).toBeGreaterThanOrEqual(0);
    });

    // Verify root power stations are assigned to layer 0
    const pwr01 = layout.get('PWR-01');
    expect(pwr01).toBeDefined();
    expect(pwr01?.level).toBe(0);
  });
});
