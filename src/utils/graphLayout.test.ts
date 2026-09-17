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

  it('guarantees a balanced widescreen aspect ratio instead of an ultra-wide ribbon', () => {
    const dataset = sampleCascadeCity as unknown as InfrastructureDataset;
    const layout = computeGraphLayout(dataset);

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    layout.forEach((node) => {
      minX = Math.min(minX, node.x);
      maxX = Math.max(maxX, node.x + node.width);
      minY = Math.min(minY, node.y);
      maxY = Math.max(maxY, node.y + node.height);
    });

    const width = maxX - minX;
    const height = maxY - minY;
    const aspectRatio = width / height;

    // Must be a balanced ~16:9 / 4:3 widescreen ratio (between 1.1 and 2.0), NOT an ultra-wide ribbon (> 3.5)
    expect(aspectRatio).toBeGreaterThan(1.1);
    expect(aspectRatio).toBeLessThan(2.0);

    // Height should actively utilize screen canvas (> 500px), eliminating massive vertical blank space
    expect(height).toBeGreaterThan(500);

    // When fitted into a standard 1400x800 viewport with 82% target occupancy, initial zoom should be >= 0.70x
    const availWidth = 1400 * 0.82 - 40;
    const availHeight = 800 * 0.82 - 40;
    const fitZoom = Math.min(availWidth / width, availHeight / height);
    expect(fitZoom).toBeGreaterThanOrEqual(0.70);
  });

  it('positions Power & Water at top, Transport & Comms in middle, and Health & Emergency at bottom', () => {
    const dataset = sampleCascadeCity as unknown as InfrastructureDataset;
    const layout = computeGraphLayout(dataset);

    const pwr01 = layout.get('PWR-01'); // Power
    const wtr01 = layout.get('WTR-01'); // Water
    const com01 = layout.get('COM-01'); // Communication
    const hlt01 = layout.get('HLT-01'); // Health
    const ems01 = layout.get('EMS-01'); // Emergency Services

    expect(pwr01).toBeDefined();
    expect(wtr01).toBeDefined();
    expect(com01).toBeDefined();
    expect(hlt01).toBeDefined();
    expect(ems01).toBeDefined();

    // Top tier (Power & Water) must be positioned above middle tier (Comms)
    expect(pwr01!.y).toBeLessThan(com01!.y);
    expect(wtr01!.y).toBeLessThan(com01!.y);

    // Middle tier (Comms) must be positioned above bottom tier (Health & EMS)
    expect(com01!.y).toBeLessThan(hlt01!.y);
    expect(com01!.y).toBeLessThan(ems01!.y);
  });

  it('handles custom datasets without standard sector names gracefully', () => {
    // 9 assets in a single custom sector "Grid Sector"
    const customAssets = Array.from({ length: 9 }, (_, i) => ({
      id: `NODE-${i + 1}`,
      name: `Asset ${i + 1}`,
      sector: 'Custom Grid',
      criticality: 'HIGH' as const,
      backupPower: false,
      type: 'substation',
      status: 'OPERATIONAL' as const,
    }));
    const customDeps = [
      { id: 'd1', source: 'NODE-1', target: 'NODE-2', type: 'linked', strength: 1 },
      { id: 'd2', source: 'NODE-2', target: 'NODE-3', type: 'linked', strength: 1 },
      { id: 'd3', source: 'NODE-3', target: 'NODE-4', type: 'linked', strength: 1 },
      { id: 'd4', source: 'NODE-4', target: 'NODE-5', type: 'linked', strength: 1 },
    ];

    const dataset = {
      name: 'Custom City',
      assets: customAssets,
      dependencies: customDeps,
      sectors: ['Custom Grid'],
      summary: { assetCount: 9, dependencyCount: 4, sectorCount: 1, sectorCounts: { 'Custom Grid': 9 } },
    } as unknown as InfrastructureDataset;

    const layout = computeGraphLayout(dataset);
    expect(layout.size).toBe(9);

    layout.forEach((node) => {
      expect(Number.isFinite(node.x)).toBe(true);
      expect(Number.isFinite(node.y)).toBe(true);
    });
  });
});

