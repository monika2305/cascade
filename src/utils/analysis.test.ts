import { describe, it, expect } from 'vitest';
import { findWeakPoints, runIntervention, generateContextualFixes, evaluateFixes } from './analysis';
import type { InfrastructureDataset } from '../types/infrastructure';
import fs from 'fs';

describe('Weak Point Finder Engine', () => {
  it('correctly ranks assets by cascade impact on cascade_demo_city.json', () => {
    const filePath = 'C:/Users/Dell/Downloads/cascade_demo_city.json';
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      const data = JSON.parse(content);
      const dataset: InfrastructureDataset = {
        name: data.name,
        assets: data.assets,
        dependencies: data.dependencies,
        sectors: ['Power', 'Water', 'Transport', 'Health', 'Communication', 'Emergency Services'],
        summary: {
          assetCount: data.assets.length,
          dependencyCount: data.dependencies.length,
          sectorCount: 6,
          sectorCounts: {} as any,
        },
      };

      const weakPoints = findWeakPoints(dataset);
      expect(weakPoints.length).toBe(dataset.assets.length);

      // Rank #1 should be PWR-01 (Main Grid Station)
      const rank1 = weakPoints[0];
      expect(rank1.assetId).toBe('PWR-01');
      expect(rank1.totalCascadeAffected).toBe(21);
      expect(rank1.criticality).toBe('Critical');
      expect(rank1.sectorsReachedCount).toBe(6);

      // PWR-02 should also be high ranking
      const pwr02 = weakPoints.find((wp) => wp.assetId === 'PWR-02');
      expect(pwr02).toBeDefined();
      expect(pwr02!.totalCascadeAffected).toBeGreaterThan(10);
    }
  });

  it('ranks leaf node assets as Low criticality with 0 downstream impact', () => {
    const dataset: InfrastructureDataset = {
      name: 'Small Tree',
      assets: [
        { id: 'root', name: 'Power Plant', sector: 'Power', type: 'Node', status: 'operational' },
        { id: 'leaf', name: 'Neighborhood Clinic', sector: 'Health', type: 'Node', status: 'operational' },
      ],
      dependencies: [{ id: 'e1', source: 'root', target: 'leaf', type: 'powers' }],
      sectors: ['Power', 'Health'],
      summary: { assetCount: 2, dependencyCount: 1, sectorCount: 2, sectorCounts: {} as any },
    };

    const weakPoints = findWeakPoints(dataset);
    expect(weakPoints[0].assetId).toBe('root');
    expect(weakPoints[0].totalCascadeAffected).toBe(2);

    expect(weakPoints[1].assetId).toBe('leaf');
    expect(weakPoints[1].totalCascadeAffected).toBe(1); // only itself
    expect(weakPoints[1].directDependentsCount).toBe(0);
    expect(weakPoints[1].criticality).toBe('Low');
  });

  it('dynamically recalculates weak points when dataset dependencies change', () => {
    const assets = [
      { id: 'A', name: 'Facility A', sector: 'Power', type: 'Node', status: 'operational' },
      { id: 'B', name: 'Facility B', sector: 'Water', type: 'Node', status: 'operational' },
      { id: 'C', name: 'Facility C', sector: 'Health', type: 'Node', status: 'operational' },
    ] as any;

    // Config 1: A feeds B, B feeds C -> A has impact 3, B has impact 2, C has impact 1
    const dataset1: InfrastructureDataset = {
      name: 'D1',
      assets,
      dependencies: [
        { id: '1', source: 'A', target: 'B', type: 'powers' },
        { id: '2', source: 'B', target: 'C', type: 'powers' },
      ],
      sectors: ['Power', 'Water', 'Health'],
      summary: { assetCount: 3, dependencyCount: 2, sectorCount: 3, sectorCounts: {} as any },
    };

    const wp1 = findWeakPoints(dataset1);
    expect(wp1[0].assetId).toBe('A');
    expect(wp1[0].totalCascadeAffected).toBe(3);

    // Config 2: Invert direction -> C feeds B, B feeds A -> C is now #1!
    const dataset2: InfrastructureDataset = {
      name: 'D2',
      assets,
      dependencies: [
        { id: '1', source: 'C', target: 'B', type: 'powers' },
        { id: '2', source: 'B', target: 'A', type: 'powers' },
      ],
      sectors: ['Power', 'Water', 'Health'],
      summary: { assetCount: 3, dependencyCount: 2, sectorCount: 3, sectorCounts: {} as any },
    };

    const wp2 = findWeakPoints(dataset2);
    expect(wp2[0].assetId).toBe('C');
    expect(wp2[0].totalCascadeAffected).toBe(3);
  });
});

describe('Action Lab Intervention Engine', () => {
  it('simulates protecting an asset and verifies saved assets delta', () => {
    // A -> B -> C -> D
    const dataset: InfrastructureDataset = {
      name: 'Chain',
      assets: [
        { id: 'A', name: 'Grid', sector: 'Power', type: 'Node', status: 'operational' },
        { id: 'B', name: 'Substation', sector: 'Power', type: 'Node', status: 'operational' },
        { id: 'C', name: 'Pump', sector: 'Water', type: 'Node', status: 'operational' },
        { id: 'D', name: 'Hospital', sector: 'Health', type: 'Node', status: 'operational' },
      ],
      dependencies: [
        { id: '1', source: 'A', target: 'B', type: 'powers' },
        { id: '2', source: 'B', target: 'C', type: 'powers' },
        { id: '3', source: 'C', target: 'D', type: 'water' },
      ],
      sectors: ['Power', 'Water', 'Health'],
      summary: { assetCount: 4, dependencyCount: 3, sectorCount: 3, sectorCounts: {} as any },
    };

    // Baseline: failing A affects all 4 (A, B, C, D)
    // Action: Protect C (islanding / local generator)
    const result = runIntervention(dataset, 'A', {
      type: 'protect_asset',
      name: 'Add Local Backup to Pump',
      assetId: 'C',
    });

    expect(result.beforeAffectedCount).toBe(4);
    expect(result.afterAffectedCount).toBe(2); // Only A and B fail now!
    expect(result.savedAssetsCount).toBe(2); // C and D were saved!
    expect(result.savedAssetIds).toContain('C');
    expect(result.savedAssetIds).toContain('D');
  });

  it('simulates isolating a compromised connection to quarantine cascade', () => {
    // A -> B -> C
    const dataset: InfrastructureDataset = {
      name: 'Isolate Test',
      assets: [
        { id: 'A', name: 'Plant', sector: 'Power', type: 'Node', status: 'operational' },
        { id: 'B', name: 'Substation', sector: 'Power', type: 'Node', status: 'operational' },
        { id: 'C', name: 'Hospital', sector: 'Health', type: 'Node', status: 'operational' },
      ],
      dependencies: [
        { id: '1', source: 'A', target: 'B', type: 'powers' },
        { id: '2', source: 'B', target: 'C', type: 'powers' },
      ],
      sectors: ['Power', 'Health'],
      summary: { assetCount: 3, dependencyCount: 2, sectorCount: 2, sectorCounts: {} as any },
    };

    // Isolate connection B -> C
    const result = runIntervention(dataset, 'A', {
      type: 'isolate_connection',
      name: 'Sever Line to Hospital',
      sourceAssetId: 'B',
      targetAssetId: 'C',
    });

    expect(result.beforeAffectedCount).toBe(3);
    expect(result.afterAffectedCount).toBe(2);
    expect(result.savedAssetsCount).toBe(1);
    expect(result.savedAssetIds).toEqual(['C']);
  });

  it('generates relevant, context-aware fixes for Power, Water, and Transport failures', () => {
    const filePath = 'C:/Users/Dell/Downloads/cascade_demo_city.json';
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      const data = JSON.parse(content);
      const dataset: InfrastructureDataset = {
        name: data.name,
        assets: data.assets,
        dependencies: data.dependencies,
        sectors: ['Power', 'Water', 'Transport', 'Health', 'Communication', 'Emergency Services'],
        summary: {
          assetCount: data.assets.length,
          dependencyCount: data.dependencies.length,
          sectorCount: 6,
          sectorCounts: {} as any,
        },
      };

      // 1. Power failure: PWR-01
      const powerFixes = generateContextualFixes(dataset, 'PWR-01');
      expect(powerFixes.length).toBeGreaterThan(0);
      expect(powerFixes.length).toBeLessThanOrEqual(3);
      // Verify power-specific wording / icons
      expect(powerFixes.some((f) => f.title.includes('FEEDER') || f.title.includes('POWER'))).toBe(true);
      // Run fix
      const pwrRes = runIntervention(dataset, 'PWR-01', powerFixes[0].action);
      expect(pwrRes.beforeAffectedCount).toBe(21);
      expect(pwrRes.afterAffectedCount).toBeLessThan(21);
      expect(pwrRes.savedAssetsCount).toBeGreaterThan(0);

      // 2. Water failure: WTR-01
      const waterFixes = generateContextualFixes(dataset, 'WTR-01');
      expect(waterFixes.length).toBeGreaterThan(0);
      expect(waterFixes.length).toBeLessThanOrEqual(3);
      // Verify water-specific wording / icons
      expect(waterFixes.some((f) => f.title.includes('WATER') || f.title.includes('PIPELINE'))).toBe(true);
      const wtrRes = runIntervention(dataset, 'WTR-01', waterFixes[0].action);
      expect(wtrRes.beforeAffectedCount).toBe(12);

      // 3. Transport failure: TRN-01
      const transportFixes = generateContextualFixes(dataset, 'TRN-01');
      expect(transportFixes.length).toBeGreaterThan(0);
      expect(transportFixes.some((f) => f.title.includes('ROUTE') || f.title.includes('ACCESS') || f.title.includes('TRANSIT'))).toBe(true);
      const trnRes = runIntervention(dataset, 'TRN-01', transportFixes[0].action);
      expect(trnRes.beforeAffectedCount).toBe(8);

      // Confirm different failures produce different fixes
      expect(powerFixes[0].title).not.toBe(waterFixes[0].title);
    }
  });

  it('deterministically calculates recommended fixes based on maximum services protected', () => {
    const filePath = 'C:/Users/Dell/Downloads/cascade_demo_city.json';
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      const data = JSON.parse(content);
      const dataset: InfrastructureDataset = {
        name: data.name,
        assets: data.assets,
        dependencies: data.dependencies,
        sectors: ['Power', 'Water', 'Transport', 'Health', 'Communication', 'Emergency Services'],
        summary: {
          assetCount: data.assets.length,
          dependencyCount: data.dependencies.length,
          sectorCount: 6,
          sectorCounts: {} as any,
        },
      };

      const fixes = generateContextualFixes(dataset, 'PWR-01');
      const evalResult = evaluateFixes(dataset, 'PWR-01', fixes);

      expect(evalResult.evaluatedFixes.length).toBe(fixes.length);
      expect(evalResult.maxProtected).toBeGreaterThan(0);
      expect(evalResult.recommendedFixIds.length).toBeGreaterThanOrEqual(1);

      // Verify that the recommended fix actually has servicesProtected === maxProtected
      const recommendedItem = evalResult.evaluatedFixes.find((f) => f.isRecommended);
      expect(recommendedItem).toBeDefined();
      expect(recommendedItem!.servicesProtected).toBe(evalResult.maxProtected);

      // Verify servicesProtected = beforeAffected - afterAffected
      evalResult.evaluatedFixes.forEach((item) => {
        expect(item.servicesProtected).toBe(
          item.result.beforeAffectedCount - item.result.afterAffectedCount
        );
      });
    }
  });

  it('correctly handles ties and reports "Both give the same improvement."', () => {
    // A -> B and A -> C (symmetric)
    const dataset: InfrastructureDataset = {
      name: 'Tie Scenario',
      assets: [
        { id: 'A', name: 'Power Plant', sector: 'Power', type: 'Node', status: 'operational' },
        { id: 'B', name: 'Substation North', sector: 'Power', type: 'Node', status: 'operational' },
        { id: 'C', name: 'Substation South', sector: 'Power', type: 'Node', status: 'operational' },
      ],
      dependencies: [
        { id: '1', source: 'A', target: 'B', type: 'powers' },
        { id: '2', source: 'A', target: 'C', type: 'powers' },
      ],
      sectors: ['Power'],
      summary: { assetCount: 3, dependencyCount: 2, sectorCount: 1, sectorCounts: {} as any },
    };

    const fixes = [
      {
        id: 'fix-b',
        icon: '⚡',
        title: 'ISOLATE B',
        description: 'Isolate B',
        protects: 'B',
        action: {
          type: 'isolate_connection' as const,
          name: 'Cut A->B',
          sourceAssetId: 'A',
          targetAssetId: 'B',
        },
      },
      {
        id: 'fix-c',
        icon: '⚡',
        title: 'ISOLATE C',
        description: 'Isolate C',
        protects: 'C',
        action: {
          type: 'isolate_connection' as const,
          name: 'Cut A->C',
          sourceAssetId: 'A',
          targetAssetId: 'C',
        },
      },
    ];

    const evalResult = evaluateFixes(dataset, 'A', fixes);
    expect(evalResult.maxProtected).toBe(1);
    expect(evalResult.hasTie).toBe(true);
    expect(evalResult.tieCount).toBe(2);
    expect(evalResult.statusMessage).toBe('Both give the same improvement.');
    expect(evalResult.recommendedFixIds).toContain('fix-b');
    expect(evalResult.recommendedFixIds).toContain('fix-c');
  });

  it('correctly reports when no available fix reduces impact', () => {
    // A -> B, A -> C, B -> C
    // If we cut B -> C, C still fails because A directly feeds C!
    const dataset: InfrastructureDataset = {
      name: 'No Improvement Scenario',
      assets: [
        { id: 'A', name: 'Plant', sector: 'Power', type: 'Node', status: 'operational' },
        { id: 'B', name: 'Station 1', sector: 'Power', type: 'Node', status: 'operational' },
        { id: 'C', name: 'Station 2', sector: 'Power', type: 'Node', status: 'operational' },
      ],
      dependencies: [
        { id: '1', source: 'A', target: 'B', type: 'powers' },
        { id: '2', source: 'A', target: 'C', type: 'powers' },
        { id: '3', source: 'B', target: 'C', type: 'backup' },
      ],
      sectors: ['Power'],
      summary: { assetCount: 3, dependencyCount: 3, sectorCount: 1, sectorCounts: {} as any },
    };

    // A candidate fix that only cuts connection B -> C (C still fails directly from A)
    const fixes = [
      {
        id: 'fix-cut-bc',
        icon: '⚡',
        title: 'ISOLATE B TO C',
        description: 'Cut link B->C',
        protects: 'Station 2',
        action: {
          type: 'isolate_connection' as const,
          name: 'Cut B->C',
          sourceAssetId: 'B',
          targetAssetId: 'C',
        },
      },
    ];

    const evalResult = evaluateFixes(dataset, 'A', fixes);
    expect(evalResult.maxProtected).toBe(0);
    expect(evalResult.recommendedFixIds.length).toBe(0);
    expect(evalResult.statusMessage).toBe('No available fix reduces the impact in this scenario.');
    expect(evalResult.evaluatedFixes[0].isRecommended).toBe(false);
  });
});

