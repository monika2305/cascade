import { useEffect, useRef, useState } from 'react';
import cityImage from '../assets/city-night.webp';
import { MovingTraffic } from './MovingTraffic';
import { InfrastructureMarker } from './InfrastructureMarker';
import { Icon } from './Icons';
import { getSector, SCENE, SECTORS, type Sector } from './cityGeometry';

export function CinematicCity({ running, showConnections }: { running: boolean; showConnections: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<Sector | null>(null);
  const [selected, setSelected] = useState<Sector | null>(null);
  const current = hover ?? selected ?? (showConnections ? 'power' : null);
  const sector = current ? getSector(current) : null;
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const fine = window.matchMedia('(pointer: fine)');
    let targetX = 0, targetY = 0, x = 0, y = 0, raf = 0, previous = 0;
    const pointer = (event: PointerEvent) => {
      if (!fine.matches || event.pointerType !== 'mouse') return;
      targetX = (event.clientX / window.innerWidth - .5) * 2;
      targetY = (event.clientY / window.innerHeight - .5) * 2;
    };
    const leave = () => { targetX = 0; targetY = 0; };
    const frame = (time: number) => {
      const smoothing = 1 - Math.exp(-Math.min(time - previous || 16, 50) / 160); previous = time;
      x += (targetX - x) * smoothing; y += (targetY - y) * smoothing;
      root.style.setProperty('--cc-px', `${x.toFixed(3)}`); root.style.setProperty('--cc-py', `${y.toFixed(3)}`);
      raf = requestAnimationFrame(frame);
    };
    if (running && fine.matches) {
      window.addEventListener('pointermove', pointer, { passive: true });
      document.documentElement.addEventListener('pointerleave', leave); raf = requestAnimationFrame(frame);
    } else { root.style.setProperty('--cc-px', '0'); root.style.setProperty('--cc-py', '0'); }
    return () => { cancelAnimationFrame(raf); window.removeEventListener('pointermove', pointer); document.documentElement.removeEventListener('pointerleave', leave); };
  }, [running]);

  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setSelected(null); setHover(null); } };
    window.addEventListener('keydown', escape); return () => window.removeEventListener('keydown', escape);
  }, []);
  return <div className="cc-city" ref={containerRef}>
    <div className="cc-city-frame">
      <div className="cc-atmosphere">
        <img src={cityImage} width={SCENE.width} height={SCENE.height} className="cc-city-image cc-city-base" alt="A coastal city at night: looping elevated highways, a cable-stayed bridge, hospital, rail lines, water treatment and power infrastructure." fetchPriority="high" draggable={false} />
        <img src={cityImage} width={SCENE.width} height={SCENE.height} className="cc-city-image cc-city-sky" alt="" aria-hidden="true" draggable={false} />
        <div className="cc-city-near">
          <img src={cityImage} width={SCENE.width} height={SCENE.height} className="cc-city-image cc-city-foreground" alt="" aria-hidden="true" draggable={false} />
          <MovingTraffic running={running} />
        </div>
        <svg className="cc-infrastructure-effects" viewBox={`0 0 ${SCENE.width} ${SCENE.height}`} fill="none" aria-hidden="true">
          <g className="cc-signal" transform="translate(1552 145)"><circle className="cc-signal-ring" r="13" /><circle className="cc-signal-ring cc-signal-ring-two" r="13" /></g>
          <path className="cc-power-wire" d="M 1658 396 Q 1600 393 1550 369 Q 1514 371 1485 382" />
          <path className="cc-power-pulse" d="M 1658 396 Q 1600 393 1550 369 Q 1514 371 1485 382" />
        </svg>
        <svg className={`cc-connections ${sector ? 'cc-connections-visible' : ''}`} viewBox={`0 0 ${SCENE.width} ${SCENE.height}`} fill="none" aria-hidden="true">
          {sector?.chain.slice(0, -1).map((id, index) => {
            const a = getSector(id), b = getSector(sector.chain[index + 1]);
            const d = `M ${a.x} ${a.y} Q ${(a.x + b.x) / 2 - 65} ${(a.y + b.y) / 2} ${b.x} ${b.y}`;
            return <g key={`${id}-${b.id}`}><path d={d} className="cc-connection-underlay" /><path d={d} className="cc-connection-path" /><path d={d} className="cc-connection-trace" /></g>;
          })}
        </svg>
        <div className="cc-markers" aria-label="Explore conceptual infrastructure connections">
          {SECTORS.map(item => <InfrastructureMarker key={item.id} sector={item} active={sector?.chain.includes(item.id) ?? false} selected={selected === item.id} onHover={setHover} onSelect={id => setSelected(selected === id ? null : id)} />)}
        </div>
      </div>
    </div>
    <div id="cascade-connection-story" className={`cc-connection-story ${sector ? 'cc-connection-story-visible' : ''}`} aria-live="polite" aria-atomic="true">
      {sector && <><div className="cc-chain">{sector.chain.map((id, index) => <span key={id}>{index > 0 && <Icon name="arrow" />}<Icon name={id} /><span>{getSector(id).label}</span></span>)}</div><p>{sector.description}</p><span className="cc-story-disclaimer">A conceptual connection, not a simulation result.</span></>}
    </div>
  </div>;
}
