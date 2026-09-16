import type { Asset, Dependency, InfrastructureDataset, ParseResult, Sector } from '../types/infrastructure';

const VALID_SECTORS: Sector[] = [
  'Power',
  'Water',
  'Transport',
  'Health',
  'Communication',
  'Emergency Services',
  'Other',
];

export function normalizeSector(input?: string): Sector {
  if (!input) return 'Other';
  const clean = input.trim().toLowerCase();

  if (/^(power|electric|electricity|energy|grid|substation|generator)$/i.test(clean) || clean.includes('power') || clean.includes('electric')) {
    return 'Power';
  }
  if (/^(water|sewer|sewage|hydro|sanitation|reservoir|pump)$/i.test(clean) || clean.includes('water')) {
    return 'Water';
  }
  if (/^(transport|transportation|transit|road|rail|metro|bus|bridge|highway)$/i.test(clean) || clean.includes('transit') || clean.includes('transport')) {
    return 'Transport';
  }
  if (/^(health|hospital|healthcare|medical|clinic|ambulance)$/i.test(clean) || clean.includes('health') || clean.includes('hospital')) {
    return 'Health';
  }
  if (/^(comm|communication|telecom|cellular|network|internet|radio|fiber)$/i.test(clean) || clean.includes('comm') || clean.includes('telecom')) {
    return 'Communication';
  }
  if (/^(emergency|emergency services|police|fire|rescue|ems|disaster)$/i.test(clean) || clean.includes('emergency') || clean.includes('fire') || clean.includes('police')) {
    return 'Emergency Services';
  }

  const exactMatch = VALID_SECTORS.find((s) => s.toLowerCase() === clean);
  return exactMatch || 'Other';
}

function normalizeStatus(input?: string): Asset['status'] {
  if (!input) return 'operational';
  const clean = input.trim().toLowerCase();
  if (clean === 'failed' || clean === 'offline' || clean === 'down' || clean === 'inactive') return 'failed';
  if (clean === 'degraded' || clean === 'warning' || clean === 'strained') return 'degraded';
  return 'operational';
}

/**
 * Extracts a string endpoint identifier from various shapes (string, number, or object with id/name/key)
 */
function extractEndpoint(val: any): string | null {
  if (val === null || val === undefined) return null;
  if (typeof val === 'string' || typeof val === 'number') {
    const s = String(val).trim();
    return s.length > 0 ? s : null;
  }
  if (typeof val === 'object') {
    const cand =
      val.id ??
      val.assetId ??
      val.asset_id ??
      val.sourceId ??
      val.targetId ??
      val.source_id ??
      val.target_id ??
      val.nodeId ??
      val.node_id ??
      val.name ??
      val.label ??
      val.key;
    if (cand !== undefined && cand !== null) {
      const s = String(cand).trim();
      return s.length > 0 ? s : null;
    }
  }
  return null;
}

/**
/**
 * Extracts the source asset identifier supporting all common aliases:
 * source, sourceId, source_id, from, fromId, from_node, sourceNode, src, origin, supplier, provider, etc.
 */
function extractSource(edge: any): string | null {
  if (!edge) return null;
  if (Array.isArray(edge)) {
    return edge.length >= 1 ? extractEndpoint(edge[0]) : null;
  }
  if (typeof edge !== 'object') return null;
  const obj = (edge.data && typeof edge.data === 'object' && !Array.isArray(edge.data))
    ? { ...edge, ...edge.data }
    : edge;

  const candidate =
    obj.source ??
    obj.sourceId ??
    obj.source_id ??
    obj.sourceID ??
    obj.from ??
    obj.fromId ??
    obj.from_id ??
    obj.fromNode ??
    obj.from_node ??
    obj.sourceNode ??
    obj.source_node ??
    obj.sourceAsset ??
    obj.source_asset ??
    obj.sourceAssetId ??
    obj.source_asset_id ??
    obj.supplier ??
    obj.provider ??
    obj.upstream ??
    obj.upstream_id ??
    obj.predecessor ??
    obj.head ??
    obj.parent ??
    obj.origin ??
    obj.start ??
    obj.start_node ??
    obj.node1 ??
    obj.node_1 ??
    obj.src ??
    obj.a ??
    obj.u;

  return extractEndpoint(candidate);
}

/**
 * Extracts the target asset identifier supporting all common aliases:
 * target, targetId, target_id, to, toId, to_node, targetNode, dst, dest, destination, consumer, dependent, etc.
 */
function extractTarget(edge: any): string | null {
  if (!edge) return null;
  if (Array.isArray(edge)) {
    return edge.length >= 2 ? extractEndpoint(edge[1]) : null;
  }
  if (typeof edge !== 'object') return null;
  const obj = (edge.data && typeof edge.data === 'object' && !Array.isArray(edge.data))
    ? { ...edge, ...edge.data }
    : edge;

  const candidate =
    obj.target ??
    obj.targetId ??
    obj.target_id ??
    obj.targetID ??
    obj.to ??
    obj.toId ??
    obj.to_id ??
    obj.toNode ??
    obj.to_node ??
    obj.targetNode ??
    obj.target_node ??
    obj.targetAsset ??
    obj.target_asset ??
    obj.targetAssetId ??
    obj.target_asset_id ??
    obj.consumer ??
    obj.dependent ??
    obj.downstream ??
    obj.downstream_id ??
    obj.successor ??
    obj.tail ??
    obj.child ??
    obj.dest ??
    obj.destination ??
    obj.dst ??
    obj.end ??
    obj.end_node ??
    obj.node2 ??
    obj.node_2 ??
    obj.b ??
    obj.v;

  return extractEndpoint(candidate);
}

function extractDependencyType(edge: any): string {
  if (!edge) return 'connected_to';
  if (Array.isArray(edge)) {
    return edge.length >= 3 && edge[2] ? String(edge[2]).trim() : 'connected_to';
  }
  if (typeof edge !== 'object') return 'connected_to';
  const obj = (edge.data && typeof edge.data === 'object' && !Array.isArray(edge.data))
    ? { ...edge, ...edge.data }
    : edge;

  const candidate =
    obj.type ??
    obj.relation ??
    obj.relationship ??
    obj.link_type ??
    obj.linkType ??
    obj.dependencyType ??
    obj.dependency_type ??
    obj.connectionType ??
    obj.connection_type ??
    obj.label ??
    'connected_to';

  return String(candidate).trim();
}

function extractStrength(edge: any): number {
  if (!edge || typeof edge !== 'object') return 1;
  const obj = (edge.data && typeof edge.data === 'object' && !Array.isArray(edge.data))
    ? { ...edge, ...edge.data }
    : edge;

  const val = obj.strength ?? obj.weight ?? obj.importance ?? 1;
  const num = Number(val);
  return isNaN(num) ? 1 : num;
}

/**
 * Searches a parsed JSON object for the list of dependencies across all common container names
 */
function findDependencyList(data: any): any[] {
  if (!data) return [];

  // Root array containing edges
  if (Array.isArray(data)) {
    const edges = data.filter((item) => {
      if (!item) return false;
      const s = extractSource(item);
      const t = extractTarget(item);
      return Boolean(s && t);
    });
    if (edges.length > 0) return edges;
    return [];
  }

  if (typeof data !== 'object') return [];

  const directKeys = [
    'dependencies',
    'dependencyList',
    'dependency_list',
    'dependencies_list',
    'dependency',
    'edges',
    'edgeList',
    'edge_list',
    'links',
    'linkList',
    'link_list',
    'connections',
    'connectionList',
    'connection_list',
    'relationships',
    'relations',
    'lines',
    'arcs',
    'routes',
    'feeders',
    'flows',
    'interconnections',
  ];

  for (const k of directKeys) {
    if (Array.isArray(data[k]) && data[k].length > 0) {
      return data[k];
    }
  }

  // Cytoscape flat elements array: { elements: [ { data: { source, target } } ] }
  if (Array.isArray(data.elements)) {
    const edges = data.elements.filter((item: any) => {
      if (!item) return false;
      const s = extractSource(item);
      const t = extractTarget(item);
      return Boolean(s && t);
    });
    if (edges.length > 0) return edges;
  }

  // Nested containers: graph, network, elements, data
  const containers = [data.graph, data.network, data.elements, data.data];
  for (const c of containers) {
    if (c && typeof c === 'object') {
      for (const k of directKeys) {
        if (Array.isArray(c[k]) && c[k].length > 0) {
          return c[k];
        }
      }
    }
  }

  // Fallback: search any key containing dependency / edge / link / connect / relat
  for (const [key, value] of Object.entries(data)) {
    const lower = key.toLowerCase();
    if (
      lower.includes('depend') ||
      lower.includes('edge') ||
      lower.includes('link') ||
      lower.includes('connect') ||
      lower.includes('relat')
    ) {
      if (Array.isArray(value) && value.length > 0) {
        return value;
      }
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const vals = Object.values(value);
        if (vals.length > 0 && typeof vals[0] === 'object') {
          return vals;
        }
        // Adjacency map: { "nodeA": ["nodeB", "nodeC"] }
        const adjacencyEdges: any[] = [];
        for (const [src, targets] of Object.entries(value)) {
          if (Array.isArray(targets)) {
            for (const tgt of targets) {
              adjacencyEdges.push({ source: src, target: tgt });
            }
          } else if (typeof targets === 'string' || typeof targets === 'number') {
            adjacencyEdges.push({ source: src, target: targets });
          }
        }
        if (adjacencyEdges.length > 0) return adjacencyEdges;
      }
    }
  }

  return [];
}

/**
 * Searches a parsed JSON object for the list of assets across all common container names
 */
function findAssetList(data: any): any[] {
  if (!data) return [];
  if (Array.isArray(data)) return data;

  const directKeys = [
    'assets',
    'assetList',
    'asset_list',
    'nodes',
    'nodeList',
    'node_list',
    'infrastructure',
    'components',
    'facilities',
    'elements',
  ];

  for (const k of directKeys) {
    if (Array.isArray(data[k]) && data[k].length > 0) {
      return data[k];
    }
  }

  // Nested containers
  const containers = [data.graph, data.network, data.elements, data.data];
  for (const c of containers) {
    if (c && typeof c === 'object') {
      for (const k of directKeys) {
        if (Array.isArray(c[k]) && c[k].length > 0) {
          return c[k];
        }
      }
    }
  }

  // Fallback search by key name
  for (const [key, value] of Object.entries(data)) {
    const lower = key.toLowerCase();
    if (
      lower.includes('asset') ||
      lower.includes('node') ||
      lower.includes('infra') ||
      lower.includes('component') ||
      lower.includes('facilit')
    ) {
      if (Array.isArray(value) && value.length > 0) {
        return value;
      }
    }
  }

  return [];
}

/**
 * Builds dataset summary strictly computed from parsed assets and dependencies
 */
export function buildDataset(name: string, rawAssets: Asset[], rawDependencies: Dependency[]): InfrastructureDataset {
  const assetMap = new Map<string, Asset>();
  // Map of identifiers (ID, lowercase ID, Name, lowercase Name) to canonical asset.id
  const idMap = new Map<string, string>();

  for (const a of rawAssets) {
    if (!assetMap.has(a.id)) {
      assetMap.set(a.id, a);
      idMap.set(a.id, a.id);
      idMap.set(a.id.trim(), a.id);
      idMap.set(a.id.toLowerCase(), a.id);
      idMap.set(a.id.trim().toLowerCase(), a.id);
      if (a.name) {
        idMap.set(a.name, a.id);
        idMap.set(a.name.trim(), a.id);
        idMap.set(a.name.toLowerCase(), a.id);
        idMap.set(a.name.trim().toLowerCase(), a.id);
      }
    }
  }

  const normalizedDependencies: Dependency[] = [];
  const seenDeps = new Set<string>();

  for (const dep of rawDependencies) {
    if (!dep.source || !dep.target) continue;

    const rawSrc = String(dep.source).trim();
    const rawTgt = String(dep.target).trim();
    if (!rawSrc || !rawTgt) continue;

    // Resolve aliases to canonical asset IDs
    const resolvedSrc = idMap.get(rawSrc) || idMap.get(rawSrc.toLowerCase()) || idMap.get(rawSrc.trim().toLowerCase()) || rawSrc;
    const resolvedTgt = idMap.get(rawTgt) || idMap.get(rawTgt.toLowerCase()) || idMap.get(rawTgt.trim().toLowerCase()) || rawTgt;

    const depKey = `${resolvedSrc}->${resolvedTgt}:${dep.type || 'connected_to'}`;
    if (seenDeps.has(depKey)) continue;
    seenDeps.add(depKey);

    // If source or target is not explicitly registered, add inferred node
    if (!assetMap.has(resolvedSrc)) {
      const newAsset: Asset = {
        id: resolvedSrc,
        name: resolvedSrc,
        sector: 'Other',
        type: 'Inferred Node',
        status: 'operational',
      };
      assetMap.set(resolvedSrc, newAsset);
      idMap.set(resolvedSrc, resolvedSrc);
      idMap.set(resolvedSrc.toLowerCase(), resolvedSrc);
    }
    if (!assetMap.has(resolvedTgt)) {
      const newAsset: Asset = {
        id: resolvedTgt,
        name: resolvedTgt,
        sector: 'Other',
        type: 'Inferred Node',
        status: 'operational',
      };
      assetMap.set(resolvedTgt, newAsset);
      idMap.set(resolvedTgt, resolvedTgt);
      idMap.set(resolvedTgt.toLowerCase(), resolvedTgt);
    }

    normalizedDependencies.push({
      id: dep.id || `dep-${normalizedDependencies.length + 1}`,
      source: resolvedSrc,
      target: resolvedTgt,
      type: dep.type || 'connected_to',
      strength: typeof dep.strength === 'number' ? dep.strength : 1,
    });
  }

  console.log('[PIPELINE] raw dependency count received in buildDataset:', rawDependencies.length);
  console.log('[PIPELINE] normalized dependency count:', normalizedDependencies.length);
  if (normalizedDependencies.length > 0) {
    console.log('[PIPELINE] first normalized dependency:', normalizedDependencies[0]);
  }

  const assets = Array.from(assetMap.values());
  const dependencies = normalizedDependencies;

  const sectorCounts: Record<Sector, number> = {
    Power: 0,
    Water: 0,
    Transport: 0,
    Health: 0,
    Communication: 0,
    'Emergency Services': 0,
    Other: 0,
  };

  for (const asset of assets) {
    sectorCounts[asset.sector] = (sectorCounts[asset.sector] || 0) + 1;
  }

  const presentSectors = Object.entries(sectorCounts)
    .filter(([, count]) => count > 0)
    .map(([sector]) => sector as Sector);

  return {
    name,
    assets,
    dependencies,
    sectors: presentSectors,
    summary: {
      assetCount: assets.length,
      dependencyCount: dependencies.length,
      sectorCount: presentSectors.length,
      sectorCounts,
    },
  };
}

/**
 * Parse JSON data into InfrastructureDataset
 */
export function parseJSON(content: string, filename = 'Uploaded Dataset'): ParseResult {
  if (!content || !content.trim()) {
    return { success: false, errors: ['The file is empty. Please upload a valid JSON file.'] };
  }

  let data: any;
  try {
    data = JSON.parse(content);
  } catch {
    return {
      success: false,
      errors: ['Invalid JSON format. Please ensure the file has valid JSON syntax.'],
    };
  }

  const rawAssets: Asset[] = [];
  const rawDeps: Dependency[] = [];
  const warnings: string[] = [];

  // Robust asset and dependency list discovery
  const assetList = findAssetList(data);
  const depList = findDependencyList(data);

  if (Array.isArray(assetList)) {
    for (let i = 0; i < assetList.length; i++) {
      const item = assetList[i];
      if (!item || typeof item !== 'object') continue;

      // Handle items in mixed arrays that are actually edges
      const edgeSrc = extractSource(item);
      const edgeTgt = extractTarget(item);
      const isEdge = Boolean(edgeSrc && edgeTgt && !item.sector);

      if (isEdge && edgeSrc && edgeTgt) {
        rawDeps.push({
          id: item.id || `dep-${rawDeps.length + 1}`,
          source: edgeSrc,
          target: edgeTgt,
          type: extractDependencyType(item),
          strength: extractStrength(item),
        });
        continue;
      }

      // Handle node with potential nested data (e.g. Cytoscape { data: { id, name } })
      const obj = (item.data && typeof item.data === 'object' && !Array.isArray(item.data))
        ? { ...item, ...item.data }
        : item;

      const id = String(obj.id || obj.assetId || obj.asset_id || obj.nodeId || obj.node_id || obj.key || `asset-${i + 1}`).trim();
      const name = String(obj.name || obj.label || obj.title || id).trim();
      const sector = normalizeSector(obj.sector || obj.category || obj.domain || obj.system);
      const type = String(obj.type || obj.assetType || obj.subtype || sector);
      const status = normalizeStatus(obj.status);

      const lat = obj.latitude ?? obj.lat;
      const lng = obj.longitude ?? obj.lng ?? obj.lon;
      const capacity = obj.capacity ? Number(obj.capacity) : undefined;
      const currentLoad = obj.currentLoad ?? obj.load ? Number(obj.currentLoad ?? obj.load) : undefined;

      rawAssets.push({
        id,
        name,
        sector,
        type,
        status,
        latitude: typeof lat === 'number' && !isNaN(lat) ? lat : undefined,
        longitude: typeof lng === 'number' && !isNaN(lng) ? lng : undefined,
        capacity: typeof capacity === 'number' && !isNaN(capacity) ? capacity : undefined,
        currentLoad: typeof currentLoad === 'number' && !isNaN(currentLoad) ? currentLoad : undefined,
        description: obj.description,
      });

      // Inline dependencies check (e.g. item.dependencies, item.dependsOn, item.depends_on, etc.)
      const inlineCandidates = [
        obj.dependencies,
        obj.dependsOn,
        obj.depends_on,
        obj.connectedTo,
        obj.connected_to,
        obj.connections,
        obj.links,
        obj.targets,
        obj.supplies,
        obj.feeds,
        obj.reliesOn,
        obj.relies_on,
        obj.edges,
      ];

      for (const cand of inlineCandidates) {
        if (!cand) continue;
        if (Array.isArray(cand)) {
          for (const targetItem of cand) {
            if (typeof targetItem === 'string' || typeof targetItem === 'number') {
              rawDeps.push({
                source: id,
                target: String(targetItem).trim(),
                type: 'depends_on',
              });
            } else if (typeof targetItem === 'object' && targetItem !== null) {
              const src = extractSource(targetItem) || id;
              const tgt = extractTarget(targetItem) || extractEndpoint(targetItem);
              if (tgt) {
                rawDeps.push({
                  source: src,
                  target: tgt,
                  type: extractDependencyType(targetItem),
                  strength: extractStrength(targetItem),
                });
              }
            }
          }
        } else if (typeof cand === 'string') {
          const parts = cand.split(/[,;|]/).map((s) => s.trim()).filter(Boolean);
          for (const p of parts) {
            rawDeps.push({
              source: id,
              target: p,
              type: 'depends_on',
            });
          }
        }
      }
    }
  }

  // Process explicit dependency list
  if (Array.isArray(depList)) {
    for (let i = 0; i < depList.length; i++) {
      const edge = depList[i];
      if (!edge || typeof edge !== 'object') continue;

      const source = extractSource(edge);
      const target = extractTarget(edge);

      if (!source || !target) {
        warnings.push(`Connection #${i + 1} skipped because source or target could not be identified.`);
        continue;
      }

      rawDeps.push({
        id: edge.id || `dep-${rawDeps.length + 1}`,
        source,
        target,
        type: extractDependencyType(edge),
        strength: extractStrength(edge),
      });
    }
  }

  console.log('[PIPELINE] raw dependency count:', rawDeps.length);

  if (rawAssets.length === 0 && rawDeps.length === 0) {
    return {
      success: false,
      errors: ['No infrastructure assets or connections could be found in the file.'],
    };
  }

  const dataset = buildDataset(data.name || filename.replace(/\.[^/.]+$/, ''), rawAssets, rawDeps);
  return { success: true, dataset, warnings };
}

/**
 * Robust CSV line splitter that handles quotes
 */
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"' || char === "'") {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

/**
 * Parse CSV content into InfrastructureDataset
 */
export function parseCSV(content: string, filename = 'Uploaded CSV'): ParseResult {
  if (!content || !content.trim()) {
    return { success: false, errors: ['The CSV file is empty.'] };
  }

  const rawLines = content
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'));

  if (rawLines.length === 0) {
    return { success: false, errors: ['No data rows found in CSV.'] };
  }

  const header = parseCsvLine(rawLines[0]).map((h) => h.toLowerCase().replace(/[^a-z0-9_]/g, ''));
  const rawAssets: Asset[] = [];
  const rawDeps: Dependency[] = [];
  const warnings: string[] = [];

  const sourceIdx = header.findIndex((h) =>
    ['source', 'from', 'source_id', 'sourceid', 'source_node', 'sourcenode', 'src', 'origin'].includes(h)
  );
  const targetIdx = header.findIndex((h) =>
    ['target', 'to', 'target_id', 'targetid', 'target_node', 'targetnode', 'dst', 'dest', 'destination'].includes(h)
  );
  const hasSource = sourceIdx >= 0;
  const hasTarget = targetIdx >= 0;
  const hasAssetId = header.includes('id') || header.includes('asset_id') || header.includes('assetid') || header.includes('name');

  if (hasSource && hasTarget) {
    // Edge-list CSV
    const typeIdx = header.findIndex((h) => ['type', 'relation', 'dependency_type', 'connection'].includes(h));
    const strengthIdx = header.findIndex((h) => ['strength', 'weight', 'importance'].includes(h));

    // Optional node info in edge list
    const sourceNameIdx = header.findIndex((h) => ['source_name', 'sourcename'].includes(h));
    const sourceSectorIdx = header.findIndex((h) => ['source_sector', 'sourcesector'].includes(h));
    const targetNameIdx = header.findIndex((h) => ['target_name', 'targetname'].includes(h));
    const targetSectorIdx = header.findIndex((h) => ['target_sector', 'targetsector'].includes(h));

    for (let i = 1; i < rawLines.length; i++) {
      const cols = parseCsvLine(rawLines[i]);
      const source = cols[sourceIdx];
      const target = cols[targetIdx];

      if (!source || !target) continue;

      if (sourceNameIdx >= 0 || sourceSectorIdx >= 0) {
        rawAssets.push({
          id: source,
          name: sourceNameIdx >= 0 && cols[sourceNameIdx] ? cols[sourceNameIdx] : source,
          sector: normalizeSector(sourceSectorIdx >= 0 ? cols[sourceSectorIdx] : undefined),
          type: 'Node',
          status: 'operational',
        });
      }

      if (targetNameIdx >= 0 || targetSectorIdx >= 0) {
        rawAssets.push({
          id: target,
          name: targetNameIdx >= 0 && cols[targetNameIdx] ? cols[targetNameIdx] : target,
          sector: normalizeSector(targetSectorIdx >= 0 ? cols[targetSectorIdx] : undefined),
          type: 'Node',
          status: 'operational',
        });
      }

      rawDeps.push({
        id: `dep-${i}`,
        source,
        target,
        type: typeIdx >= 0 && cols[typeIdx] ? cols[typeIdx] : 'connected_to',
        strength: strengthIdx >= 0 && cols[strengthIdx] ? Number(cols[strengthIdx]) || 1 : 1,
      });
    }
  } else if (hasAssetId) {
    // Asset list CSV
    const idIdx = header.findIndex((h) => ['id', 'asset_id', 'assetid', 'node_id', 'nodeid'].includes(h));
    const nameIdx = header.findIndex((h) => ['name', 'label', 'title'].includes(h));
    const sectorIdx = header.findIndex((h) => ['sector', 'category', 'domain', 'system'].includes(h));
    const typeIdx = header.findIndex((h) => ['type', 'asset_type', 'subtype'].includes(h));
    const statusIdx = header.findIndex((h) => ['status', 'state'].includes(h));
    const depsIdx = header.findIndex((h) =>
      ['dependencies', 'depends_on', 'dependson', 'connected_to', 'connectedto', 'links', 'connections', 'targets', 'feeds'].includes(h)
    );

    for (let i = 1; i < rawLines.length; i++) {
      const cols = parseCsvLine(rawLines[i]);
      const id = idIdx >= 0 && cols[idIdx] ? cols[idIdx] : `asset-${i}`;
      const name = nameIdx >= 0 && cols[nameIdx] ? cols[nameIdx] : id;
      const sector = normalizeSector(sectorIdx >= 0 ? cols[sectorIdx] : undefined);
      const type = typeIdx >= 0 && cols[typeIdx] ? cols[typeIdx] : sector;
      const status = normalizeStatus(statusIdx >= 0 ? cols[statusIdx] : undefined);

      rawAssets.push({
        id,
        name,
        sector,
        type,
        status,
      });

      if (depsIdx >= 0 && cols[depsIdx]) {
        const targets = cols[depsIdx].split(/;|\|/).map((s) => s.trim()).filter(Boolean);
        for (const target of targets) {
          rawDeps.push({
            source: id,
            target,
            type: 'depends_on',
          });
        }
      }
    }
  } else {
    return {
      success: false,
      errors: [
        'Could not detect standard column headers in CSV. Expected columns like: id, name, sector or source, target.',
      ],
    };
  }

  if (rawAssets.length === 0 && rawDeps.length === 0) {
    return {
      success: false,
      errors: ['No valid rows could be processed from this CSV file.'],
    };
  }

  const dataset = buildDataset(filename.replace(/\.[^/.]+$/, ''), rawAssets, rawDeps);
  return { success: true, dataset, warnings };
}

/**
 * Universal parser for uploaded file content
 */
export function parseInfrastructureFile(filename: string, content: string): ParseResult {
  const lowerName = filename.toLowerCase();
  if (lowerName.endsWith('.json')) {
    return parseJSON(content, filename);
  }
  if (lowerName.endsWith('.csv') || lowerName.endsWith('.txt')) {
    return parseCSV(content, filename);
  }

  // Attempt JSON first, then CSV
  const jsonResult = parseJSON(content, filename);
  if (jsonResult.success) return jsonResult;

  const csvResult = parseCSV(content, filename);
  if (csvResult.success) return csvResult;

  return {
    success: false,
    errors: ['Unsupported file format. Please provide a .csv or .json file.'],
  };
}
