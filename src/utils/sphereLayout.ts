import type { Asset, Dependency, InfrastructureDataset } from '../types/infrastructure';
import { getSectorTier } from './graphLayout';

export interface Sphere3DNode {
  asset: Asset;
  // Normalized 3D position on unit sphere (x^2 + y^2 + z^2 = 1)
  x: number;
  y: number;
  z: number;
  tier: number;
  color: string;
}

export interface ProjectedNode extends Sphere3DNode {
  // 2D screen projected coordinates
  screenX: number;
  screenY: number;
  // Depth after rotation: [-1, 1], where > 0 is front-facing and < 0 is rear
  depth: number;
  // Visual radius in pixels
  radius: number;
  // Opacity based on depth
  opacity: number;
  isFront: boolean;
}

export interface ProjectedArc {
  sourceId: string;
  targetId: string;
  // Sample points along the elevated 3D arc projected to 2D screen
  points: { x: number; y: number; depth: number }[];
  isFront: boolean;
  averageDepth: number;
}

const SECTOR_COLORS: Record<string, string> = {
  Power: '#eab308', // Amber / yellow
  Water: '#06b6d4', // Cyan
  Transport: '#3b82f6', // Blue
  Communication: '#a855f7', // Purple
  Health: '#ec4899', // Pink
  'Emergency Services': '#ef4444', // Red
};

export function getSectorColor(sector?: string): string {
  if (!sector) return '#94a3b8';
  return SECTOR_COLORS[sector] || '#38bdf8';
}

/**
 * Computes deterministic 3D positions on a unit sphere using a Fibonacci Sphere algorithm.
 * 
 * Assets are sorted deterministically:
 * 1. Primary sort: Sector tier (Tier 0: Power & Water in upper hemisphere; Tier 1: Transport & Comms along equator; Tier 2: Health & Emergency in lower hemisphere).
 * 2. Secondary sort: In-degree / topological depth.
 * 3. Tertiary sort: Asset ID.
 * 
 * ZERO Math.random() is used. Coordinates are 100% mathematically stable and reproducible.
 */
export function computeSphereLayout(dataset: InfrastructureDataset): Map<string, Sphere3DNode> {
  const nodes = new Map<string, Sphere3DNode>();
  if (!dataset.assets || dataset.assets.length === 0) return nodes;

  // Compute incoming degree for secondary sorting
  const inDegreeMap = new Map<string, number>();
  for (const a of dataset.assets) inDegreeMap.set(a.id, 0);
  for (const d of dataset.dependencies) {
    if (inDegreeMap.has(d.target)) {
      inDegreeMap.set(d.target, (inDegreeMap.get(d.target) || 0) + 1);
    }
  }

  // Deterministically sort assets
  const sortedAssets = [...dataset.assets].sort((a, b) => {
    const tierA = getSectorTier(a.sector);
    const tierB = getSectorTier(b.sector);
    if (tierA !== tierB) return tierA - tierB;

    const inA = inDegreeMap.get(a.id) || 0;
    const inB = inDegreeMap.get(b.id) || 0;
    if (inA !== inB) return inA - inB;

    return a.id.localeCompare(b.id);
  });

  const count = sortedAssets.length;
  // Golden ratio increment for Fibonacci sphere
  const goldenAngle = Math.PI * (3 - Math.sqrt(5)); // ~2.399963

  sortedAssets.forEach((asset, i) => {
    // y ranges from ~ +0.92 (North Pole) to -0.92 (South Pole)
    // Upstream utilities (Tier 0) -> Northern hemisphere
    // Middle connectivity (Tier 1) -> Equator
    // Human services (Tier 2) -> Southern hemisphere
    const y = count === 1 ? 0 : 1 - (i / (count - 1)) * 1.84 - 0.08;
    const radiusAtY = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = i * goldenAngle;

    const x = Math.cos(theta) * radiusAtY;
    const z = Math.sin(theta) * radiusAtY;

    // Normalize precisely to unit sphere
    const len = Math.hypot(x, y, z) || 1;
    nodes.set(asset.id, {
      asset,
      x: x / len,
      y: y / len,
      z: z / len,
      tier: getSectorTier(asset.sector),
      color: getSectorColor(asset.sector),
    });
  });

  return nodes;
}

/**
 * 3D Rotation Matrix around X and Y axes.
 * Rotates point (x, y, z) by rotX and rotY Euler angles.
 */
export function rotatePoint3D(
  x: number,
  y: number,
  z: number,
  rotX: number,
  rotY: number
): { x: number; y: number; z: number } {
  // Rotate around Y axis (horizontal yaw)
  const cosY = Math.cos(rotY);
  const sinY = Math.sin(rotY);
  const x1 = x * cosY + z * sinY;
  const y1 = y;
  const z1 = -x * sinY + z * cosY;

  // Rotate around X axis (vertical pitch)
  const cosX = Math.cos(rotX);
  const sinX = Math.sin(rotX);
  const x2 = x1;
  const y2 = y1 * cosX - z1 * sinX;
  const z2 = y1 * sinX + z1 * cosX;

  return { x: x2, y: y2, z: z2 };
}

/**
 * Projects a 3D point on the sphere surface to 2D screen coordinates.
 */
export function projectToScreen(
  p3d: { x: number; y: number; z: number },
  centerX: number,
  centerY: number,
  radius: number
): { screenX: number; screenY: number; depth: number } {
  return {
    screenX: centerX + p3d.x * radius,
    screenY: centerY - p3d.y * radius, // Invert Y for canvas/SVG coordinate space
    depth: p3d.z, // > 0 is front-facing, < 0 is rear
  };
}

/**
 * Projects all nodes given current canvas center, sphere radius, and rotation angles.
 */
export function projectNodes(
  nodes: Map<string, Sphere3DNode>,
  centerX: number,
  centerY: number,
  radius: number,
  rotX: number,
  rotY: number
): ProjectedNode[] {
  const projected: ProjectedNode[] = [];

  nodes.forEach((node) => {
    const rotated = rotatePoint3D(node.x, node.y, node.z, rotX, rotY);
    const proj = projectToScreen(rotated, centerX, centerY, radius);

    // Front facing (z > 0) has larger radius and higher opacity
    const isFront = proj.depth > 0;
    const depthFactor = (proj.depth + 1) / 2; // [0, 1]
    const visualRadius = isFront ? 5 + depthFactor * 3.5 : 3 + depthFactor * 2;
    const opacity = isFront ? 0.75 + depthFactor * 0.25 : 0.2 + depthFactor * 0.35;

    projected.push({
      ...node,
      screenX: proj.screenX,
      screenY: proj.screenY,
      depth: proj.depth,
      radius: visualRadius,
      opacity,
      isFront,
    });
  });

  // Sort from farthest back (depth -1) to closest front (depth +1) for proper z-layer rendering
  return projected.sort((a, b) => a.depth - b.depth);
}

/**
 * Generates 3D elevated arcs between connected nodes on the sphere surface.
 */
export function projectArcs(
  dependencies: Dependency[],
  nodesMap: Map<string, Sphere3DNode>,
  centerX: number,
  centerY: number,
  radius: number,
  rotX: number,
  rotY: number,
  steps = 12
): ProjectedArc[] {
  const arcs: ProjectedArc[] = [];

  for (const dep of dependencies) {
    const source = nodesMap.get(dep.source);
    const target = nodesMap.get(dep.target);
    if (!source || !target) continue;

    // Angular distance between points
    const dot = source.x * target.x + source.y * target.y + source.z * target.z;
    const clampedDot = Math.max(-1, Math.min(1, dot));
    const angle = Math.acos(clampedDot);

    // Maximum elevation height of arc above sphere surface
    const maxElevation = Math.min(0.28, Math.sin(angle / 2) * 0.35);

    const points: { x: number; y: number; depth: number }[] = [];
    let totalDepth = 0;

    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      // Spherical linear interpolation between source and target
      const sinTotal = Math.sin(angle);
      let px: number, py: number, pz: number;

      if (sinTotal < 0.001) {
        px = source.x;
        py = source.y;
        pz = source.z;
      } else {
        const wA = Math.sin((1 - t) * angle) / sinTotal;
        const wB = Math.sin(t * angle) / sinTotal;
        px = wA * source.x + wB * target.x;
        py = wA * source.y + wB * target.y;
        pz = wA * source.z + wB * target.z;
      }

      // Parabolic arc elevation
      const elevation = 1 + Math.sin(t * Math.PI) * maxElevation;
      const elevatedX = px * elevation;
      const elevatedY = py * elevation;
      const elevatedZ = pz * elevation;

      // Rotate point
      const rotated = rotatePoint3D(elevatedX, elevatedY, elevatedZ, rotX, rotY);
      const proj = projectToScreen(rotated, centerX, centerY, radius);
      points.push({ x: proj.screenX, y: proj.screenY, depth: proj.depth });
      totalDepth += proj.depth;
    }

    const avgDepth = totalDepth / (steps + 1);
    arcs.push({
      sourceId: dep.source,
      targetId: dep.target,
      points,
      isFront: avgDepth > -0.15,
      averageDepth: avgDepth,
    });
  }

  // Sort back to front
  return arcs.sort((a, b) => a.averageDepth - b.averageDepth);
}
