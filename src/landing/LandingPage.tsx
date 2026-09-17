import { useState, type MouseEvent } from 'react';
import { CinematicCity } from './components/CinematicCity';
import { BrandMark, Icon } from './components/Icons';
import { useMotion } from './hooks/useMotion';
import './styles/landing.css';

export interface LandingPageProps {
  /** Use the host application's actual route. No router is imported here. */
  exploreHref?: string;
  /** Optional host-router callback. When supplied it handles navigation. */
  onExplore?: (event: MouseEvent<HTMLAnchorElement>) => void;
  className?: string;
}

export default function LandingPage({ exploreHref = '/login', onExplore, className = '' }: LandingPageProps) {
  const [paused, setPaused] = useState(false);
  const [story, setStory] = useState(false);
  const motion = useMotion(paused);
  const explore = (event: MouseEvent<HTMLAnchorElement>) => {
    if (onExplore && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
      event.preventDefault(); onExplore(event);
    }
  };
  return <main className={`cc-landing ${className}`} data-motion={motion.running ? 'running' : 'still'}>
    <CinematicCity running={motion.running} showConnections={story} />
    <div className="cc-shade" aria-hidden="true" />
    <header className="cc-header">
      <a className="cc-brand" href="#cascade-home" aria-label="CASCADE home"><BrandMark /><span>CASCADE</span></a>
      <nav aria-label="Main navigation">
        <button className="cc-nav-story" type="button" aria-expanded={story} aria-controls="cascade-workflow" onClick={() => setStory(!story)}>How it works</button>
        <a className="cc-nav-explore" href={exploreHref} onClick={explore}>Explore CASCADE <Icon name="arrow" /></a>
      </nav>
    </header>
    <section className="cc-copy" id="cascade-home" aria-labelledby="cascade-title">
      <div className="cc-eyebrow"><span /> INFRASTRUCTURE INTELLIGENCE</div>
      <h1 id="cascade-title">Cities are connected.<br /><em>Failures are too.</em></h1>
      <p>See how infrastructure depends on infrastructure — before one failure becomes a cascade.</p>
      <a className="cc-cta" href={exploreHref} onClick={explore}>EXPLORE CASCADE <Icon name="arrow" /></a>
    </section>
    <div className="cc-scene-invitation"><span className="cc-crosshair" aria-hidden="true">+</span> Explore the connections<span className="cc-invitation-line" /></div>
    <footer className="cc-bottom">
      <div className={`cc-workflow ${story ? 'cc-workflow-open' : ''}`} id="cascade-workflow">
        <span className="cc-workflow-label">FROM RISK TO RESILIENCE</span>
        <div className="cc-workflow-steps"><span>Find weak points</span><Icon name="arrow" /><span>Simulate cascades</span><Icon name="arrow" /><span>Plan recovery</span></div>
        {story && <p className="cc-workflow-detail">Trace dependencies. Explore what could fail next. Compare ways to recover.</p>}
      </div>
      <div className="cc-scene-controls">
        <span>ILLUSTRATIVE CITY<br /><span>Connected by design.</span></span>
        <button type="button" className="cc-motion-button" onClick={() => setPaused(!paused)} disabled={motion.reduced} aria-label={motion.reduced ? 'Motion disabled by system preference' : paused ? 'Play city animation' : 'Pause city animation'} title={motion.reduced ? 'Reduced motion is enabled' : paused ? 'Play city animation' : 'Pause city animation'}><Icon name={paused || motion.reduced ? 'play' : 'pause'} /></button>
      </div>
    </footer>
  </main>;
}
