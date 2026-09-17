import { useEffect, useRef } from 'react';
import { RAIL_PATH, SCENE, TRAFFIC_ROUTES } from './cityGeometry';

type Point = { x: number; y: number; angle: number };
function samplePath(d: string) {
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', d);
  const length = path.getTotalLength();
  // Sample once. The animation loop does no SVG geometry or DOM layout work.
  const samples: Point[] = Array.from({ length: Math.ceil(length / 2) + 1 }, (_, i) => {
    const p = path.getPointAtLength(Math.min(i * 2, length));
    const next = path.getPointAtLength(Math.min(i * 2 + 1, length));
    return { x: p.x, y: p.y, angle: Math.atan2(next.y - p.y, next.x - p.x) };
  });
  return { length, samples };
}
function position(route: ReturnType<typeof samplePath>, distance: number) {
  const index = Math.max(0, Math.min(route.samples.length - 2, distance / 2));
  const i = Math.floor(index), t = index - i, a = route.samples[i], b = route.samples[i + 1];
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, angle: a.angle };
}

export function MovingTraffic({ running }: { running: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const elapsed = useRef(0);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;
    const routes = TRAFFIC_ROUTES.map(route => ({ ...route, geometry: samplePath(route.path) }));
    const rail = samplePath(RAIL_PATH);
    let raf = 0, last = 0, previousDraw = 0, width = 0, height = 0, dpr = 1;
    const compact = window.matchMedia('(max-width: 700px)').matches;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = rect.width; height = rect.height; dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
      render(elapsed.current);
    };
    function vehicle(point: Point, index: number, train = false) {
      if (!ctx) return;
      const size = train ? 1 : .62 + point.y / SCENE.height * .88;
      ctx.save(); ctx.translate(point.x, point.y); ctx.rotate(point.angle); ctx.scale(size, size);
      const length = train ? 18 : 6.6, breadth = train ? 4.1 : 3.1;
      ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(-length / 2 + .6, -breadth / 2 + 1, length, breadth);
      ctx.fillStyle = train ? '#bbc8c7' : ['#c2c9c8', '#506671', '#a5b9bd', '#59646c'][index % 4];
      ctx.fillRect(-length / 2, -breadth / 2, length, breadth);
      ctx.fillStyle = '#122a36'; ctx.fillRect(length * .1, -breadth / 2 + .2, train ? length * .55 : 1.4, breadth - .4);
      if (train) {
        ctx.fillStyle = '#f8dba0';
        for (let j = -6; j <= 6; j += 4) ctx.fillRect(j, -breadth / 2, 2, .7);
      } else {
        const glow = ctx.createRadialGradient(length / 2 + 1, 0, 0, length / 2 + 1, 0, 8);
        glow.addColorStop(0, 'rgba(255,240,193,.26)'); glow.addColorStop(1, 'rgba(255,240,193,0)');
        ctx.fillStyle = glow; ctx.fillRect(-4, -8, 16, 16);
        ctx.fillStyle = '#fff3d6'; ctx.fillRect(length / 2 - .6, -breadth / 2, 1.3, .85); ctx.fillRect(length / 2 - .6, breadth / 2 - .85, 1.3, .85);
        ctx.fillStyle = '#ff714c'; ctx.fillRect(-length / 2, -breadth / 2, 1, .8); ctx.fillRect(-length / 2, breadth / 2 - .8, 1, .8);
      }
      ctx.restore();
    }
    function render(time: number) {
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, width, height);
      ctx.scale(width / SCENE.width, height / SCENE.height);
      for (const route of routes) {
        const count = compact ? Math.ceil(route.count * .6) : route.count;
        for (let i = 0; i < count; i++) {
          const offset = route.geometry.length * (i + .37) / count;
          const speed = route.speed * (1 + (i % 3) * .055);
          vehicle(position(route.geometry, (offset + time * speed) % route.geometry.length), i);
        }
      }
      // Five coupled carriages travel the railway, independently of road traffic.
      const engine = (time * 20 + 560) % (rail.length + 170);
      for (let i = 0; i < 5; i++) {
        const distance = engine - i * 20;
        if (distance > 0 && distance < rail.length) vehicle(position(rail, distance), i, true);
      }
      // Fine highlights on the actual water surface; no particles across buildings.
      ctx.lineWidth = .55;
      for (let i = 0; i < 18; i++) {
        const x = 620 + (i % 6) * 58, y = 405 + Math.floor(i / 6) * 31;
        ctx.strokeStyle = `rgba(187,204,217,${.025 + (Math.sin(time * .65 + i * 1.9) + 1) * .035})`;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 9 + Math.sin(time + i) * 3, y); ctx.stroke();
      }
    }
    const frame = (now: number) => {
      if (last) elapsed.current += Math.min((now - last) / 1000, .08);
      last = now;
      if (now - previousDraw >= (compact ? 32 : 15)) { render(elapsed.current); previousDraw = now; }
      raf = requestAnimationFrame(frame);
    };
    const observer = new ResizeObserver(resize); observer.observe(canvas); resize();
    if (running) raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); observer.disconnect(); };
  }, [running]);
  return <canvas ref={ref} className="cc-traffic" aria-hidden="true" />;
}
