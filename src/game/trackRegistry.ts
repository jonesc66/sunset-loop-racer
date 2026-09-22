import { neonMetro } from './neonMetro';
import { createTrack, sampleTrack, TRACK_WIDTH, wrapProgress } from './track';
import { createMinimapProjection } from './minimap';
import type { TrackDefinition } from './trackDefinition';

const route = createTrack();
const gridSlot = (row: number, column: 0 | 1) => ({
  progress: wrapProgress(1 - (9 + row * 16 + column * 5.5) / route.length),
  laneOffset: column === 0 ? -TRACK_WIDTH * 0.22 : TRACK_WIDTH * 0.22
});

export const sunsetLoop: TrackDefinition = {
  id: 'sunset-loop',
  // Opaque compatibility identifier from the existing expanded-track key.
  // The historical "1525m" substring is not a world-unit dimension claim.
  timingVersion: '2-expanded-1525m',
  displayName: 'Sunset Loop',
  description: 'Mountain circuit · flowing bends, villages and elevation',
  defaultLapCount: 3,
  route,
  roadWidth: TRACK_WIDTH,
  spawns: { player: gridSlot(2, 0), ai: [gridSlot(0, 0), gridSlot(0, 1), gridSlot(1, 0), gridSlot(1, 1), gridSlot(2, 1)] },
  aiRoute: route,
  respawn: progress => sampleTrack(route, progress),
  startFinish: { progress: 0 },
  // Existing art and terrain are the Sunset-specific renderer adapter.
  environment: { renderer: 'sunset-loop' },
  minimap: { route, projection: createMinimapProjection(route.samples.map(sample => sample.center)) },
  legacyLeaderboard: { key: 'bern-circuit-time-leaderboard-v2-expanded-1525m-3laps', trackId: 'sunset-loop', timingVersion: '2-expanded-1525m', lapCount: 3 }
};

export const DEFAULT_TRACK_ID = sunsetLoop.id;
export const trackRegistry: ReadonlyMap<string, TrackDefinition> = new Map([[sunsetLoop.id, sunsetLoop], [neonMetro.id, neonMetro]]);

export function getTrackDefinition(id: string): TrackDefinition {
  const track = trackRegistry.get(id);
  if (!track) throw new Error(`Unknown track: ${id}`);
  return track;
}

export function leaderboardStorageKey(track: TrackDefinition, lapCount: number): string {
  if (!Number.isInteger(lapCount) || lapCount < 1) throw new Error('Invalid lap count');
  // The legacy identity is fixed independently of the current registry version.
  // A future registry version bump must automatically stop reading the old key.
  const legacy = track.legacyLeaderboard;
  if (legacy && track.id === legacy.trackId && track.timingVersion === legacy.timingVersion && lapCount === legacy.lapCount) {
    return legacy.key;
  }
  return `sunset-loop-racer:top5:${encodeURIComponent(track.id)}:v${encodeURIComponent(track.timingVersion)}:laps${lapCount}`;
}
