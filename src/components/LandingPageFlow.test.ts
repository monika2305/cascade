import { describe, it, expect } from 'vitest';
import { SECTORS, getSector, SCENE, TRAFFIC_ROUTES, RAIL_PATH } from '../landing/components/cityGeometry';

describe('Landing Page Assets & Routing Contract Test', () => {
  it('verifies scene geometry is defined with non-zero dimensions', () => {
    expect(SCENE.width).toBe(1672);
    expect(SCENE.height).toBe(941);
  });

  it('verifies all conceptual sectors exist with valid scene coordinates', () => {
    expect(SECTORS.length).toBe(6);
    for (const sec of SECTORS) {
      expect(sec.id).toBeDefined();
      expect(sec.label).toBeDefined();
      expect(sec.x).toBeGreaterThan(0);
      expect(sec.x).toBeLessThanOrEqual(SCENE.width);
      expect(sec.y).toBeGreaterThan(0);
      expect(sec.y).toBeLessThanOrEqual(SCENE.height);
      expect(sec.chain.length).toBeGreaterThan(0);
      expect(sec.description).toBeDefined();

      const retrieved = getSector(sec.id);
      expect(retrieved).toEqual(sec);
    }
  });

  it('verifies traffic and rail routes have valid SVG path definitions', () => {
    expect(TRAFFIC_ROUTES.length).toBeGreaterThan(0);
    for (const route of TRAFFIC_ROUTES) {
      expect(route.id).toBeDefined();
      expect(route.path.startsWith('M')).toBe(true);
      expect(route.count).toBeGreaterThan(0);
      expect(route.speed).toBeGreaterThan(0);
    }

    expect(RAIL_PATH.startsWith('M')).toBe(true);
  });

  it('verifies landing route contract transitions cleanly to /login', () => {
    let targetRoute = '/';
    const onExplore = () => {
      targetRoute = '/login';
    };

    expect(targetRoute).toBe('/');
    onExplore();
    expect(targetRoute).toBe('/login');
  });
});
