import * as THREE from "three";
import { wrapProgress, type TrackInfo, type TrackSample } from "./track";
import type { RaceTrack } from "./trackDefinition";

/** Motion only: RaceScene retains checkpoint, lap and finish authority. */
export type RaceAiCar = {
  isPlayer: boolean;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  heading: number;
  speed: number;
  steerInput: number;
  bodyRoll: number;
  bodyPitch: number;
  suspensionOffset: number;
  driftAmount: number;
  isAccelerating: boolean;
  isBraking: boolean;
  collisionFlash: number;
  collisionCount: number;
  collisionSlowdown: number;
  progress: number;
  lastProgress: number;
  finished: boolean;
  laneOffset: number;
  aiTargetOffset: number;
  aiBaseSpeed: number;
  aiPhase: number;
};

type DriverMemory = {
  passing: RaceAiCar | null;
  passSide: number;
  passOffset: number;
  committedUntil: number;
  clearFor: number;
  collisionCount: number;
  recovery: number;
  lateralVelocity: number;
};

// New cars on Race Again naturally receive fresh decisions; no timer/listener lifecycle.
const drivers = new WeakMap<RaceAiCar, DriverMemory>();
const makePose = (): TrackSample => ({
  center: new THREE.Vector3(), tangent: new THREE.Vector3(), normal: new THREE.Vector3(), progress: 0
});
const current = makePose(), soon = makePose(), near = makePose(), next = makePose();
const clamp = THREE.MathUtils.clamp;
const approach = (value: number, target: number, step: number) => value + clamp(target - value, -step, step);

// Identical interpolation to sampleTrack, with fixed scratch objects for the hot loop.
function sampleInto(route: TrackInfo, progress: number, target: TrackSample) {
  const exact = wrapProgress(progress) * route.samples.length;
  const index = Math.floor(exact), mix = exact - index;
  const a = route.samples[index], b = route.samples[(index + 1) % route.samples.length];
  target.center.copy(a.center).lerp(b.center, mix);
  target.tangent.copy(a.tangent).lerp(b.tangent, mix).normalize();
  target.normal.copy(a.normal).lerp(b.normal, mix).normalize();
  target.progress = wrapProgress(progress);
}

function laneClearance(car: RaceAiCar, cars: readonly RaceAiCar[], offset: number, blocker: RaceAiCar) {
  let clearance = 20;
  for (const other of cars) {
    if (other === car || other.finished) continue;
    const dx = other.position.x - current.center.x, dz = other.position.z - current.center.z;
    const forward = dx * current.tangent.x + dz * current.tangent.z;
    if (forward < -13 || forward > 35) continue;
    const lateral = dx * current.normal.x + dz * current.normal.z;
    const gap = Math.abs(lateral - offset);
    // The car being passed must fit beside the proposed lane too.
    clearance = Math.min(clearance, gap - (other.isPlayer ? 5.7 : other === blocker ? 5.2 : 5.4));
  }
  return clearance;
}

export function advanceRaceAi(track: RaceTrack, car: RaceAiCar, cars: readonly RaceAiCar[], delta: number, raceTime: number) {
  if (car.finished || delta <= 0) return;
  const dt = Math.min(delta, 0.1);
  let memory = drivers.get(car);
  if (!memory) {
    memory = { passing: null, passSide: 0, passOffset: car.laneOffset, committedUntil: 0,
      clearFor: 0, collisionCount: car.collisionCount, recovery: 0, lateralVelocity: 0 };
    drivers.set(car, memory);
  }
  const route = track.definition.aiRoute;
  sampleInto(route, car.progress, current);
  sampleInto(route, car.progress + 0.052, soon);
  sampleInto(route, car.progress + 0.018, near);
  const turnSoon = current.tangent.z * soon.tangent.x - current.tangent.x * soon.tangent.z;
  const turnNow = current.tangent.z * near.tangent.x - current.tangent.x * near.tangent.z;
  const severity = clamp(Math.abs(turnSoon) * 6.2 + Math.abs(turnNow) * 2.2, 0, 1);
  const laneLimit = Math.min(8.5, track.definition.roadWidth * 0.5 - 3.1);
  const racingLine = clamp(-Math.sign(turnSoon || turnNow) * severity * 5.4 + Math.sin(car.aiPhase) * 1.1,
    -laneLimit + 1, laneLimit - 1);
  const px = car.position.x - current.center.x, pz = car.position.z - current.center.z;
  const actualOffset = px * current.normal.x + pz * current.normal.z;
  // Preserve collision displacement and recover over time instead of snapping to the spline.
  const residualX = px - current.normal.x * actualOffset;
  const residualZ = pz - current.normal.z * actualOffset;
  const residualLength = Math.hypot(residualX, residualZ);
  if (car.collisionCount !== memory.collisionCount || Math.abs(actualOffset) > laneLimit + 0.6 || residualLength > 1.2) {
    memory.recovery = 1.1;
    memory.collisionCount = car.collisionCount;
  }
  memory.recovery = Math.max(0, memory.recovery - dt);
  car.laneOffset = actualOffset;

  let blocker: RaceAiCar | null = null, blockerForward = Infinity, blockerOffset = 0;
  let lower = -laneLimit, upper = laneLimit, speedLimit = Infinity, alongside = false;
  const startGap = raceTime < 5 ? 2.0 : 0;
  for (const other of cars) {
    if (other === car || other.finished) continue;
    const dx = other.position.x - car.position.x, dz = other.position.z - car.position.z;
    const forward = dx * current.tangent.x + dz * current.tangent.z;
    const lateral = dx * current.normal.x + dz * current.normal.z;
    const otherOffset = actualOffset + lateral;
    const sideGap = other.isPlayer ? 5.9 : 5.5;
    if (Math.abs(forward) < 10 && Math.abs(lateral) < 10) {
      alongside = true;
      // Keep the current side of an overlapping car, even when the racing line changes.
      if (lateral > 0.15 || (Math.abs(lateral) <= 0.15 && car.aiPhase < other.aiPhase)) upper = Math.min(upper, otherOffset - sideGap);
      else lower = Math.max(lower, otherOffset + sideGap);
    }
    if (forward > 0 && forward < 48 && Math.abs(lateral) < 4.9) {
      const desiredGap = 7.5 + startGap + Math.max(0, car.speed) * 0.19;
      speedLimit = Math.min(speedLimit, Math.max(0, other.speed + (forward - desiredGap) * 1.6));
      if (forward < blockerForward && (other.speed < car.aiBaseSpeed - 1 || forward < desiredGap + 8)) {
        blocker = other; blockerForward = forward; blockerOffset = otherOffset;
      }
    }
  }

  if (memory.passing) {
    const dx = memory.passing.position.x - car.position.x, dz = memory.passing.position.z - car.position.z;
    const forward = dx * current.tangent.x + dz * current.tangent.z;
    const clear = memory.passing.finished || forward < -13 || forward > 65;
    memory.clearFor = clear && !alongside ? memory.clearFor + dt : 0;
    if (raceTime >= memory.committedUntil && memory.clearFor > 0.65) {
      memory.passing = null;
      memory.passSide = 0;
    }
  }
  if (!memory.passing && blocker) {
    const left = clamp(blockerOffset - 6.4, -laneLimit, laneLimit);
    const right = clamp(blockerOffset + 6.4, -laneLimit, laneLimit);
    const leftRoom = laneClearance(car, cars, left, blocker);
    const rightRoom = laneClearance(car, cars, right, blocker);
    const leftCost = Math.abs(left - actualOffset) + Math.abs(left - racingLine) * 0.15;
    const rightCost = Math.abs(right - actualOffset) + Math.abs(right - racingLine) * 0.15;
    if (leftRoom >= 0 || rightRoom >= 0) {
      const chooseLeft = leftRoom >= 0 && (rightRoom < 0 || leftCost <= rightCost);
      memory.passing = blocker;
      memory.passSide = chooseLeft ? -1 : 1;
      memory.passOffset = chooseLeft ? left : right;
      memory.committedUntil = raceTime + 1.6;
      memory.clearFor = 0;
    }
  }

  let targetOffset = memory.passing ? memory.passOffset : racingLine;
  if (lower <= upper) targetOffset = clamp(targetOffset, lower, upper);
  else {
    // Boxed between two cars: hold lane and fall behind instead of weaving through them.
    targetOffset = clamp(actualOffset, -laneLimit, laneLimit);
    speedLimit = Math.min(speedLimit, Math.max(8, car.speed - 8));
  }
  targetOffset = clamp(targetOffset, -laneLimit, laneLimit);
  car.aiTargetOffset = targetOffset;
  const lateralRate = memory.recovery > 0 ? 4.8 : alongside ? 3.0 : memory.passing ? 3.7 : 2.3;
  const desiredLateralVelocity = clamp((targetOffset - actualOffset) * 3, -lateralRate, lateralRate);
  memory.lateralVelocity = approach(memory.lateralVelocity, desiredLateralVelocity, 8 * dt);
  car.laneOffset = actualOffset + memory.lateralVelocity * dt;
  const lateralSpeed = (car.laneOffset - actualOffset) / dt;

  car.collisionSlowdown = Math.max(0, car.collisionSlowdown - dt * 7);
  const cornerSpeed = car.aiBaseSpeed * THREE.MathUtils.lerp(1, 0.74, severity);
  // No player-gap boost or leader slowdown: pace stays tied to each driver's base speed.
  const openRoadSpeed = Math.max(22, cornerSpeed + Math.sin(raceTime * 0.72 + car.aiPhase) * 0.55 - car.collisionSlowdown * 2.2);
  let targetSpeed = Math.min(openRoadSpeed, speedLimit);
  if (Math.abs(actualOffset) > laneLimit + 1) targetSpeed = Math.min(targetSpeed, 26);
  const oldSpeed = car.speed;
  car.speed = approach(Math.max(0, car.speed), targetSpeed, (targetSpeed < car.speed ? 42 : 27) * dt);
  car.isAccelerating = targetSpeed > car.speed + 0.7;
  car.isBraking = targetSpeed < oldSpeed - 0.6;
  car.collisionFlash = Math.max(0, car.collisionFlash - dt * 5);
  car.lastProgress = car.progress;
  car.progress = wrapProgress(car.progress + (car.speed / track.length) * dt);
  sampleInto(route, car.progress, next);
  const keepResidual = residualLength > 0.001 ? Math.max(0, 1 - 7 * dt / residualLength) : 0;
  car.position.copy(next.center).addScaledVector(next.normal, car.laneOffset);
  car.position.x += residualX * keepResidual;
  car.position.z += residualZ * keepResidual;
  car.velocity.copy(next.tangent).multiplyScalar(car.speed).addScaledVector(next.normal, lateralSpeed);
  const desiredHeading = Math.atan2(car.velocity.x, car.velocity.z);
  const headingError = Math.atan2(Math.sin(desiredHeading - car.heading), Math.cos(desiredHeading - car.heading));
  car.heading += clamp(headingError, -2.4 * dt, 2.4 * dt);
  car.steerInput = THREE.MathUtils.lerp(car.steerInput, clamp(-turnNow * 3 - lateralSpeed * 0.07, -1, 1), 1 - Math.exp(-7 * dt));
  const acceleration = (car.speed - oldSpeed) / dt;
  car.bodyRoll = THREE.MathUtils.lerp(car.bodyRoll, clamp(turnNow * car.speed * 0.012 + lateralSpeed * 0.012, -0.17, 0.17), 1 - Math.exp(-7 * dt));
  car.bodyPitch = THREE.MathUtils.lerp(car.bodyPitch, clamp(-acceleration * 0.0024, -0.065, 0.1), 1 - Math.exp(-7 * dt));
  car.driftAmount = THREE.MathUtils.lerp(car.driftAmount, severity * clamp(car.speed / 70, 0, 1) * 0.18, 1 - Math.exp(-5 * dt));
  car.suspensionOffset = THREE.MathUtils.lerp(car.suspensionOffset, Math.sin(raceTime * 13 + car.aiPhase) * 0.025 * clamp(car.speed / 25, 0, 1), 1 - Math.exp(-5 * dt));
}
