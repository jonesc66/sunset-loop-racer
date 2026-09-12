import { wrapProgress } from './track';

export const TRACK_ZONES = [
  { id: 'A', name: 'Forest Start', start: 0, end: .1, trees: 1 },
  { id: 'B', name: 'Open Valley', start: .1, end: .2, trees: .08 },
  { id: 'C', name: 'Cliff Canyon', start: .2, end: .3, trees: .12 },
  { id: 'D', name: 'Lake', start: .3, end: .4, trees: .08 },
  { id: 'E', name: 'Bridge', start: .4, end: .5, trees: 0 },
  { id: 'F', name: 'Village Service', start: .5, end: .6, trees: .12 },
  { id: 'G', name: 'Countryside', start: .6, end: .7, trees: .06 },
  { id: 'H', name: 'Riverside Industry', start: .7, end: .8, trees: .04 },
  { id: 'I', name: 'Tunnel', start: .8, end: .9, trees: 0 },
  { id: 'J', name: 'High Alpine', start: .9, end: 1, trees: .08 },
] as const;
export const TUNNEL = { start: .807, end: .887, halfWidth: 19, height: 10 };
export const BRIDGE = { start: .407, end: .483 };
export function zoneAt(progress: number) { return TRACK_ZONES[Math.min(9, Math.floor(wrapProgress(progress) * 10))]; }
export const ZONE_VIEWPOINTS = [
  ...TRACK_ZONES.map(z => ({ name: `${z.id}-${z.name}`, progress: (z.start + z.end) / 2 })),
  { name: 'I-entrance', progress: .799 }, { name: 'I-interior', progress: .845 }, { name: 'I-exit', progress: .883 },
  { name: 'D-overview', progress: .35 }, { name: 'E-overview', progress: .445 },
];
// Ordered segment references can later supply point-to-point stage definitions.
export const TRACK_SEGMENTS = TRACK_ZONES.map((z, i) => ({ ...z, previous: TRACK_ZONES[(i+9)%10].id, next: TRACK_ZONES[(i+1)%10].id }));
