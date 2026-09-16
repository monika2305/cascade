import { describe, it, expect } from 'vitest';
import type { InfrastructureDataset } from '../types/infrastructure';
import { simulateCascade, getWhyPath } from './cascade';
import { findWeakPoints, runIntervention } from './analysis';
import sampleCascadeCity from '../data/sample_cascade_city.json';

describe('CASCADE MVP Verification Test Suite', () => {
  const dataset = sampleCascadeCity as unknown as InfrastructureDataset;

  it('Verifies Scenario 1: Main Grid Station (PWR-01) failure', () => {
    const cascade = simulateCascade(dataset, 'PWR-01');
    expect(cascade.affectedNodes.size).toBe(21);
    expect(cascade.sectorsReached.length).toBe(6);
    expect(cascade.totalSteps).toBe(4);
  });

  it('Verifies Scenario 2: Central Bridge (TRN-01) failure', () => {
    const cascade = simulateCascade(dataset, 'TRN-01');
    expect(cascade.affectedNodes.size).toBe(8);
    expect(cascade.sectorsReached.length).toBeGreaterThan(0);
    // Verifies different failure produces different affected set
    expect(cascade.affectedNodes.size).not.toBe(21);
  });

  it('Verifies Scenario 3: East Water Pump (WTR-03) failure', () => {
    const cascade = simulateCascade(dataset, 'WTR-03');
    expect(cascade.affectedNodes.size).toBe(3);
    // Verifies different failure produces different affected set
    expect(cascade.affectedNodes.size).not.toBe(21);
    expect(cascade.affectedNodes.size).not.toBe(8);
  });

  it('Verifies Weak Point Finder Ranking', () => {
    const weakPoints = findWeakPoints(dataset);
    expect(weakPoints[0].name).toBe('Main Grid Station');
    expect(weakPoints[0].totalCascadeAffected).toBe(21);

    expect(weakPoints[1].name).toBe('Main Water Treatment Plant');
    expect(weakPoints[1].totalCascadeAffected).toBe(12);

    expect(weakPoints[2].name).toBe('Central Substation');
    expect(weakPoints[2].totalCascadeAffected).toBe(12);
  });

  it('Verifies Causation Chain (WHY Path)', () => {
    const cascade = simulateCascade(dataset, 'PWR-01');
    // General Hospital (HLT-01) is affected downstream
    const whyPath = getWhyPath(dataset, cascade, 'HLT-01');
    expect(whyPath.length).toBeGreaterThan(1);
    expect(whyPath.some((step) => step.assetId === 'PWR-01')).toBe(true);
    expect(whyPath.some((step) => step.assetId === 'HLT-01')).toBe(true);
  });

  it('Verifies Action Lab: Protect Intervention', () => {
    const intervention = runIntervention(dataset, 'PWR-01', {
      type: 'protect_asset',
      name: 'Protect General Hospital',
      assetId: 'HLT-01',
    });
    expect(intervention.beforeAffectedCount).toBe(21);
    expect(intervention.afterAffectedCount).toBe(20);
    expect(intervention.savedAssetsCount).toBe(1);
    expect(intervention.savedAssetIds).toContain('HLT-01');
  });

  it('Verifies Action Lab: Sever Intervention', () => {
    const intervention = runIntervention(dataset, 'PWR-01', {
      type: 'isolate_connection',
      name: 'Sever Main Grid to Central Substation',
      sourceAssetId: 'PWR-01',
      targetAssetId: 'PWR-02',
    });
    expect(intervention.beforeAffectedCount).toBe(21);
    expect(intervention.afterAffectedCount).toBeLessThan(21);
    expect(intervention.savedAssetsCount).toBeGreaterThan(0);
  });
});
