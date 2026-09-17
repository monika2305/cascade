import { describe, it, expect } from 'vitest';
import type { InfrastructureDataset } from '../types/infrastructure';
import sampleCascadeCity from '../data/sample_cascade_city.json';
import { parseInfrastructureFile, buildDataset } from '../utils/parser';
import { computeGraphLayout } from '../utils/graphLayout';
import { calculateGraphBounds } from '../hooks/useGraphViewport';
import { simulateCascade } from '../utils/cascade';
import { findWeakPoints } from '../utils/analysis';
import { computeMultiStepRecoveryPlan } from '../utils/recoveryPlanner';
import { computeSphereLayout } from '../utils/sphereLayout';

describe('End-to-End Sample Data Loading and Navigation Regression Test', () => {
  it('1. Verifies sample_cascade_city.json has all required InfrastructureDataset properties', () => {
    expect(sampleCascadeCity.name).toBe('CASCADE Demo City');
    expect(Array.isArray(sampleCascadeCity.assets)).toBe(true);
    expect(sampleCascadeCity.assets.length).toBe(28);
    expect(Array.isArray(sampleCascadeCity.dependencies)).toBe(true);
    expect(sampleCascadeCity.dependencies.length).toBe(40);
    // Crucial check that previously caused the crash:
    expect(Array.isArray(sampleCascadeCity.sectors)).toBe(true);
    expect(sampleCascadeCity.sectors.length).toBe(6);
    expect(sampleCascadeCity.summary).toBeDefined();
    expect(sampleCascadeCity.summary.assetCount).toBe(28);
  });

  it('2. Verifies parseInfrastructureFile parses sample_cascade_city cleanly without errors', () => {
    const res = parseInfrastructureFile('sample_cascade_city.json', JSON.stringify(sampleCascadeCity));
    expect(res.success).toBe(true);
    expect(res.dataset).toBeDefined();
    const ds = res.dataset!;
    expect(ds.assets.length).toBe(28);
    expect(ds.dependencies.length).toBe(40);
    expect(ds.sectors.length).toBe(6);
    expect(ds.summary.sectorCount).toBe(6);
  });

  it('3. Verifies buildDataset fallback produces a fully-formed dataset with valid sectors and summary', () => {
    const ds = buildDataset(
      sampleCascadeCity.name,
      sampleCascadeCity.assets as any,
      sampleCascadeCity.dependencies as any
    );
    expect(ds.name).toBe('CASCADE Demo City');
    expect(ds.assets.length).toBe(28);
    expect(ds.dependencies.length).toBe(40);
    expect(Array.isArray(ds.sectors)).toBe(true);
    expect(ds.sectors.length).toBe(6);
    expect(ds.summary).toBeDefined();
    expect(ds.summary.assetCount).toBe(28);
  });

  it('4. Verifies City Network layout and bounds calculation for loaded sample dataset', () => {
    const ds = sampleCascadeCity as unknown as InfrastructureDataset;
    const layoutNodes = computeGraphLayout(ds);
    expect(layoutNodes.size).toBe(28);

    const bounds = calculateGraphBounds(layoutNodes, null);
    expect(Number.isFinite(bounds.graphWidth)).toBe(true);
    expect(Number.isFinite(bounds.graphHeight)).toBe(true);
    expect(Number.isFinite(bounds.cx)).toBe(true);
    expect(Number.isFinite(bounds.cy)).toBe(true);
    expect(bounds.graphWidth).toBeGreaterThan(0);
    expect(bounds.graphHeight).toBeGreaterThan(0);
  });

  it('5. Verifies all other feature engines consume the sample dataset without exceptions', () => {
    const ds = sampleCascadeCity as unknown as InfrastructureDataset;

    // Weak Points
    const weakPoints = findWeakPoints(ds);
    expect(weakPoints.length).toBeGreaterThan(0);

    // Failure Test
    const cascade = simulateCascade(ds, 'PWR-01');
    expect(cascade.affectedNodes.size).toBe(21);

    // City Twin
    const sphereLayout = computeSphereLayout(ds);
    expect(sphereLayout.size).toBe(28);
    const pwr = sphereLayout.get('PWR-01');
    expect(pwr).toBeDefined();
    expect(Math.abs(pwr!.x * pwr!.x + pwr!.y * pwr!.y + pwr!.z * pwr!.z - 1)).toBeLessThan(1e-5);
  });

  it('6. Verifies calculateGraphBounds handles empty, unmounted, or degenerate cases safely without NaN', () => {
    const emptyMap = new Map();
    const boundsEmpty = calculateGraphBounds(emptyMap, null);
    expect(Number.isFinite(boundsEmpty.graphWidth)).toBe(true);
    expect(Number.isFinite(boundsEmpty.graphHeight)).toBe(true);
    expect(Number.isFinite(boundsEmpty.cx)).toBe(true);
    expect(Number.isFinite(boundsEmpty.cy)).toBe(true);
    expect(boundsEmpty.graphWidth).toBe(400);
    expect(boundsEmpty.graphHeight).toBe(300);
  });
});
