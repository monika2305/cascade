/** Art coordinates (1672 × 941), not geographic or simulation data.
 * Curves are traced onto the bundled city artwork. Never used by CASCADE's engine.
 */
export const SCENE = { width: 1672, height: 941 };
export const TRAFFIC_ROUTES = [
  { id: 'bridge-out', path: 'M 646 963 C 830 867 1087 736 1147 629 C 1217 505 1051 466 956 418 C 873 384 811 368 841 347 C 876 321 1100 282 1392 270', count: 12, speed: 37, direction: 1 },
  { id: 'bridge-in', path: 'M 1394 275 C 1120 287 897 330 858 350 C 825 368 895 391 978 425 C 1093 469 1247 519 1191 642 C 1133 766 948 879 827 969', count: 13, speed: 43, direction: 1 },
  { id: 'interchange-in', path: 'M 766 831 C 653 805 379 771 402 707 C 423 650 723 627 912 574 C 1013 546 1092 522 1054 495', count: 7, speed: 33, direction: 1 },
  { id: 'interchange-out', path: 'M 1037 493 C 1071 527 961 550 884 570 C 666 621 407 637 377 697 C 335 777 655 812 746 840', count: 7, speed: 30, direction: 1 },
  { id: 'west-feeder', path: 'M -15 702 C 140 690 225 686 337 678', count: 4, speed: 29, direction: 1 },
];
export const RAIL_PATH = 'M -100 711 C 208 654 528 584 976 465';

export type Sector = 'power' | 'water' | 'health' | 'communication' | 'transport' | 'emergency';
export const SECTORS: { id: Sector; label: string; x: number; y: number; description: string; chain: Sector[] }[] = [
  { id: 'power', label: 'Power', x: 1533, y: 484, description: 'Power keeps pumps running. Water keeps hospitals operating.', chain: ['power', 'water', 'health'] },
  { id: 'water', label: 'Water', x: 1435, y: 748, description: 'Reliable water supports essential healthcare.', chain: ['power', 'water', 'health'] },
  { id: 'health', label: 'Health', x: 1276, y: 427, description: 'Care depends on power, water, and a route to reach it.', chain: ['transport', 'health', 'emergency'] },
  { id: 'communication', label: 'Communication', x: 1550, y: 190, description: 'Communication connects responders when every moment matters.', chain: ['communication', 'emergency', 'health'] },
  { id: 'transport', label: 'Transport', x: 1004, y: 557, description: 'Connected roads keep care and emergency services within reach.', chain: ['transport', 'health', 'emergency'] },
  { id: 'emergency', label: 'Emergency', x: 1383, y: 538, description: 'Response relies on communication and accessible roads.', chain: ['communication', 'emergency', 'transport'] },
];

export function getSector(id: Sector) { return SECTORS.find(item => item.id === id)!; }
