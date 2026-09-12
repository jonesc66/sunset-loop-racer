import type { MinimapCar } from "./minimap";
export type RacePhase = "countdown" | "race" | "finished";

export type GraphicsQuality = "performance" | "low" | "medium" | "high" | "gpu";

export type PlayerVehicle = "sportcar2" | "sportcar1" | "sedan" | "acuraNsx" | "corvetteC7" | "ferrariSf90";

export type PerformanceStats = {
  fps: number;
  renderer: string;
  vendor: string;
  drawCalls: number;
  triangles: number;
  hardwareAccelerated: boolean;
};

export type ResultRow = {
  name: string;
  color: string;
  finished: boolean;
  isPlayer: boolean;
  place: number;
  time: number | null;
  bestLapTime: number | null;
};

export type HudState = {
  mapCars?: MinimapCar[];
  phase: RacePhase;
  countdownText: string;
  speedKmh: number;
  timer: number;
  lap: number;
  totalLaps: number;
  checkpoint: number;
  checkpointTotal: number;
  position: number;
  totalCars: number;
  bestLapTime: number | null;
  accelerating: boolean;
  braking: boolean;
  drifting: number;
  collisionCount: number;
  results: ResultRow[];
};

export const defaultHudState: HudState = {
  phase: "countdown",
  countdownText: "3",
  speedKmh: 0,
  timer: 0,
  lap: 1,
  totalLaps: 3,
  checkpoint: 0,
  checkpointTotal: 14,
  position: 1,
  totalCars: 6,
  bestLapTime: null,
  accelerating: false,
  braking: false,
  drifting: 0,
  collisionCount: 0,
  results: []
};

export type InputState = {
  accelerate: boolean;
  brake: boolean;
  left: boolean;
  right: boolean;
  handbrake: boolean;
  resetRequested: boolean;
};
