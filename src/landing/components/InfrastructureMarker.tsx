import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Icon } from './Icons';
import { SCENE, type SECTORS, type Sector } from './cityGeometry';

export function InfrastructureMarker({ sector, active, selected, onHover, onSelect }: {
  sector: typeof SECTORS[number]; active: boolean; selected: boolean;
  onHover: (id: Sector | null) => void; onSelect: (id: Sector) => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const [inView, setInView] = useState(true);
  useEffect(() => {
    const button = ref.current;
    if (!button) return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry.intersectionRatio >= .98), { root: button.closest('.cc-city'), threshold: [.98], rootMargin: '-6px' });
    observer.observe(button);
    return () => observer.disconnect();
  }, []);
  const style = { left: `${sector.x / SCENE.width * 100}%`, top: `${sector.y / SCENE.height * 100}%` } as CSSProperties;
  return <button ref={ref} type="button" className={`cc-marker cc-marker-${sector.id} ${active ? 'cc-marker-connected' : ''} ${selected ? 'cc-marker-selected' : ''} ${inView ? '' : 'cc-marker-clipped'}`} style={style}
    aria-label={`Explore ${sector.label.toLowerCase()} dependencies`} aria-pressed={selected} aria-controls="cascade-connection-story"
    onPointerEnter={event => { if (event.pointerType === 'mouse') onHover(sector.id); }} onPointerLeave={() => onHover(null)}
    onFocus={() => onHover(sector.id)} onBlur={() => onHover(null)} onClick={() => onSelect(sector.id)}>
    <span className="cc-marker-icon"><Icon name={sector.id} /></span><span className="cc-marker-label">{sector.label}</span><span className="cc-marker-stem" aria-hidden="true" />
  </button>;
}
