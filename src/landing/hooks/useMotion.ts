import { useEffect, useState } from 'react';

/** Listen to system preferences rather than sampling them only on mount. */
export function useMotion(paused: boolean) {
  const [reduced, setReduced] = useState(true);
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(query.matches);
    const visibility = () => setVisible(!document.hidden);
    update(); visibility();
    query.addEventListener('change', update);
    document.addEventListener('visibilitychange', visibility);
    return () => { query.removeEventListener('change', update); document.removeEventListener('visibilitychange', visibility); };
  }, []);
  return { reduced, running: !paused && !reduced && visible };
}
