import type { SVGProps } from 'react';

export type IconName = 'power' | 'water' | 'health' | 'communication' | 'transport' | 'emergency' | 'arrow' | 'pause' | 'play' | 'close';
const paths: Record<IconName, React.ReactNode> = {
  power: <path d="m13 2-8 12h6l-1 8 9-12h-6l1-8Z" />,
  water: <path d="M12 3c-2 4-7 8-7 12a7 7 0 0 0 14 0c0-4-5-8-7-12Zm-3 13c0 2 1 3 3 3" />,
  health: <path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6V3Z" />,
  communication: <><circle cx="12" cy="9" r="1" /><path d="m8 21 4-12 4 12M8 16h8M7 5a6 6 0 0 0 0 8m10-8a6 6 0 0 1 0 8M4 2a10 10 0 0 0 0 14M20 2a10 10 0 0 1 0 14" /></>,
  transport: <><path d="M6 3 3 21M18 3l3 18M12 3v3m0 4v4m0 4v3" /></>,
  emergency: <><path d="M5 17h14M8 17v-5a4 4 0 0 1 8 0v5M4 21h16M12 2v2M3 6l2 2m14 0 2-2" /></>,
  arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
  pause: <><path d="M9 5v14M15 5v14" /></>,
  play: <path d="m8 5 11 7-11 7V5Z" />,
  close: <path d="m6 6 12 12M6 18 18 6" />,
};
export function Icon({ name, ...props }: SVGProps<SVGSVGElement> & { name: IconName }) {
  return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name]}</svg>;
}
export function BrandMark() {
  return <svg width="27" height="34" viewBox="0 0 27 34" fill="none" aria-hidden="true"><path d="m22 3-17 10v18l17-10V3ZM5 13l17 8M5 23l17-10" stroke="currentColor" strokeWidth="1.7" /></svg>;
}
