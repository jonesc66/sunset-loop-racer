import type { HudState } from './types';

export type MinimapCar = { name: string; color: string; isPlayer: boolean; x: number; z: number; heading: number };
type CarPosition = { name: string; color: string; isPlayer: boolean; position: { x: number; z: number }; heading: number };

// Copy read-only telemetry at the existing HUD cadence; never modify race state.
export function withMinimap(hud: HudState, cars: readonly CarPosition[]): HudState {
  return { ...hud, mapCars: cars.map(car => ({ name: car.name, color: car.color, isPlayer: car.isPlayer, x: car.position.x, z: car.position.z, heading: car.heading })) };
}

export function createMinimapProjection(points: readonly { x: number; z: number }[], width = 220, height = 160, padding = 20) {
  const minX = Math.min(...points.map(p => p.x)), maxX = Math.max(...points.map(p => p.x));
  const minZ = Math.min(...points.map(p => p.z)), maxZ = Math.max(...points.map(p => p.z));
  const scale = Math.min((width - padding * 2) / Math.max(1, maxX - minX), (height - padding * 2) / Math.max(1, maxZ - minZ));
  const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
  return { scale, project: (x: number, z: number) => ({ x: width / 2 + (x - cx) * scale, y: height / 2 + (z - cz) * scale }) };
}
