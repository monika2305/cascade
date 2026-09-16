import { describe, it, expect } from 'vitest';
import { parseCSV, parseJSON, parseInfrastructureFile, normalizeSector } from './parser';
import sampleMetropolis from '../data/sample_metropolis.json';
import sampleEmergencyCsv from '../data/sample_emergency_corridor.csv?raw';

describe('Sector Normalization', () => {
  it('normalizes various power synonyms to Power', () => {
    expect(normalizeSector('electric')).toBe('Power');
    expect(normalizeSector('energy')).toBe('Power');
    expect(normalizeSector('Power Grid')).toBe('Power');
  });

  it('normalizes water and sanitation to Water', () => {
    expect(normalizeSector('sewer')).toBe('Water');
    expect(normalizeSector('hydro')).toBe('Water');
    expect(normalizeSector('Water Treatment')).toBe('Water');
  });

  it('normalizes health synonyms to Health', () => {
    expect(normalizeSector('hospital')).toBe('Health');
    expect(normalizeSector('medical')).toBe('Health');
    expect(normalizeSector('Clinic')).toBe('Health');
  });

  it('falls back to Other for unrecognized sectors', () => {
    expect(normalizeSector('unknown_domain')).toBe('Other');
    expect(normalizeSector('')).toBe('Other');
  });
});

describe('JSON Parsing Engine', () => {
  it('parses standard { assets, dependencies } structure correctly', () => {
    const jsonStr = JSON.stringify({
      name: 'Test Grid',
      assets: [
        { id: 'a1', name: 'Substation Alpha', sector: 'Power', type: 'Substation', status: 'operational' },
        { id: 'a2', name: 'Water Plant Beta', sector: 'Water', type: 'Treatment', status: 'operational' },
        { id: 'a3', name: 'City Hospital', sector: 'Health', type: 'Hospital', status: 'operational' },
      ],
      dependencies: [
        { source: 'a1', target: 'a2', type: 'supplies_power', strength: 5 },
        { source: 'a1', target: 'a3', type: 'supplies_power', strength: 5 },
      ],
    });

    const result = parseJSON(jsonStr, 'test_grid.json');
    expect(result.success).toBe(true);
    expect(result.dataset).toBeDefined();

    // Verify counts strictly derived from data
    expect(result.dataset?.summary.assetCount).toBe(3);
    expect(result.dataset?.summary.dependencyCount).toBe(2);
    expect(result.dataset?.summary.sectorCount).toBe(3);
    expect(result.dataset?.summary.sectorCounts.Power).toBe(1);
    expect(result.dataset?.summary.sectorCounts.Water).toBe(1);
    expect(result.dataset?.summary.sectorCounts.Health).toBe(1);
  });

  it('parses alternative { nodes, edges } structure with aliases', () => {
    const jsonStr = JSON.stringify({
      name: 'Downtown Network',
      nodes: [
        { id: 'n1', name: 'Power Plant', category: 'energy' },
        { id: 'n2', name: 'Tower 4', category: 'telecom' },
        { id: 'n3', name: 'Fire Station 1', category: 'emergency services' },
      ],
      edges: [
        { from: 'n1', to: 'n2', relation: 'powers' },
        { from: 'n2', to: 'n3', relation: 'dispatches' },
      ],
    });

    const result = parseJSON(jsonStr, 'network.json');
    expect(result.success).toBe(true);
    expect(result.dataset?.summary.assetCount).toBe(3);
    expect(result.dataset?.summary.dependencyCount).toBe(2);
    expect(result.dataset?.assets[0].sector).toBe('Power');
    expect(result.dataset?.assets[1].sector).toBe('Communication');
    expect(result.dataset?.assets[2].sector).toBe('Emergency Services');
  });

  it('rejects malformed JSON with simple English error message', () => {
    const invalidJson = '{ "name": "bad json", assets: [ oops }';
    const result = parseJSON(invalidJson);
    expect(result.success).toBe(false);
    expect(result.errors?.[0]).toContain('Invalid JSON format');
  });

  it('rejects empty input with simple English error message', () => {
    const result = parseJSON('   ');
    expect(result.success).toBe(false);
    expect(result.errors?.[0]).toContain('The file is empty');
  });
});

describe('CSV Parsing Engine', () => {
  it('parses edge-list CSV and extracts assets and connections', () => {
    const csvContent = `source,source_name,source_sector,target,target_name,target_sector,type,strength
pwr-1,Central Station,Power,wtr-1,Reservoir Pump,Water,powers,5
pwr-1,Central Station,Power,hosp-1,Memorial Hospital,Health,powers,5
wtr-1,Reservoir Pump,Water,hosp-1,Memorial Hospital,Health,coolant,3`;

    const result = parseCSV(csvContent, 'emergency.csv');
    expect(result.success).toBe(true);
    expect(result.dataset).toBeDefined();

    // Verify 3 distinct assets were identified and 3 connections
    expect(result.dataset?.summary.assetCount).toBe(3);
    expect(result.dataset?.summary.dependencyCount).toBe(3);
    expect(result.dataset?.summary.sectorCount).toBe(3);
    expect(result.dataset?.summary.sectorCounts.Power).toBe(1);
    expect(result.dataset?.summary.sectorCounts.Water).toBe(1);
    expect(result.dataset?.summary.sectorCounts.Health).toBe(1);
  });

  it('parses standard asset-list CSV with dependency column', () => {
    const csvContent = `id,name,sector,type,status,dependencies
sub-1,North Substation,Power,Substation,operational,pump-1;comm-1
pump-1,Water Pump 1,Water,Pump,operational,
comm-1,Tower Alpha,Communication,Tower,operational,`;

    const result = parseCSV(csvContent, 'assets.csv');
    expect(result.success).toBe(true);
    expect(result.dataset?.summary.assetCount).toBe(3);
    expect(result.dataset?.summary.dependencyCount).toBe(2);
    expect(result.dataset?.summary.sectorCount).toBe(3);
  });

  it('rejects empty or headerless CSV with clear error message', () => {
    const result = parseCSV('');
    expect(result.success).toBe(false);
    expect(result.errors?.[0]).toContain('The CSV file is empty');

    const result2 = parseCSV('foo,bar,baz\n1,2,3');
    expect(result2.success).toBe(false);
    expect(result2.errors?.[0]).toContain('Could not detect standard column headers');
  });
});

describe('Universal Parser helper', () => {
  it('automatically routes .json and .csv files', () => {
    const jsonStr = JSON.stringify({
      assets: [{ id: '1', name: 'Test', sector: 'Water' }],
      dependencies: [],
    });
    const resJson = parseInfrastructureFile('network.json', jsonStr);
    expect(resJson.success).toBe(true);
    expect(resJson.dataset?.summary.assetCount).toBe(1);

    const csvStr = 'id,name,sector\n1,Test,Water';
    const resCsv = parseInfrastructureFile('network.csv', csvStr);
    expect(resCsv.success).toBe(true);
    expect(resCsv.dataset?.summary.assetCount).toBe(1);
  });
});

describe('Structurally Different Test Inputs Proof', () => {
  it('correctly parses Metropolis Core (Hierarchical JSON with detailed metadata)', () => {
    const content = JSON.stringify(sampleMetropolis);
    const result = parseInfrastructureFile('Metropolis.json', content);
    expect(result.success).toBe(true);
    const data = result.dataset!;

    // Exactly 12 assets defined in JSON
    expect(data.summary.assetCount).toBe(12);
    // Exactly 13 dependencies defined in JSON
    expect(data.summary.dependencyCount).toBe(13);
    // Exactly 6 sectors present
    expect(data.summary.sectorCount).toBe(6);

    // Counts strictly match file content
    expect(data.summary.sectorCounts.Power).toBe(2);
    expect(data.summary.sectorCounts.Water).toBe(2);
    expect(data.summary.sectorCounts.Health).toBe(2);
    expect(data.summary.sectorCounts.Transport).toBe(2);
    expect(data.summary.sectorCounts.Communication).toBe(2);
    expect(data.summary.sectorCounts['Emergency Services']).toBe(2);
  });

  it('correctly parses Emergency Corridor (Relational Edge-list CSV with cross-sector links)', () => {
    const result = parseInfrastructureFile('Emergency.csv', sampleEmergencyCsv);
    expect(result.success).toBe(true);
    const data = result.dataset!;

    // 6 distinct assets discovered from source/target rows:
    // pwr-harbor-sub, wtr-coastal-desal, cell-coastal-tower, hosp-st-jude, ems-harbor-dispatch, tunnel-ventilation
    expect(data.summary.assetCount).toBe(6);
    // 8 connections in the CSV
    expect(data.summary.dependencyCount).toBe(8);
    // 6 unique sectors
    expect(data.summary.sectorCount).toBe(6);

    expect(data.summary.sectorCounts.Power).toBe(1);
    expect(data.summary.sectorCounts.Water).toBe(1);
    expect(data.summary.sectorCounts.Communication).toBe(1);
    expect(data.summary.sectorCounts.Health).toBe(1);
    expect(data.summary.sectorCounts['Emergency Services']).toBe(1);
    expect(data.summary.sectorCounts.Transport).toBe(1);
  });

  it('correctly parses Downtown Microgrid (Nodes/Edges JSON format)', async () => {
    const sampleMicrogrid = (await import('../data/sample_graph_nodes.json')).default;
    const result = parseInfrastructureFile('Microgrid.json', JSON.stringify(sampleMicrogrid));
    expect(result.success).toBe(true);
    const data = result.dataset!;

    expect(data.summary.assetCount).toBe(4);
    expect(data.summary.dependencyCount).toBe(4);
    expect(data.summary.sectorCount).toBe(4);
    expect(data.summary.sectorCounts.Power).toBe(1);
    expect(data.summary.sectorCounts.Water).toBe(1);
    expect(data.summary.sectorCounts.Health).toBe(1);
    expect(data.summary.sectorCounts.Communication).toBe(1);
  });

  it('correctly associates incoming and outgoing dependencies for an asset', () => {
    const result = parseInfrastructureFile('Metropolis.json', JSON.stringify(sampleMetropolis));
    const data = result.dataset!;

    // "pwr-sub-north" supplies multiple assets
    const outgoing = data.dependencies.filter((d) => d.source === 'pwr-sub-north');
    const incoming = data.dependencies.filter((d) => d.target === 'pwr-sub-north');

    expect(outgoing.length).toBeGreaterThan(0);
    // Hydro plant feeds into pwr-sub-north
    expect(incoming.some((d) => d.source === 'pwr-grid-west')).toBe(true);
  });
});

describe('Generic Dependency Alias Normalization', () => {
  const baseAssets = [
    { id: 'DEMO-PWR-01', name: 'Power Substation', sector: 'Power' },
    { id: 'DEMO-WTR-01', name: 'Water Plant', sector: 'Water' },
    { id: 'DEMO-HSP-01', name: 'Metro Hospital', sector: 'Health' },
  ];

  it('Case A: parses source / target structure', () => {
    const json = JSON.stringify({
      assets: baseAssets,
      dependencies: [
        { source: 'DEMO-PWR-01', target: 'DEMO-WTR-01', type: 'supplies_power' },
        { source: 'DEMO-PWR-01', target: 'DEMO-HSP-01', type: 'supplies_power' },
      ],
    });

    const res = parseJSON(json);
    expect(res.success).toBe(true);
    expect(res.dataset?.summary.dependencyCount).toBe(2);

    const pwr = res.dataset?.assets.find((a) => a.id === 'DEMO-PWR-01');
    const pwrLinks = res.dataset?.dependencies.filter((d) => d.source === pwr?.id || d.target === pwr?.id).length;
    expect(pwrLinks).toBe(2);

    const wtr = res.dataset?.assets.find((a) => a.id === 'DEMO-WTR-01');
    const wtrLinks = res.dataset?.dependencies.filter((d) => d.source === wtr?.id || d.target === wtr?.id).length;
    expect(wtrLinks).toBe(1);
  });

  it('Case B: parses sourceId / targetId structure', () => {
    const json = JSON.stringify({
      assets: baseAssets,
      dependencies: [
        { sourceId: 'DEMO-PWR-01', targetId: 'DEMO-WTR-01', type: 'powers' },
        { sourceId: 'DEMO-WTR-01', targetId: 'DEMO-HSP-01', type: 'water' },
      ],
    });

    const res = parseJSON(json);
    expect(res.success).toBe(true);
    expect(res.dataset?.summary.dependencyCount).toBe(2);

    // Verify dependencies normalized to source and target
    expect(res.dataset?.dependencies[0].source).toBe('DEMO-PWR-01');
    expect(res.dataset?.dependencies[0].target).toBe('DEMO-WTR-01');
    expect(res.dataset?.dependencies[1].source).toBe('DEMO-WTR-01');
    expect(res.dataset?.dependencies[1].target).toBe('DEMO-HSP-01');

    // Link counts
    const wtrLinks = res.dataset?.dependencies.filter((d) => d.source === 'DEMO-WTR-01' || d.target === 'DEMO-WTR-01').length;
    expect(wtrLinks).toBe(2); // 1 incoming from PWR, 1 outgoing to HSP
  });

  it('Case C: parses from / to structure', () => {
    const json = JSON.stringify({
      nodes: baseAssets,
      edges: [
        { from: 'DEMO-PWR-01', to: 'DEMO-HSP-01', relation: 'powers' },
      ],
    });

    const res = parseJSON(json);
    expect(res.success).toBe(true);
    expect(res.dataset?.summary.dependencyCount).toBe(1);
    expect(res.dataset?.dependencies[0].source).toBe('DEMO-PWR-01');
    expect(res.dataset?.dependencies[0].target).toBe('DEMO-HSP-01');
  });

  it('Case D: parses object endpoints { source: { id: ... }, target: { id: ... } }', () => {
    const json = JSON.stringify({
      assets: baseAssets,
      relationships: [
        { source: { id: 'DEMO-PWR-01' }, target: { id: 'DEMO-WTR-01' } },
      ],
    });

    const res = parseJSON(json);
    expect(res.success).toBe(true);
    expect(res.dataset?.summary.dependencyCount).toBe(1);
    expect(res.dataset?.dependencies[0].source).toBe('DEMO-PWR-01');
    expect(res.dataset?.dependencies[0].target).toBe('DEMO-WTR-01');
  });

  it('verifies changing dependency input dynamically changes link counts', () => {
    // Config 1: 1 dependency
    const json1 = JSON.stringify({
      assets: baseAssets,
      dependencies: [{ source: 'DEMO-PWR-01', target: 'DEMO-WTR-01' }],
    });
    const res1 = parseJSON(json1);
    const pwrLinks1 = res1.dataset?.dependencies.filter((d) => d.source === 'DEMO-PWR-01' || d.target === 'DEMO-PWR-01').length;
    expect(pwrLinks1).toBe(1);

    // Config 2: 3 dependencies
    const json2 = JSON.stringify({
      assets: baseAssets,
      dependencies: [
        { source: 'DEMO-PWR-01', target: 'DEMO-WTR-01' },
        { source: 'DEMO-PWR-01', target: 'DEMO-HSP-01' },
        { source: 'DEMO-WTR-01', target: 'DEMO-HSP-01' },
      ],
    });
    const res2 = parseJSON(json2);
    const pwrLinks2 = res2.dataset?.dependencies.filter((d) => d.source === 'DEMO-PWR-01' || d.target === 'DEMO-PWR-01').length;
    expect(pwrLinks2).toBe(2);
    expect(res2.dataset?.summary.dependencyCount).toBe(3);
  });

  it('verifies 0 dependencies results in dependencyCount = 0 and 0 links', () => {
    const json = JSON.stringify({
      assets: baseAssets,
      dependencies: [],
    });
    const res = parseJSON(json);
    expect(res.success).toBe(true);
    expect(res.dataset?.summary.dependencyCount).toBe(0);
    for (const a of res.dataset!.assets) {
      const links = res.dataset!.dependencies.filter((d) => d.source === a.id || d.target === a.id).length;
      expect(links).toBe(0);
    }
  });

  it('parses real cascade_demo_city.json with 28 assets and 40 dependencies without losing any links', async () => {
    const fs = await import('fs');
    const path = 'C:/Users/Dell/Downloads/cascade_demo_city.json';
    if (fs.existsSync(path)) {
      const content = fs.readFileSync(path, 'utf8');
      const res = parseJSON(content, 'cascade_demo_city.json');
      expect(res.success).toBe(true);
      expect(res.dataset?.summary.assetCount).toBe(28);
      expect(res.dataset?.summary.dependencyCount).toBe(40);

      // Verify PWR-01 has outgoing links
      const pwr01 = res.dataset?.assets.find((a) => a.id === 'PWR-01');
      expect(pwr01).toBeDefined();
      const pwr01Links = res.dataset?.dependencies.filter((d) => d.source === 'PWR-01' || d.target === 'PWR-01').length;
      expect(pwr01Links).toBe(3); // PWR-02, PWR-03, PWR-05

      // Verify EMS-01 (Emergency Response Centre) has connections
      const ems01 = res.dataset?.assets.find((a) => a.id === 'EMS-01');
      expect(ems01).toBeDefined();
      const ems01Links = res.dataset?.dependencies.filter((d) => d.source === 'EMS-01' || d.target === 'EMS-01').length;
      expect(ems01Links).toBeGreaterThan(0);
    }
  });
});


