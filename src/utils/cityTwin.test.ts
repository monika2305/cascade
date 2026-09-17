import { describe, it, expect } from 'vitest';
import type { InfrastructureDataset } from '../types/infrastructure';
import sampleCascadeCity from '../data/sample_cascade_city.json';
import {
  computeSphereLayout,
  rotatePoint3D,
  projectToScreen,
  projectNodes,
  projectArcs,
} from './sphereLayout';
import { simulateCascade } from './cascade';

describe('CASCADE City Twin 3D Sphere Engine', () => {
  const dataset = sampleCascadeCity as unknown as InfrastructureDataset;

  it('1. Computes 100% deterministic unit sphere coordinates for sample city', () => {
    const layout1 = computeSphereLayout(dataset);
    const layout2 = computeSphereLayout(dataset);

    expect(layout1.size).toBe(28);
    expect(layout2.size).toBe(28);

    // Verify identical coordinates on consecutive calls (determinism)
    layout1.forEach((node1, id) => {
      const node2 = layout2.get(id);
      expect(node2).toBeDefined();
      expect(node1.x).toBe(node2!.x);
      expect(node1.y).toBe(node2!.y);
      expect(node1.z).toBe(node2!.z);

      // Verify coordinate lies exactly on unit sphere (radius = 1)
      const radiusSq = node1.x * node1.x + node1.y * node1.y + node1.z * node1.z;
      expect(Math.abs(radiusSq - 1)).toBeLessThan(1e-5);
    });
  });

  it('2. Properly separates sector tiers (Power/Water north, Health/Emergency south)', () => {
    const layout = computeSphereLayout(dataset);

    const pwr01 = layout.get('PWR-01');
    const wtr01 = layout.get('WTR-01');
    const com01 = layout.get('COM-01');
    const hlt01 = layout.get('HLT-01');
    const ems01 = layout.get('EMS-01');

    expect(pwr01).toBeDefined();
    expect(wtr01).toBeDefined();
    expect(com01).toBeDefined();
    expect(hlt01).toBeDefined();
    expect(ems01).toBeDefined();

    // Upstream lifelines (Tier 0) in northern hemisphere (y > 0)
    expect(pwr01!.y).toBeGreaterThan(0);
    expect(wtr01!.y).toBeGreaterThan(0);

    // Downstream human services (Tier 2) in southern hemisphere (y < 0)
    expect(hlt01!.y).toBeLessThan(0);
    expect(ems01!.y).toBeLessThan(0);
  });

  it('3. Rotates and projects 3D points to 2D screen space accurately', () => {
    // Top north pole: (0, 1, 0)
    const p = rotatePoint3D(0, 1, 0, 0, 0);
    expect(p.x).toBe(0);
    expect(p.y).toBe(1);
    expect(p.z).toBe(0);

    const proj = projectToScreen(p, 200, 200, 100);
    expect(proj.screenX).toBe(200);
    expect(proj.screenY).toBe(100); // 200 - 1*100
  });

  it('4. Projects all nodes with depth-sorting', () => {
    const layout = computeSphereLayout(dataset);
    const projected = projectNodes(layout, 250, 250, 180, 0.2, 0.4);

    expect(projected.length).toBe(28);

    // Verify sorted by depth ascending (-1 to +1)
    for (let i = 1; i < projected.length; i++) {
      expect(projected[i].depth).toBeGreaterThanOrEqual(projected[i - 1].depth);
    }
  });

  it('5. Projects elevated 3D arcs for all real dependencies', () => {
    const layout = computeSphereLayout(dataset);
    const arcs = projectArcs(dataset.dependencies, layout, 250, 250, 180, 0, 0);

    expect(arcs.length).toBe(dataset.dependencies.length);
    arcs.forEach((arc) => {
      expect(arc.points.length).toBeGreaterThan(5);
      expect(Number.isFinite(arc.averageDepth)).toBe(true);
    });
  });

  it('6. Accurately links with deterministic simulation state for AFTER twin', () => {
    const cascadeResult = simulateCascade(dataset, 'PWR-01');
    expect(cascadeResult.affectedNodes.size).toBe(21);

    // Initial root node is failed
    const rootNode = cascadeResult.affectedNodes.get('PWR-01');
    expect(rootNode).toBeDefined();
    expect(rootNode?.step).toBe(0);

    // Downstream nodes have step > 0
    let maxStep = 0;
    cascadeResult.affectedNodes.forEach((info) => {
      if (info.step > maxStep) maxStep = info.step;
    });
    expect(maxStep).toBeGreaterThanOrEqual(2);
  });
});
