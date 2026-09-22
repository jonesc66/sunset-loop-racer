import type { TrackInfo, TrackSample } from './track';
import type { createMinimapProjection } from './minimap';

export type GridSlot = { progress: number; laneOffset: number };

/** Timing identity changes only when competitive route/timing compatibility changes. */
export type TrackDefinition = {
  id: string;
  timingVersion: string;
  displayName: string;
  description: string;
  defaultLapCount: number;
  route: TrackInfo;
  roadWidth: number;
  spawns: { player: GridSlot; ai: readonly GridSlot[] };
  aiRoute: TrackInfo;
  respawn: (progress: number) => TrackSample;
  startFinish: { progress: number };
  environment: { renderer: string };
  minimap: { route: TrackInfo; projection: ReturnType<typeof createMinimapProjection> };
  legacyLeaderboard?: { key: string; trackId: string; timingVersion: string; lapCount: number };
};

/** Per-race immutable configuration; dynamic car state is kept in GameRuntime. */
export type RaceTrack = TrackInfo & {
  definition: TrackDefinition;
  lapCount: number;
};

export function createRaceTrack(definition: TrackDefinition, lapCount = definition.defaultLapCount): RaceTrack {
  if (!Number.isInteger(lapCount) || lapCount < 1) throw new Error('Invalid lap count');
  return { ...definition.route, definition, lapCount };
}
