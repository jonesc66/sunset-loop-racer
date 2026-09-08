import { useFrame, useLoader, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  CHECKPOINT_COUNT,
  TRACK_WIDTH,
  createDashGeometry,
  createRoadGeometry,
  createTrack,
  crossedProgress,
  forwardDelta,
  nearestTrackSample,
  sampleTrack,
  tangentHeading,
  wrapProgress,
  type TrackInfo
} from "./game/track";
import type {
  GraphicsQuality,
  HudState,
  InputState,
  PerformanceStats,
  PlayerVehicle,
  RacePhase,
  ResultRow
} from "./game/types";
import { useKeyboard } from "./game/useKeyboard";
import { BenchmarkAtmosphere, BenchmarkLandscape, RoadWear } from "./environment/BenchmarkEnvironment";
import { makeRoadMaterial } from "./environment/roadMaterial";
import { qualityPresets, type EffectsQuality } from "./qualityPresets";
import { GpuGround } from "./environment/GpuEnvironment";

const TOTAL_LAPS = 3;
const COUNTDOWN_SECONDS = 3.35;
const PLAYER_COLOR = "#ff3458";
const IMPORTED_PLAYER_CAR_LENGTH = 6.05;
const CHECKPOINT_GATE_HALF_WIDTH = TRACK_WIDTH * 0.5 + 8.0;
const MAX_CHECKPOINT_STEP = 0.22;
const GRID_FIRST_ROW_DISTANCE = 9;
const GRID_ROW_SPACING = 16;
const GRID_COLUMN_STAGGER = 5.5;
const GRID_COLUMN_OFFSET = TRACK_WIDTH * 0.22;

type CarRuntime = {
  name: string;
  color: string;
  isPlayer: boolean;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  heading: number;
  speed: number;
  steerInput: number;
  bodyRoll: number;
  bodyPitch: number;
  suspensionOffset: number;
  reverseHold: number;
  driftAmount: number;
  isAccelerating: boolean;
  isBraking: boolean;
  collisionFlash: number;
  collisionCount: number;
  collisionSlowdown: number;
  progress: number;
  lastProgress: number;
  nextCheckpointIndex: number;
  completedLaps: number;
  lap: number;
  lapStartedAt: number;
  bestLapTime: number | null;
  lapTimes: number[];
  invalidLap: boolean;
  finished: boolean;
  finishTime: number | null;
  laneOffset: number;
  aiTargetOffset: number;
  aiBaseSpeed: number;
  aiPhase: number;
};

type GameRuntime = {
  cars: CarRuntime[];
  phase: RacePhase;
  resetAt: number;
  raceStartedAt: number;
  lastHudAt: number;
  lastSmokeAt: number;
  lastSkidAt: number;
  lastSpeedParticleAt: number;
  smokeParticles: VisualParticle[];
  sparkParticles: VisualParticle[];
  speedParticles: VisualParticle[];
  skidMarks: SkidMark[];
};

type RaceSceneProps = {
  graphicsQuality: GraphicsQuality;
  playerVehicle: PlayerVehicle;
  resetSeed: number;
  onHudUpdate: (state: HudState) => void;
  onPerformanceUpdate: (stats: PerformanceStats) => void;
};

type QualityConfig = EffectsQuality;

type VisualParticle = {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
  size: number;
  color: string;
};

type SkidMark = {
  position: THREE.Vector3;
  heading: number;
  age: number;
  maxAge: number;
  width: number;
  opacity: number;
};

type RaceTestWindow = Window & {
  __raceTestState?: {
    phase: RacePhase;
    raceTime: number;
    finishedCount: number;
    totalCars: number;
    results: ResultRow[];
    bestLapTime: number | null;
  };
};

const reusableForward = new THREE.Vector3();
const reusableRight = new THREE.Vector3();
const reusableMatrix = new THREE.Matrix4();
const reusableQuaternion = new THREE.Quaternion();
const reusableScale = new THREE.Vector3();
const smokeScale = new THREE.Vector3(1, 1, 1);
const sparkScale = new THREE.Vector3(1, 1, 1);
const speedParticleScale = new THREE.Vector3(1, 0.12, 0.12);
const cameraTarget = new THREE.Vector3();
const desiredCamera = new THREE.Vector3();


function PerformanceProbe({ onUpdate }: { onUpdate: (stats: PerformanceStats) => void }) {
  const { gl } = useThree();
  const callbackRef = useRef(onUpdate);
  const sampleRef = useRef({ frames: 0, startedAt: performance.now() });
  const rendererInfoRef = useRef({ renderer: "WebGL", vendor: "Unknown", hardwareAccelerated: true });

  useEffect(() => {
    callbackRef.current = onUpdate;
  }, [onUpdate]);

  useEffect(() => {
    const context = gl.getContext();
    const debugInfo = context.getExtension("WEBGL_debug_renderer_info") as {
      UNMASKED_RENDERER_WEBGL: number;
      UNMASKED_VENDOR_WEBGL: number;
    } | null;
    const renderer = String(
      context.getParameter(debugInfo?.UNMASKED_RENDERER_WEBGL ?? context.RENDERER) || "WebGL"
    );
    const vendor = String(
      context.getParameter(debugInfo?.UNMASKED_VENDOR_WEBGL ?? context.VENDOR) || "Unknown"
    );
    rendererInfoRef.current = {
      renderer,
      vendor,
      hardwareAccelerated: !/swiftshader|software|llvmpipe|basic render driver/i.test(
        `${renderer} ${vendor}`
      )
    };
  }, [gl]);

  useFrame(() => {
    const sample = sampleRef.current;
    const now = performance.now();
    sample.frames += 1;
    const elapsed = now - sample.startedAt;

    if (elapsed >= 750) {
      callbackRef.current({
        fps: Math.round((sample.frames * 1000) / elapsed),
        renderer: rendererInfoRef.current.renderer,
        vendor: rendererInfoRef.current.vendor,
        drawCalls: gl.info.render.calls,
        triangles: gl.info.render.triangles,
        hardwareAccelerated: rendererInfoRef.current.hardwareAccelerated
      });
      sample.frames = 0;
      sample.startedAt = now;
    }
  });

  return null;
}

function createCar(
  track: TrackInfo,
  name: string,
  color: string,
  isPlayer: boolean,
  progress: number,
  laneOffset: number,
  aiBaseSpeed = 0,
  aiPhase = 0
): CarRuntime {
  const pose = sampleTrack(track, progress);
  const position = pose.center.clone().addScaledVector(pose.normal, laneOffset);

  return {
    name,
    color,
    isPlayer,
    position,
    velocity: new THREE.Vector3(),
    heading: tangentHeading(pose.tangent),
    speed: 0,
    steerInput: 0,
    bodyRoll: 0,
    bodyPitch: 0,
    suspensionOffset: 0,
    reverseHold: 0,
    driftAmount: 0,
    isAccelerating: false,
    isBraking: false,
    collisionFlash: 0,
    collisionCount: 0,
    collisionSlowdown: 0,
    progress: wrapProgress(progress),
    lastProgress: wrapProgress(progress),
    nextCheckpointIndex: 0,
    completedLaps: 0,
    lap: 1,
    lapStartedAt: 0,
    bestLapTime: null,
    lapTimes: [],
    invalidLap: false,
    finished: false,
    finishTime: null,
    laneOffset,
    aiTargetOffset: laneOffset,
    aiBaseSpeed,
    aiPhase
  };
}

function startGridSlot(track: TrackInfo, row: number, column: 0 | 1) {
  const distanceBehindLine = GRID_FIRST_ROW_DISTANCE + row * GRID_ROW_SPACING + column * GRID_COLUMN_STAGGER;

  return {
    progress: wrapProgress(1 - distanceBehindLine / track.length),
    laneOffset: column === 0 ? -GRID_COLUMN_OFFSET : GRID_COLUMN_OFFSET
  };
}

function createGame(track: TrackInfo, now: number, autoRace = false): GameRuntime {
  const solarGrid = startGridSlot(track, 0, 0);
  const vegaGrid = startGridSlot(track, 0, 1);
  const orionGrid = startGridSlot(track, 1, 0);
  const novaGrid = startGridSlot(track, 1, 1);
  const playerGrid = startGridSlot(track, 2, 0);
  const lyraGrid = startGridSlot(track, 2, 1);

  return {
    phase: "countdown",
    resetAt: now,
    raceStartedAt: now + COUNTDOWN_SECONDS,
    lastHudAt: 0,
    lastSmokeAt: 0,
    lastSkidAt: 0,
    lastSpeedParticleAt: 0,
    smokeParticles: [],
    sparkParticles: [],
    speedParticles: [],
    skidMarks: [],
    cars: [
      createCar(track, "You", PLAYER_COLOR, true, playerGrid.progress, playerGrid.laneOffset, autoRace ? 62.5 : 0, 2.6),
      createCar(track, "Solar", "#35d0ff", false, solarGrid.progress, solarGrid.laneOffset, 63.8, 0.2),
      createCar(track, "Vega", "#ffe14a", false, vegaGrid.progress, vegaGrid.laneOffset, 63.1, 1.8),
      createCar(track, "Orion", "#8ef05d", false, orionGrid.progress, orionGrid.laneOffset, 62.4, 3.1),
      createCar(track, "Nova", "#ff8f3d", false, novaGrid.progress, novaGrid.laneOffset, 61.8, 4.4),
      createCar(track, "Lyra", "#c685ff", false, lyraGrid.progress, lyraGrid.laneOffset, 61.2, 5.7)
    ]
  };
}

function resetPlayerToTrack(track: TrackInfo, car: CarRuntime) {
  const pose = sampleTrack(track, car.progress);
  car.position.copy(pose.center).addScaledVector(pose.normal, car.laneOffset);
  car.velocity.set(0, 0, 0);
  car.heading = tangentHeading(pose.tangent);
  car.speed = 0;
  car.steerInput = 0;
  car.bodyRoll = 0;
  car.bodyPitch = 0;
  car.suspensionOffset = 0;
  car.reverseHold = 0;
  car.driftAmount = 0;
  car.isAccelerating = false;
  car.isBraking = false;
  car.collisionFlash = 0;
  car.collisionSlowdown = 0;
}

function updateCheckpoint(track: TrackInfo, car: CarRuntime, raceTime: number, lateral: number, progressStep: number) {
  if (car.finished) {
    return;
  }

  if (Math.abs(lateral) > CHECKPOINT_GATE_HALF_WIDTH) {
    return;
  }

  if (progressStep <= 0 || progressStep > MAX_CHECKPOINT_STEP) {
    return;
  }

  let guard = 0;
  while (guard < track.checkpointTargets.length) {
    guard += 1;

    const target = track.checkpointTargets[car.nextCheckpointIndex];
    if (!crossedProgress(car.lastProgress, car.progress, target)) {
      return;
    }

    if (car.nextCheckpointIndex === track.checkpointTargets.length - 1) {
      if (car.invalidLap) {
        car.nextCheckpointIndex = 0;
        car.lapStartedAt = raceTime;
        car.invalidLap = false;
        return;
      }

      const lapTime = raceTime - car.lapStartedAt;
      car.lapTimes.push(lapTime);
      car.bestLapTime = car.bestLapTime === null ? lapTime : Math.min(car.bestLapTime, lapTime);
      car.completedLaps += 1;

      if (car.completedLaps >= TOTAL_LAPS) {
        car.finished = true;
        car.finishTime = raceTime;
        car.lap = TOTAL_LAPS;
        car.nextCheckpointIndex = CHECKPOINT_COUNT;
        return;
      }

      car.lap = car.completedLaps + 1;
      car.lapStartedAt = raceTime;
      car.nextCheckpointIndex = 0;
      return;
    }

    car.nextCheckpointIndex += 1;
  }
}

function updatePlayer(track: TrackInfo, car: CarRuntime, input: InputState, dt: number, raceTime: number) {
  if (input.resetRequested) {
    resetPlayerToTrack(track, car);
    input.resetRequested = false;
  }

  if (car.finished) {
    car.velocity.multiplyScalar(Math.pow(0.1, dt));
    car.speed = car.velocity.length();
    return;
  }

  const nearestBefore = nearestTrackSample(track, car.position);
  const offRoad = Math.abs(nearestBefore.lateral) > TRACK_WIDTH * 0.5;
  // In the chase-camera view, decreasing yaw turns the car visually right.
  const steerLeft = input.left ? 1 : 0;
  const steerRight = input.right ? -1 : 0;
  const steer = steerLeft + steerRight;
  const throttle = input.accelerate ? 1 : 0;
  const braking = input.brake ? 1 : 0;
  const handbrake = input.handbrake;
  car.isAccelerating = throttle > 0;
  car.isBraking = braking > 0 || car.finished;
  car.collisionFlash = Math.max(0, car.collisionFlash - dt * 5);
  car.collisionSlowdown = Math.max(0, car.collisionSlowdown - dt * 7);
  reusableForward.set(Math.sin(car.heading), 0, Math.cos(car.heading));
  reusableRight.set(reusableForward.z, 0, -reusableForward.x);

  let forwardSpeed = car.velocity.dot(reusableForward);
  let lateralSpeed = car.velocity.dot(reusableRight);
  const speedAbs = car.velocity.length();
  const maxForwardSpeed = offRoad ? 38 : 82;
  const maxReverseSpeed = offRoad ? 4.5 : 8;
  const steeringSpeed = Math.abs(forwardSpeed);
  const lowSpeedSteer = THREE.MathUtils.clamp(steeringSpeed / 9, 0.38, 1);
  const highSpeedSteer = THREE.MathUtils.lerp(1.75, 0.88, THREE.MathUtils.clamp(steeringSpeed / 62, 0, 1));
  const handbrakeSteerBoost = handbrake ? 1.08 : 1;
  const reverseSteer = forwardSpeed < -0.6 ? -1 : 1;
  const turnRate = lowSpeedSteer * highSpeedSteer * handbrakeSteerBoost;

  car.steerInput = THREE.MathUtils.lerp(car.steerInput, steer, 1 - Math.pow(0.0008, dt));
  car.heading += steer * turnRate * reverseSteer * dt;
  reusableForward.set(Math.sin(car.heading), 0, Math.cos(car.heading));
  reusableRight.set(reusableForward.z, 0, -reusableForward.x);

  forwardSpeed = car.velocity.dot(reusableForward);
  lateralSpeed = car.velocity.dot(reusableRight);

  if (throttle > 0 && forwardSpeed < maxForwardSpeed) {
    const powerFalloff = THREE.MathUtils.clamp(1 - forwardSpeed / (maxForwardSpeed + 8), 0.18, 1);
    const collisionPower = THREE.MathUtils.lerp(1, 0.42, THREE.MathUtils.clamp(car.collisionSlowdown / 12, 0, 1));
    car.velocity.addScaledVector(reusableForward, 56 * powerFalloff * collisionPower * dt);
  }

  if (braking > 0) {
    if (forwardSpeed > 0.45) {
      car.reverseHold = 0;
      car.velocity.addScaledVector(reusableForward, -Math.min(forwardSpeed, 46 * dt));
    } else {
      car.reverseHold += dt;

      if (car.reverseHold > 0.28 && forwardSpeed > -maxReverseSpeed) {
        car.velocity.addScaledVector(reusableForward, -12 * dt);
      }
    }
  } else {
    car.reverseHold = 0;
  }

  forwardSpeed = car.velocity.dot(reusableForward);
  lateralSpeed = car.velocity.dot(reusableRight);

  const grip = offRoad ? 2.1 : handbrake ? 1.15 : THREE.MathUtils.lerp(7.6, 4.4, THREE.MathUtils.clamp(speedAbs / 64, 0, 1));
  const lateralGrip = Math.exp(-grip * dt);
  const rollingDrag = offRoad ? 1.45 : handbrake ? 0.34 : 0.42;
  lateralSpeed *= lateralGrip;
  forwardSpeed -= forwardSpeed * rollingDrag * dt;

  if (!throttle && !braking && Math.abs(forwardSpeed) < 0.35) {
    forwardSpeed = 0;
  }

  forwardSpeed = THREE.MathUtils.clamp(forwardSpeed, -maxReverseSpeed, maxForwardSpeed);
  lateralSpeed = THREE.MathUtils.clamp(lateralSpeed, -28, 28);
  car.velocity
    .copy(reusableForward)
    .multiplyScalar(forwardSpeed)
    .addScaledVector(reusableRight, lateralSpeed);
  car.position.addScaledVector(car.velocity, dt);

  const nearestAfter = nearestTrackSample(track, car.position);
  const barrierLimit = TRACK_WIDTH * 0.5 + 4.8;

  if (Math.abs(nearestAfter.lateral) > barrierLimit) {
    const clampedLateral = THREE.MathUtils.clamp(nearestAfter.lateral, -barrierLimit, barrierLimit);
    const collisionNormal = nearestAfter.sample.normal.clone().multiplyScalar(Math.sign(nearestAfter.lateral));
    const normalSpeed = car.velocity.dot(collisionNormal);
    car.position.copy(nearestAfter.sample.center).addScaledVector(nearestAfter.sample.normal, clampedLateral);

    if (normalSpeed > 0) {
      car.velocity.addScaledVector(collisionNormal, -normalSpeed * 1.15);
    }

    const barrierDamping = Math.abs(normalSpeed) > 10 ? 0.38 : 0.55;
    car.velocity.multiplyScalar(barrierDamping);
    car.collisionFlash = Math.max(car.collisionFlash, Math.min(1, Math.abs(normalSpeed) / 24));
    if (Math.abs(normalSpeed) > 3.5) {
      car.collisionCount += 1;
    }
  }

  const nearestCurrent = nearestTrackSample(track, car.position);
  if (Math.abs(nearestCurrent.lateral) > TRACK_WIDTH * 0.5 + 10) {
    car.invalidLap = true;
  }
  const currentProgress = nearestCurrent.progress;
  const movement = forwardDelta(car.progress, currentProgress);
  car.lastProgress = car.progress;
  car.speed = car.velocity.dot(reusableForward);

  if (movement < 0.2 && car.speed > 2) {
    car.progress = currentProgress;
    updateCheckpoint(track, car, raceTime, nearestCurrent.lateral, movement);
  }

  const visualSpeed = Math.abs(car.speed);
  const driftAmount = THREE.MathUtils.clamp(Math.abs(lateralSpeed) / 18, 0, 1);
  car.driftAmount = THREE.MathUtils.lerp(car.driftAmount, driftAmount, 1 - Math.pow(0.001, dt));
  const targetRoll = THREE.MathUtils.clamp(-steer * visualSpeed * 0.0045 - lateralSpeed * 0.012, -0.28, 0.28);
  const targetPitch = THREE.MathUtils.clamp(braking * 0.095 - throttle * 0.04 - Math.abs(lateralSpeed) * 0.0015, -0.08, 0.12);
  const roadBuzz = Math.sin(raceTime * (offRoad ? 22 : 15) + visualSpeed * 0.25) * (offRoad ? 0.075 : 0.035);

  car.bodyRoll = THREE.MathUtils.lerp(car.bodyRoll, targetRoll, 1 - Math.pow(0.0015, dt));
  car.bodyPitch = THREE.MathUtils.lerp(car.bodyPitch, targetPitch, 1 - Math.pow(0.002, dt));
  car.suspensionOffset = THREE.MathUtils.lerp(
    car.suspensionOffset,
    roadBuzz * THREE.MathUtils.clamp(visualSpeed / 55 + driftAmount * 0.35, 0, 1),
    1 - Math.pow(0.012, dt)
  );
}

function signedTurnAhead(track: TrackInfo, progress: number, lookAhead = 0.045) {
  const now = sampleTrack(track, progress);
  const ahead = sampleTrack(track, progress + lookAhead);
  return now.tangent.z * ahead.tangent.x - now.tangent.x * ahead.tangent.z;
}

function findAiAvoidance(track: TrackInfo, car: CarRuntime, cars: CarRuntime[], raceTime: number) {
  let speedPenalty = 0;
  let offsetPush = 0;
  let speedLimit = Number.POSITIVE_INFINITY;
  const pose = sampleTrack(track, car.progress);
  const startCaution = THREE.MathUtils.clamp(1 - raceTime / 8, 0, 1);

  for (const other of cars) {
    if (other === car || other.finished) {
      continue;
    }

    const toOther = other.position.clone().sub(car.position);
    toOther.y = 0;
    const forwardMeters = toOther.dot(pose.tangent);
    const lateralMeters = toOther.dot(pose.normal);
    const distance = Math.hypot(forwardMeters, lateralMeters);
    const absLateral = Math.abs(lateralMeters);
    const respectMultiplier = other.isPlayer ? 1.18 : 1;

    if (forwardMeters > -4 && forwardMeters < 48 && absLateral < 15) {
      const forwardCloseness = 1 - Math.max(0, forwardMeters) / 48;
      const sideRisk = 1 - absLateral / 15;
      const caution = 1 + startCaution * 0.55;
      const risk = forwardCloseness * sideRisk * caution * respectMultiplier;

      speedPenalty = Math.max(speedPenalty, (15 + sideRisk * 24) * risk);
      speedLimit = Math.min(speedLimit, THREE.MathUtils.lerp(14, 46, Math.max(0, forwardMeters) / 48));
      offsetPush += lateralMeters <= 0 ? 4.8 * risk : -4.8 * risk;
    }

    if (Math.abs(forwardMeters) < 18 && absLateral < 12) {
      const sideBySideRisk = (1 - Math.abs(forwardMeters) / 18) * (1 - absLateral / 12) * respectMultiplier;
      offsetPush += lateralMeters <= 0 ? 5.8 * sideBySideRisk : -5.8 * sideBySideRisk;
      speedPenalty = Math.max(speedPenalty, 9 * sideBySideRisk);
    }

    if (distance < 7.2) {
      const emergency = 1 - distance / 7.2;
      speedLimit = Math.min(speedLimit, 10 + distance * 1.25);
      speedPenalty = Math.max(speedPenalty, 30 * emergency * respectMultiplier);
      offsetPush += lateralMeters <= 0 ? 7.5 * emergency : -7.5 * emergency;
    }
  }

  return { speedPenalty, offsetPush, speedLimit };
}

function applyCollisionFeedback(car: CarRuntime, impact: number) {
  if (impact < 1.2) {
    return;
  }

  car.collisionFlash = Math.max(car.collisionFlash, THREE.MathUtils.clamp(impact / 18, 0.18, 1));
  car.collisionSlowdown = Math.max(car.collisionSlowdown, THREE.MathUtils.clamp(impact * 0.42, 2.2, 12));
  if (impact > 3.2) {
    car.collisionCount += 1;
  }
}

function syncCarAfterCollision(track: TrackInfo, car: CarRuntime) {
  if (car.isPlayer) {
    reusableForward.set(Math.sin(car.heading), 0, Math.cos(car.heading));
    car.speed = car.velocity.dot(reusableForward);
    return;
  }

  const nearest = nearestTrackSample(track, car.position);
  const tangentSpeed = car.velocity.dot(nearest.sample.tangent);
  car.progress = nearest.progress;
  car.laneOffset = THREE.MathUtils.clamp(nearest.lateral, -8.5, 8.5);
  car.speed = THREE.MathUtils.clamp(tangentSpeed, 0, car.aiBaseSpeed);
}

function resolveCarCollisions(track: TrackInfo, cars: CarRuntime[]) {
  const minDistance = 3.35;
  const minDistanceSq = minDistance * minDistance;

  for (let aIndex = 0; aIndex < cars.length; aIndex += 1) {
    for (let bIndex = aIndex + 1; bIndex < cars.length; bIndex += 1) {
      const a = cars[aIndex];
      const b = cars[bIndex];

      if (a.finished || b.finished) {
        continue;
      }

      const offset = a.position.clone().sub(b.position);
      offset.y = 0;
      const distanceSq = offset.lengthSq();

      if (distanceSq > minDistanceSq) {
        continue;
      }

      const distance = Math.max(0.001, Math.sqrt(distanceSq));
      const normal = offset.multiplyScalar(1 / distance);
      const overlap = minDistance - distance;
      const relativeVelocity = a.velocity.clone().sub(b.velocity);
      const separatingSpeed = relativeVelocity.dot(normal);
      const closingSpeed = Math.max(2.5, Math.abs(Math.min(0, separatingSpeed)));
      const push = overlap * 0.52;

      a.position.addScaledVector(normal, push);
      b.position.addScaledVector(normal, -push);

      if (separatingSpeed < 0) {
        const restitution = 0.18;
        const impulse = (-(1 + restitution) * separatingSpeed) / 2;
        a.velocity.addScaledVector(normal, impulse);
        b.velocity.addScaledVector(normal, -impulse);
      }

      const sharedDamping = THREE.MathUtils.clamp(1 - closingSpeed * 0.018, 0.68, 0.92);
      a.velocity.multiplyScalar(sharedDamping);
      b.velocity.multiplyScalar(sharedDamping);
      syncCarAfterCollision(track, a);
      syncCarAfterCollision(track, b);
      applyCollisionFeedback(a, closingSpeed);
      applyCollisionFeedback(b, closingSpeed);
    }
  }
}

function updateAi(track: TrackInfo, car: CarRuntime, cars: CarRuntime[], dt: number, raceTime: number) {
  if (car.finished) {
    return;
  }

  const turnSoon = signedTurnAhead(track, car.progress, 0.052);
  const turnNow = signedTurnAhead(track, car.progress, 0.018);
  const cornerSeverity = THREE.MathUtils.clamp(Math.abs(turnSoon) * 6.2 + Math.abs(turnNow) * 2.2, 0, 1);
  const racingLine = THREE.MathUtils.clamp(-Math.sign(turnSoon || turnNow) * cornerSeverity * 7.2, -8.2, 8.2);
  const { speedPenalty, offsetPush, speedLimit } = findAiAvoidance(track, car, cars, raceTime);
  const speedWave = Math.sin(raceTime * 0.72 + car.aiPhase) * 0.85;
  const cornerSpeed = car.aiBaseSpeed * THREE.MathUtils.lerp(1, 0.74, cornerSeverity);
  car.collisionSlowdown = Math.max(0, car.collisionSlowdown - dt * 7);
  const openRoadTargetSpeed = Math.max(24, cornerSpeed + speedWave - speedPenalty - car.collisionSlowdown * 2.2);
  const targetSpeed = Math.min(openRoadTargetSpeed, speedLimit);
  car.isAccelerating = targetSpeed > car.speed + 0.7;
  car.isBraking = targetSpeed < car.speed - 0.4 || cornerSeverity > 0.58;
  car.collisionFlash = Math.max(0, car.collisionFlash - dt * 5);

  car.aiTargetOffset = THREE.MathUtils.clamp(car.laneOffset * 0.38 + racingLine + offsetPush, -8.5, 8.5);
  car.laneOffset = THREE.MathUtils.lerp(car.laneOffset, car.aiTargetOffset, 1 - Math.pow(0.006, dt));
  car.speed = THREE.MathUtils.lerp(car.speed, targetSpeed, 1 - Math.pow(0.018, dt));
  car.lastProgress = car.progress;
  car.progress = wrapProgress(car.progress + (car.speed / track.length) * dt);

  const pose = sampleTrack(track, car.progress);
  const weave = Math.sin(raceTime * 1.1 + car.aiPhase) * 0.18;
  car.position.copy(pose.center).addScaledVector(pose.normal, car.laneOffset + weave);
  car.velocity.copy(pose.tangent).multiplyScalar(car.speed);
  car.heading = tangentHeading(pose.tangent);
  car.driftAmount = THREE.MathUtils.lerp(car.driftAmount, cornerSeverity * 0.25, 1 - Math.pow(0.01, dt));
  car.bodyRoll = THREE.MathUtils.lerp(car.bodyRoll, -weave * 0.045, 1 - Math.pow(0.004, dt));
  car.bodyPitch = THREE.MathUtils.lerp(car.bodyPitch, 0, 1 - Math.pow(0.004, dt));
  car.suspensionOffset = THREE.MathUtils.lerp(
    car.suspensionOffset,
    Math.sin(raceTime * 13 + car.aiPhase) * 0.025,
    1 - Math.pow(0.015, dt)
  );

  const nearestCurrent = nearestTrackSample(track, car.position);
  const movement = forwardDelta(car.lastProgress, car.progress);
  updateCheckpoint(track, car, raceTime, nearestCurrent.lateral, movement);
}

function getLiveOrder(cars: CarRuntime[]) {
  return [...cars].sort((a, b) => {
    if (a.finished && b.finished) {
      return (a.finishTime ?? 0) - (b.finishTime ?? 0);
    }

    if (a.finished) {
      return -1;
    }

    if (b.finished) {
      return 1;
    }

    return b.completedLaps + b.progress - (a.completedLaps + a.progress);
  });
}

function makeHud(game: GameRuntime, now: number): HudState {
  const player = game.cars[0];
  const raceTime = Math.max(0, now - game.raceStartedAt);
  const countdownRemaining = game.raceStartedAt - now;
  const liveOrder = getLiveOrder(game.cars);
  const playerPlace = liveOrder.findIndex((car) => car.isPlayer) + 1;
  const results: ResultRow[] = liveOrder.map((car, index) => ({
    name: car.name,
    color: car.color,
    finished: car.finished,
    isPlayer: car.isPlayer,
    place: index + 1,
    time: car.finishTime,
    bestLapTime: car.bestLapTime
  }));

  let countdownText = "";
  if (game.phase === "countdown") {
    countdownText =
      countdownRemaining > 0.35 ? String(Math.max(1, Math.ceil(countdownRemaining - 0.35))) : "GO!";
  }

  return {
    phase: game.phase,
    countdownText,
    speedKmh: Math.round(Math.abs(player.speed) * 3.6),
    timer: game.phase === "finished" ? player.finishTime ?? raceTime : raceTime,
    lap: Math.min(TOTAL_LAPS, player.lap),
    totalLaps: TOTAL_LAPS,
    checkpoint: player.nextCheckpointIndex,
    checkpointTotal: CHECKPOINT_COUNT,
    position: playerPlace,
    totalCars: game.cars.length,
    bestLapTime: player.bestLapTime,
    accelerating: player.isAccelerating,
    braking: player.isBraking,
    drifting: player.driftAmount,
    collisionCount: player.collisionCount,
    results
  };
}

function updateCamera(camera: THREE.Camera, player: CarRuntime, dt: number) {
  const speed = Math.abs(player.speed);
  reusableForward.set(Math.sin(player.heading), 0, Math.cos(player.heading));
  const speedMix = THREE.MathUtils.clamp(speed / 68, 0, 1);
  const chaseDistance = THREE.MathUtils.lerp(11.5, 17.8, speedMix);
  const chaseHeight = THREE.MathUtils.lerp(3.2, 5.5, speedMix);
  desiredCamera
    .copy(player.position)
    .addScaledVector(reusableForward, -chaseDistance)
    .add(new THREE.Vector3(0, chaseHeight, 0));

  if (camera.position.distanceToSquared(desiredCamera) > 6400) {
    camera.position.copy(desiredCamera);
  } else {
    camera.position.lerp(desiredCamera, 1 - Math.pow(0.018, dt));
  }

  cameraTarget.copy(player.position).addScaledVector(reusableForward, 10.5).add(new THREE.Vector3(0, 1.35, 0));
  camera.lookAt(cameraTarget);

  if (camera instanceof THREE.PerspectiveCamera) {
    const targetFov = THREE.MathUtils.lerp(64, 79, speedMix);
    camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, 1 - Math.pow(0.025, dt));
    camera.updateProjectionMatrix();
  }
}

function trimPool<T>(pool: T[], max: number) {
  if (pool.length > max) {
    pool.splice(0, pool.length - max);
  }
}

function addParticle(pool: VisualParticle[], particle: VisualParticle, max: number) {
  if (max <= 0) {
    return;
  }

  pool.push(particle);
  trimPool(pool, max);
}

function updateEffectPools(game: GameRuntime, dt: number) {
  const updateParticle = (particle: VisualParticle) => {
    particle.life -= dt;
    particle.position.addScaledVector(particle.velocity, dt);
    particle.velocity.multiplyScalar(Math.pow(0.55, dt));
    particle.velocity.y += 0.7 * dt;
    return particle.life > 0;
  };

  game.smokeParticles = game.smokeParticles.filter(updateParticle);
  game.sparkParticles = game.sparkParticles.filter(updateParticle);
  game.speedParticles = game.speedParticles.filter(updateParticle);

  game.skidMarks.forEach((mark) => {
    mark.age += dt;
    mark.opacity = Math.max(0, 1 - mark.age / mark.maxAge);
  });
  game.skidMarks = game.skidMarks.filter((mark) => mark.age < mark.maxAge);
}

function emitPlayerEffects(game: GameRuntime, player: CarRuntime, quality: QualityConfig, raceTime: number) {
  const speed = Math.abs(player.speed);
  reusableForward.set(Math.sin(player.heading), 0, Math.cos(player.heading));
  reusableRight.set(reusableForward.z, 0, -reusableForward.x);

  if (quality.smoke && player.driftAmount > 0.24 && speed > 10 && raceTime - game.lastSmokeAt > 0.045) {
    game.lastSmokeAt = raceTime;
    for (const side of [-1, 1]) {
      addParticle(
        game.smokeParticles,
        {
          position: player.position
            .clone()
            .addScaledVector(reusableForward, -1.8)
            .addScaledVector(reusableRight, side * 1.0)
            .add(new THREE.Vector3(0, 0.35, 0)),
          velocity: reusableForward
            .clone()
            .multiplyScalar(-1.5 - speed * 0.035)
            .addScaledVector(reusableRight, side * 0.45)
            .add(new THREE.Vector3(0, 0.55, 0)),
          life: 1.2,
          maxLife: 1.2,
          size: 0.48 + player.driftAmount * 0.62,
          color: "#c7c2b7"
        },
        quality.maxSmoke
      );
    }
  }

  if (player.driftAmount > 0.18 && speed > 8 && raceTime - game.lastSkidAt > 0.07) {
    game.lastSkidAt = raceTime;
    for (const side of [-1, 1]) {
      game.skidMarks.push({
        position: player.position
          .clone()
          .addScaledVector(reusableForward, -1.35)
          .addScaledVector(reusableRight, side * 0.88)
          .add(new THREE.Vector3(0, 0.115, 0)),
        heading: player.heading,
        age: 0,
        maxAge: 18,
        width: 0.28 + player.driftAmount * 0.18,
        opacity: 0.76
      });
    }
    trimPool(game.skidMarks, quality.maxSkids);
  }

  if (quality.speedParticles && speed > 42 && raceTime - game.lastSpeedParticleAt > 0.035) {
    game.lastSpeedParticleAt = raceTime;
    addParticle(
      game.speedParticles,
      {
        position: player.position
          .clone()
          .addScaledVector(reusableForward, -6.5)
          .addScaledVector(reusableRight, (Math.sin(raceTime * 31) * 0.5 + Math.sin(raceTime * 17)) * 2.4)
          .add(new THREE.Vector3(0, 1.0 + Math.sin(raceTime * 23) * 0.4, 0)),
        velocity: reusableForward.clone().multiplyScalar(-12 - speed * 0.16),
        life: 0.45,
        maxLife: 0.45,
        size: 0.08,
        color: "#fff2c6"
      },
      quality.maxSpeedParticles
    );
  }

  if (quality.sparks && player.collisionFlash > 0.85) {
    for (let index = 0; index < 8; index += 1) {
      const spread = (index / 8) * Math.PI * 2;
      addParticle(
        game.sparkParticles,
        {
          position: player.position.clone().add(new THREE.Vector3(0, 0.8, 0)),
          velocity: new THREE.Vector3(Math.cos(spread) * 5.5, 2.5 + (index % 3), Math.sin(spread) * 5.5),
          life: 0.42,
          maxLife: 0.42,
          size: 0.13,
          color: "#ffcc57"
        },
        quality.maxSparks
      );
    }
  }
}

function updateInstances(
  mesh: THREE.InstancedMesh | null,
  particles: VisualParticle[],
  baseScale: THREE.Vector3,
  faceCamera = false,
  camera?: THREE.Camera
) {
  if (!mesh) {
    return;
  }

  mesh.count = particles.length;
  particles.forEach((particle, index) => {
    const alpha = Math.max(0.08, particle.life / particle.maxLife);
    reusableScale.copy(baseScale).multiplyScalar(particle.size * alpha);
    reusableQuaternion.identity();

    if (faceCamera && camera) {
      reusableQuaternion.copy(camera.quaternion);
    }

    reusableMatrix.compose(particle.position, reusableQuaternion, reusableScale);
    mesh.setMatrixAt(index, reusableMatrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
}

function updateSkidInstances(mesh: THREE.InstancedMesh | null, marks: SkidMark[]) {
  if (!mesh) {
    return;
  }

  mesh.count = marks.length;
  marks.forEach((mark, index) => {
    reusableQuaternion.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, -mark.heading));
    reusableScale.set(mark.width, 2.2, 1);
    reusableMatrix.compose(mark.position, reusableQuaternion, reusableScale);
    mesh.setMatrixAt(index, reusableMatrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
}

function VisualEffects({
  gameRef,
  qualityConfig
}: {
  gameRef: { current: GameRuntime };
  qualityConfig: QualityConfig;
}) {
  const smokeRef = useRef<THREE.InstancedMesh>(null);
  const sparkRef = useRef<THREE.InstancedMesh>(null);
  const speedRef = useRef<THREE.InstancedMesh>(null);
  const skidRef = useRef<THREE.InstancedMesh>(null);
  const { camera } = useThree();

  useFrame(() => {
    updateInstances(smokeRef.current, gameRef.current.smokeParticles, smokeScale, true, camera);
    updateInstances(sparkRef.current, gameRef.current.sparkParticles, sparkScale, false);
    updateInstances(speedRef.current, gameRef.current.speedParticles, speedParticleScale, false);
    updateSkidInstances(skidRef.current, gameRef.current.skidMarks);
  });

  return (
    <>
      <instancedMesh ref={skidRef} args={[undefined, undefined, qualityConfig.maxSkids]} frustumCulled={false}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial color="#090705" depthWrite={false} opacity={0.42} transparent />
      </instancedMesh>
      {qualityConfig.smoke && (
        <instancedMesh ref={smokeRef} args={[undefined, undefined, qualityConfig.maxSmoke]} frustumCulled={false}>
          <sphereGeometry args={[0.55, 8, 6]} />
          <meshBasicMaterial color="#c7c2b7" depthWrite={false} opacity={0.18} transparent />
        </instancedMesh>
      )}
      {qualityConfig.sparks && (
        <instancedMesh ref={sparkRef} args={[undefined, undefined, qualityConfig.maxSparks]} frustumCulled={false}>
          <sphereGeometry args={[0.16, 6, 4]} />
          <meshBasicMaterial color="#ffbf35" toneMapped={false} />
        </instancedMesh>
      )}
      {qualityConfig.speedParticles && (
        <instancedMesh ref={speedRef} args={[undefined, undefined, qualityConfig.maxSpeedParticles]} frustumCulled={false}>
          <boxGeometry args={[1, 1, 1]} />
          <meshBasicMaterial color="#fff2c6" depthWrite={false} opacity={0.62} transparent />
        </instancedMesh>
      )}
    </>
  );
}

function CarWheel({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0.52, z]} rotation={[0, 0, Math.PI / 2]}>
      <mesh castShadow>
        <cylinderGeometry args={[0.47, 0.47, 0.42, 32]} />
        <meshStandardMaterial color="#0a0b0d" roughness={0.76} />
      </mesh>
      <mesh position={[0, x > 0 ? 0.22 : -0.22, 0]}>
        <cylinderGeometry args={[0.3, 0.3, 0.035, 18]} />
        <meshStandardMaterial color="#8d989f" metalness={0.92} roughness={0.2} />
      </mesh>
      <mesh position={[0, x > 0 ? 0.242 : -0.242, 0]}>
        <cylinderGeometry args={[0.115, 0.115, 0.045, 18]} />
        <meshStandardMaterial color="#20262b" metalness={0.78} roughness={0.28} />
      </mesh>
      <mesh position={[0, x > 0 ? 0.25 : -0.25, 0.15]}>
        <boxGeometry args={[0.12, 0.045, 0.22]} />
        <meshStandardMaterial color="#e33131" metalness={0.42} roughness={0.32} />
      </mesh>
    </group>
  );
}

function CarModel({ color, brakeLightOn, collisionFlash }: { color: string; brakeLightOn: boolean; collisionFlash: number }) {
  const bodyColor = collisionFlash > 0 ? "#fff1c2" : color;
  const lowerBody = useMemo(() => new RoundedBoxGeometry(2.25, 0.58, 4.45, 5, 0.2), []);
  const hood = useMemo(() => new RoundedBoxGeometry(1.98, 0.34, 1.48, 4, 0.16), []);
  const rearDeck = useMemo(() => new RoundedBoxGeometry(2.02, 0.3, 1.16, 4, 0.14), []);

  return (
    <group>
      <mesh receiveShadow position={[0, 0.13, 0]} scale={[1.7, 0.035, 2.55]}>
        <sphereGeometry args={[1, 28, 8]} />
        <meshBasicMaterial color="#020304" opacity={0.2} transparent />
      </mesh>

      <mesh castShadow receiveShadow geometry={lowerBody} position={[0, 0.76, -0.02]}>
        <meshPhysicalMaterial
          clearcoat={1}
          clearcoatRoughness={0.035}
          color={bodyColor}
          envMapIntensity={3.15}
          iridescence={0.08}
          iridescenceIOR={1.3}
          metalness={0.52}
          roughness={0.12}
        />
      </mesh>
      <mesh castShadow position={[0, 0.52, 0.02]}>
        <boxGeometry args={[2.42, 0.18, 3.28]} />
        <meshStandardMaterial color="#151a1d" metalness={0.68} roughness={0.28} />
      </mesh>
      <mesh castShadow position={[0, 0.58, 2.16]} rotation={[0.02, 0, 0]}>
        <boxGeometry args={[2.05, 0.1, 0.24]} />
        <meshStandardMaterial color="#090c0e" metalness={0.72} roughness={0.22} />
      </mesh>
      <mesh castShadow geometry={hood} position={[0, 1.02, 1.34]} rotation={[-0.055, 0, 0]}>
        <meshPhysicalMaterial
          clearcoat={1}
          clearcoatRoughness={0.035}
          color={bodyColor}
          envMapIntensity={3.15}
          iridescence={0.08}
          iridescenceIOR={1.3}
          metalness={0.52}
          roughness={0.12}
        />
      </mesh>
      <mesh castShadow geometry={rearDeck} position={[0, 1.01, -1.52]} rotation={[0.035, 0, 0]}>
        <meshPhysicalMaterial
          clearcoat={1}
          clearcoatRoughness={0.035}
          color={bodyColor}
          envMapIntensity={3.15}
          iridescence={0.08}
          iridescenceIOR={1.3}
          metalness={0.52}
          roughness={0.12}
        />
      </mesh>

      <mesh castShadow position={[0, 1.28, -0.28]} scale={[0.83, 0.55, 1.0]}>
        <sphereGeometry args={[1, 32, 16]} />
        <meshPhysicalMaterial
          color="#101c27"
          clearcoat={0.82}
          envMapIntensity={2.7}
          metalness={0.35}
          roughness={0.06}
          transmission={0.06}
        />
      </mesh>
      <mesh position={[0, 1.38, 0.38]} rotation={[-0.46, 0, 0]}>
        <boxGeometry args={[1.46, 0.035, 0.76]} />
        <meshPhysicalMaterial color="#8fc3d8" envMapIntensity={2.8} metalness={0.2} opacity={0.7} roughness={0.04} transparent />
      </mesh>
      <mesh position={[0, 1.37, -1.02]} rotation={[0.47, 0, 0]}>
        <boxGeometry args={[1.4, 0.035, 0.68]} />
        <meshPhysicalMaterial color="#78a9bf" envMapIntensity={2.6} metalness={0.18} opacity={0.56} roughness={0.05} transparent />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={`window-${side}`} position={[side * 0.79, 1.32, -0.28]} rotation={[0, 0, side * -0.13]}>
          <boxGeometry args={[0.035, 0.54, 1.18]} />
          <meshPhysicalMaterial color="#17303e" envMapIntensity={2.5} metalness={0.2} opacity={0.72} roughness={0.06} transparent />
        </mesh>
      ))}

      <mesh castShadow position={[0, 0.52, 2.22]}>
        <boxGeometry args={[1.72, 0.18, 0.16]} />
        <meshStandardMaterial color="#12171b" metalness={0.72} roughness={0.24} />
      </mesh>
      {[-0.84, 0.84].map((x) => (
        <mesh key={`front-intake-${x}`} position={[x, 0.66, 2.29]}>
          <boxGeometry args={[0.34, 0.09, 0.05]} />
          <meshStandardMaterial color="#050607" roughness={0.58} />
        </mesh>
      ))}
      {[-0.7, 0.7].map((x) => (
        <mesh key={`headlight-${x}`} position={[x, 0.93, 2.235]} rotation={[-0.06, 0, 0]}>
          <boxGeometry args={[0.58, 0.18, 0.08]} />
          <meshStandardMaterial color="#f8fbff" emissive="#dff5ff" emissiveIntensity={1.35} toneMapped={false} />
        </mesh>
      ))}
      <mesh position={[0, 0.72, 2.32]}>
        <boxGeometry args={[0.72, 0.22, 0.055]} />
        <meshStandardMaterial color="#080b0d" metalness={0.72} roughness={0.3} />
      </mesh>

      <mesh castShadow position={[0, 0.6, -2.25]}>
        <boxGeometry args={[1.9, 0.27, 0.16]} />
        <meshStandardMaterial color="#101418" metalness={0.68} roughness={0.3} />
      </mesh>
      {[-0.68, 0.68].map((x) => (
        <group key={`tail-${x}`} position={[x, 0.98, -2.255]}>
          <mesh>
            <boxGeometry args={[0.54, 0.2, 0.08]} />
            <meshStandardMaterial color="#9c111e" emissive="#ff1526" emissiveIntensity={brakeLightOn ? 4.2 : 0.72} toneMapped={false} />
          </mesh>
          <mesh position={[0, 0, -0.045]}>
            <boxGeometry args={[0.32, 0.045, 0.025]} />
            <meshBasicMaterial color="#ffd9cd" toneMapped={false} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, 0.91, -2.31]}>
        <boxGeometry args={[0.44, 0.18, 0.035]} />
        <meshStandardMaterial color="#e7ebed" metalness={0.12} roughness={0.45} />
      </mesh>
      {[-0.66, 0.66].map((x) => (
        <mesh key={`exhaust-${x}`} position={[x, 0.44, -2.34]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.1, 0.035, 8, 18]} />
          <meshStandardMaterial color="#636b70" metalness={0.95} roughness={0.22} />
        </mesh>
      ))}

      <mesh castShadow position={[0, 1.27, -2.0]}>
        <boxGeometry args={[1.78, 0.1, 0.42]} />
        <meshStandardMaterial color="#11171b" metalness={0.76} roughness={0.2} />
      </mesh>
      {[-0.72, 0.72].map((x) => (
        <mesh key={`wing-mount-${x}`} castShadow position={[x, 1.12, -1.9]}>
          <boxGeometry args={[0.07, 0.32, 0.08]} />
          <meshStandardMaterial color="#171c20" metalness={0.7} roughness={0.24} />
        </mesh>
      ))}

      {[-1, 1].map((side) => (
        <group key={`mirror-${side}`} position={[side * 1.18, 1.21, 0.42]}>
          <mesh castShadow scale={[0.26, 0.15, 0.34]}>
            <sphereGeometry args={[1, 18, 10]} />
            <meshPhysicalMaterial color={bodyColor} clearcoat={1} envMapIntensity={2.1} metalness={0.42} roughness={0.16} />
          </mesh>
        </group>
      ))}

      <mesh castShadow position={[-1.08, 0.62, 0]}>
        <boxGeometry args={[0.12, 0.18, 2.75]} />
        <meshStandardMaterial color="#14181b" metalness={0.68} roughness={0.28} />
      </mesh>
      <mesh castShadow position={[1.08, 0.62, 0]}>
        <boxGeometry args={[0.12, 0.18, 2.75]} />
        <meshStandardMaterial color="#14181b" metalness={0.68} roughness={0.28} />
      </mesh>

      <CarWheel x={-1.18} z={1.36} />
      <CarWheel x={1.18} z={1.36} />
      <CarWheel x={-1.18} z={-1.42} />
      <CarWheel x={1.18} z={-1.42} />
    </group>
  );
}

function ImportedCarScene({
  model,
  brakeLightOn,
  rotate180 = false,
  colorProfile
}: {
  model: THREE.Object3D;
  brakeLightOn: boolean;
  rotate180?: boolean;
  colorProfile?: "corvette" | "acura";
}) {
  const modelFit = useMemo(() => {
    const bounds = new THREE.Box3().setFromObject(model);
    const size = bounds.getSize(new THREE.Vector3());
    // Match the visible car footprint, not vertical model metadata or empty GLB bounds.
    const horizontalLength = Math.max(size.x, size.z, 0.001);
    const scale = IMPORTED_PLAYER_CAR_LENGTH / horizontalLength;
    return { scale, groundOffset: -bounds.min.y * scale };
  }, [model]);

  useLayoutEffect(() => {
    model.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;

      child.castShadow = true;
      child.receiveShadow = true;
      const sourceMaterials = Array.isArray(child.material) ? child.material : [child.material];
      const materials = sourceMaterials.map((material) => material.clone());

      materials.forEach((material) => {
        const name = material.name.toLowerCase();
        if (colorProfile === "corvette" && material instanceof THREE.MeshStandardMaterial) {
          if (name.includes("admiral_blue")) {
            material.color.set("#4d8ee6");
            material.metalness = 0.62;
            material.roughness = 0.2;
            material.emissive.set("#102b58");
            material.emissiveIntensity = 0.34;
          } else if (name === "metallic_black" || name === "black") {
            material.color.set("#3e5870");
            material.metalness = 0.58;
            material.roughness = 0.24;
            material.emissive.set("#0d1d2c");
            material.emissiveIntensity = 0.3;
          } else if (name.includes("metallic_white") || name.includes("grand_sport")) {
            material.color.set("#e5edf7");
            material.metalness = 0.48;
            material.roughness = 0.22;
          } else if (name.includes("glass_dark")) {
            material.color.set("#263746");
            material.roughness = 0.16;
          }
        }
        if (colorProfile === "acura" && material instanceof THREE.MeshStandardMaterial) {
          if (name === "body" || name === "sidemirror") {
            material.color.set("#c92c24");
            material.metalness = 0.64;
            material.roughness = 0.18;
            material.emissive.set("#310705");
            material.emissiveIntensity = 0.24;
          } else if (name.includes("glass")) {
            material.color.set("#18242d");
            material.metalness = 0.15;
            material.roughness = 0.12;
          } else if (name === "chrome" || name === "rims") {
            material.color.set("#bec5cc");
            material.metalness = 0.86;
            material.roughness = 0.2;
          } else if (name.includes("headlight") || name === "taillight") {
            material.color.set("#fff0d7");
            material.emissive.set(name === "taillight" ? "#ff1827" : "#fff0d5");
            material.emissiveIntensity = name === "taillight" ? 1.15 : 0.65;
          }
        }
        if (name.startsWith("redlight")) {
          if (material instanceof THREE.MeshStandardMaterial) {
            material.emissive.set("#ff192b");
            material.emissiveIntensity = brakeLightOn ? 4.1 : 0.72;
          }
        }
      });

      child.material = Array.isArray(child.material) ? materials : materials[0];
    });
  }, [brakeLightOn, colorProfile, model]);

  return (
    <group position={[0, modelFit.groundOffset, 0]} rotation={[0, rotate180 ? Math.PI : 0, 0]} scale={modelFit.scale}>
      <primitive object={model} />
    </group>
  );
}

function ImportedGlbCar({ assetUrl, brakeLightOn, colorProfile }: { assetUrl: string; brakeLightOn: boolean; colorProfile?: "corvette" | "acura" }) {
  const gltf = useLoader(GLTFLoader, assetUrl);
  const model = useMemo(() => gltf.scene.clone(true), [gltf.scene]);

  return <ImportedCarScene brakeLightOn={brakeLightOn} colorProfile={colorProfile} model={model} />;
}

function HighQualityPlayerCar({ brakeLightOn, vehicle }: { brakeLightOn: boolean; vehicle: PlayerVehicle }) {
  if (vehicle === "sportcar1") {
    return <ImportedGlbCar assetUrl="/assets/mercedes-amg-gt.glb" brakeLightOn={brakeLightOn} />;
  }

  return (
    <ImportedGlbCar
      assetUrl={
        vehicle === "acuraNsx"
          ? "/assets/acura-nsx.glb"
          : vehicle === "corvetteC7"
              ? "/assets/corvette-c7-grand-sport.glb"
              : vehicle === "ferrariSf90"
                ? "/assets/ferrari-sf90.glb"
          : vehicle === "sedan"
            ? "/assets/sedan-cgtrader.glb"
            : "/assets/sportcar2-cgtrader.glb"
      }
      brakeLightOn={brakeLightOn}
      colorProfile={vehicle === "corvetteC7" ? "corvette" : vehicle === "acuraNsx" ? "acura" : undefined}
    />
  );
}

function PerformanceCarModel({
  color,
  brakeLightOn,
  collisionFlash
}: {
  color: string;
  brakeLightOn: boolean;
  collisionFlash: number;
}) {
  const bodyColor = collisionFlash > 0 ? "#fff1c2" : color;

  return (
    <group>
      <mesh position={[0, 0.72, 0]} receiveShadow>
        <boxGeometry args={[2.25, 0.72, 4.35]} />
        <meshStandardMaterial color={bodyColor} metalness={0.45} roughness={0.2} />
      </mesh>
      <mesh position={[0, 1.31, -0.32]}>
        <boxGeometry args={[1.72, 0.7, 1.92]} />
        <meshStandardMaterial color="#18303d" metalness={0.34} roughness={0.12} />
      </mesh>
      <mesh position={[0, 0.46, 0]}>
        <boxGeometry args={[2.36, 0.18, 3.75]} />
        <meshStandardMaterial color="#101418" metalness={0.55} roughness={0.35} />
      </mesh>
      <mesh position={[0, 0.5, 1.35]}>
        <boxGeometry args={[2.5, 0.56, 0.42]} />
        <meshStandardMaterial color="#090b0d" roughness={0.62} />
      </mesh>
      <mesh position={[0, 0.5, -1.38]}>
        <boxGeometry args={[2.5, 0.56, 0.42]} />
        <meshStandardMaterial color="#090b0d" roughness={0.62} />
      </mesh>
      <mesh position={[0, 0.9, -2.19]}>
        <boxGeometry args={[1.45, 0.18, 0.08]} />
        <meshStandardMaterial
          color="#b61322"
          emissive="#ff1829"
          emissiveIntensity={brakeLightOn ? 3.2 : 0.55}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

function TrackSurface({ track, anisotropy }: { track: TrackInfo; anisotropy: number }) {
  const roadGeometry = useMemo(() => createRoadGeometry(track), [track]);
  const dashGeometry = useMemo(() => createDashGeometry(track), [track]);
  const { gl } = useThree();
  const asphalt = useMemo(() => makeRoadMaterial(Math.min(anisotropy, gl.capabilities.getMaxAnisotropy())), [gl, anisotropy]);
  useEffect(() => () => { asphalt.dispose(); roadGeometry.dispose(); dashGeometry.dispose(); }, [asphalt, roadGeometry, dashGeometry]);
  const start = sampleTrack(track, 0);

  return (
    <>
      <mesh receiveShadow geometry={roadGeometry} material={asphalt.material} />
      <RoadWear track={track} />
      <mesh geometry={dashGeometry}>
        <meshStandardMaterial
          color="#f4f6f2"
          roughness={0.64}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh
        position={start.center.clone().add(new THREE.Vector3(0, 0.13, 0))}
        rotation={[0, tangentHeading(start.tangent), 0]}
      >
        <boxGeometry args={[TRACK_WIDTH, 0.05, 1.05]} />
        <meshStandardMaterial color="#f7f0e4" roughness={0.38} />
      </mesh>
    </>
  );
}

function makeTrackStripGeometry(track: TrackInfo, innerOffset: number, outerOffset: number, y = 0.07) {
  const vertices: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let index = 0; index <= track.samples.length; index++) {
    const sample = track.samples[index % track.samples.length];
    const inner = sample.center.clone().addScaledVector(sample.normal, innerOffset);
    const outer = sample.center.clone().addScaledVector(sample.normal, outerOffset);
    vertices.push(inner.x, y, inner.z, outer.x, y, outer.z);
    uvs.push(0, index / 10, 1, index / 10);
    if (index < track.samples.length) {
      const a = index * 2;
      indices.push(a, a + 1, a + 3, a, a + 3, a + 2);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function RoadShoulders({ track }: { track: TrackInfo }) {
  const leftShoulder = useMemo(() => makeTrackStripGeometry(track, TRACK_WIDTH / 2, TRACK_WIDTH / 2 + 3.4, 0.055), [track]);
  const rightShoulder = useMemo(() => makeTrackStripGeometry(track, -TRACK_WIDTH / 2, -TRACK_WIDTH / 2 - 3.4, 0.055), [track]);
  const leftLine = useMemo(() => makeTrackStripGeometry(track, TRACK_WIDTH / 2 - 0.28, TRACK_WIDTH / 2 - 0.04, 0.115), [track]);
  const rightLine = useMemo(() => makeTrackStripGeometry(track, -TRACK_WIDTH / 2 + 0.28, -TRACK_WIDTH / 2 + 0.04, 0.115), [track]);
  const gravelTexture = useMemo(() => makeGravelTexture(), []);
  const leftKerb = useMemo(() => makeRumbleStripGeometry(track, 1), [track]);
  const rightKerb = useMemo(() => makeRumbleStripGeometry(track, -1), [track]);

  return (
    <>
      <mesh receiveShadow geometry={leftShoulder}>
        <meshStandardMaterial color="#c4c1b5" map={gravelTexture} bumpMap={gravelTexture} bumpScale={0.065} roughness={0.94} side={THREE.DoubleSide} />
      </mesh>
      <mesh receiveShadow geometry={rightShoulder}>
        <meshStandardMaterial color="#c4c1b5" map={gravelTexture} bumpMap={gravelTexture} bumpScale={0.065} roughness={0.94} side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={leftLine}>
        <meshBasicMaterial color="#f6f1df" side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={rightLine}>
        <meshBasicMaterial color="#f6f1df" side={THREE.DoubleSide} />
      </mesh>
      <mesh receiveShadow geometry={leftKerb}>
        <meshStandardMaterial roughness={0.5} side={THREE.DoubleSide} vertexColors />
      </mesh>
      <mesh receiveShadow geometry={rightKerb}>
        <meshStandardMaterial roughness={0.5} side={THREE.DoubleSide} vertexColors />
      </mesh>
    </>
  );
}

function makeRumbleStripGeometry(track: TrackInfo, side: number) {
  const vertices: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const red = new THREE.Color("#bf1e24");
  const white = new THREE.Color("#f0eee7");

  track.samples.forEach((sample, index) => {
    const next = track.samples[(index + 1) % track.samples.length];
    const inner = sample.center.clone().addScaledVector(sample.normal, side * (TRACK_WIDTH / 2 + 0.2));
    const outer = sample.center.clone().addScaledVector(sample.normal, side * (TRACK_WIDTH / 2 + 0.92));
    const nextInner = next.center.clone().addScaledVector(next.normal, side * (TRACK_WIDTH / 2 + 0.2));
    const nextOuter = next.center.clone().addScaledVector(next.normal, side * (TRACK_WIDTH / 2 + 0.92));
    const base = vertices.length / 3;
    const color = Math.floor(index / 5) % 2 === 0 ? red : white;

    [inner, outer, nextOuter, nextInner].forEach((point) => {
      vertices.push(point.x, 0.122, point.z);
      colors.push(color.r, color.g, color.b);
    });
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function Barriers({ track }: { track: TrackInfo }) {
  const postRef = useRef<THREE.InstancedMesh>(null);
  const upperRailRef = useRef<THREE.InstancedMesh>(null);
  const lowerRailRef = useRef<THREE.InstancedMesh>(null);
  const reflectorRef = useRef<THREE.InstancedMesh>(null);
  const rails = useMemo(() => {
    const output: { position: THREE.Vector3; heading: number; length: number; side: number }[] = [];
    const step = 2;

    for (let index = 0; index < track.samples.length; index += step) {
      const nextIndex = (index + step) % track.samples.length;

      for (const side of [-1, 1]) {
        const start = track.samples[index].center
          .clone()
          .addScaledVector(track.samples[index].normal, side * (TRACK_WIDTH / 2 + 1.95));
        const end = track.samples[nextIndex].center
          .clone()
          .addScaledVector(track.samples[nextIndex].normal, side * (TRACK_WIDTH / 2 + 1.95));
        const direction = end.clone().sub(start);
        const segmentLength = Math.max(direction.length() * 0.86, 1.2);
        direction.normalize();

        output.push({
          position: start.add(end).multiplyScalar(0.5),
          heading: tangentHeading(direction),
          length: segmentLength,
          side
        });
      }
    }

    return output;
  }, [track]);

  useLayoutEffect(() => {
    const dummy = new THREE.Object3D();
    const localOffset = new THREE.Vector3();

    const setInstances = (
      mesh: THREE.InstancedMesh | null,
      position: (rail: (typeof rails)[number]) => [number, number, number],
      scale: (rail: (typeof rails)[number]) => [number, number, number]
    ) => {
      if (!mesh) return;

      rails.forEach((rail, index) => {
        const [x, y, z] = position(rail);
        localOffset.set(x, y, z).applyAxisAngle(THREE.Object3D.DEFAULT_UP, rail.heading);
        dummy.position.copy(rail.position).add(localOffset);
        dummy.rotation.set(0, rail.heading, 0);
        dummy.scale.set(...scale(rail));
        dummy.updateMatrix();
        mesh.setMatrixAt(index, dummy.matrix);
      });

      mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    };

    setInstances(postRef.current, () => [0, 0.54, 0], () => [0.16, 1.08, 0.2]);
    setInstances(upperRailRef.current, () => [0, 0.87, 0], (rail) => [0.19, 0.28, rail.length]);
    setInstances(lowerRailRef.current, () => [0, 0.5, 0], (rail) => [0.14, 0.16, rail.length]);
    setInstances(reflectorRef.current, (rail) => [rail.side * -0.105, 0.89, 0], () => [0.04, 0.1, 0.28]);
  }, [rails]);

  return (
    <>
      <instancedMesh ref={postRef} args={[undefined, undefined, rails.length]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#626a6e" roughness={0.52} metalness={0.62} />
      </instancedMesh>
      <instancedMesh ref={upperRailRef} args={[undefined, undefined, rails.length]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#aeb9bd" roughness={0.31} metalness={0.78} envMapIntensity={1.25} />
      </instancedMesh>
      <instancedMesh ref={lowerRailRef} args={[undefined, undefined, rails.length]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#899397" roughness={0.38} metalness={0.72} envMapIntensity={1.15} />
      </instancedMesh>
      <instancedMesh ref={reflectorRef} args={[undefined, undefined, rails.length]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#f5e7bd" emissive="#f5be50" emissiveIntensity={0.3} />
      </instancedMesh>
    </>
  );
}

function SpeedReferencePosts({ track }: { track: TrackInfo }) {
  const bodyRef = useRef<THREE.InstancedMesh>(null);
  const markerRef = useRef<THREE.InstancedMesh>(null);
  const reflectorRef = useRef<THREE.InstancedMesh>(null);
  const posts = useMemo(() => {
    const output: { position: THREE.Vector3; heading: number; side: number }[] = [];

    for (let index = 0; index < track.samples.length; index += 8) {
      const sample = track.samples[index];
      const heading = tangentHeading(sample.tangent);

      for (const side of [-1, 1]) {
        output.push({
          position: sample.center.clone().addScaledVector(sample.normal, side * (TRACK_WIDTH / 2 + 4.8)),
          heading,
          side
        });
      }
    }

    return output;
  }, [track]);

  useLayoutEffect(() => {
    const dummy = new THREE.Object3D();
    const localOffset = new THREE.Vector3();

    const populate = (
      mesh: THREE.InstancedMesh | null,
      offset: (post: (typeof posts)[number]) => [number, number, number],
      scale: [number, number, number]
    ) => {
      if (!mesh) return;

      posts.forEach((post, index) => {
        localOffset.set(...offset(post)).applyAxisAngle(THREE.Object3D.DEFAULT_UP, post.heading);
        dummy.position.copy(post.position).add(localOffset);
        dummy.rotation.set(0, post.heading, 0);
        dummy.scale.set(...scale);
        dummy.updateMatrix();
        mesh.setMatrixAt(index, dummy.matrix);
      });

      mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    };

    populate(bodyRef.current, () => [0, 0.42, 0], [0.17, 0.84, 0.14]);
    populate(markerRef.current, (post) => [post.side * -0.095, 0.56, 0], [0.035, 0.24, 0.095]);
    populate(reflectorRef.current, (post) => [post.side * -0.115, 0.72, 0], [0.025, 0.1, 0.075]);
  }, [posts]);

  return (
    <>
      <instancedMesh ref={bodyRef} args={[undefined, undefined, posts.length]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#ecece4" roughness={0.7} />
      </instancedMesh>
      <instancedMesh ref={markerRef} args={[undefined, undefined, posts.length]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#1c2225" roughness={0.5} />
      </instancedMesh>
      <instancedMesh ref={reflectorRef} args={[undefined, undefined, posts.length]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#ffffff" emissive="#fff0c4" emissiveIntensity={0.5} />
      </instancedMesh>
    </>
  );
}

function CheckpointGates({ track }: { track: TrackInfo }) {
  return (
    <>
      {track.checkpointTargets.map((progress, index) => {
        const pose = sampleTrack(track, progress);
        const heading = tangentHeading(pose.tangent);
        const isFinish = index === track.checkpointTargets.length - 1;
        const markerColor = isFinish ? "#ffffff" : "#ffcf5d";
        const markerEmissive = isFinish ? "#453d2f" : "#402900";

        return (
          <group key={progress} position={pose.center} rotation={[0, heading, 0]}>
            <mesh receiveShadow position={[0, 0.075, 0]}>
              <boxGeometry args={[TRACK_WIDTH - 1.2, 0.035, 0.72]} />
              <meshStandardMaterial color={markerColor} emissive={markerEmissive} emissiveIntensity={0.25} roughness={0.48} />
            </mesh>
          </group>
        );
      })}
    </>
  );
}

function makeSignTexture(text: string, background: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 256;
  const context = canvas.getContext("2d");

  if (context) {
    context.fillStyle = background;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = "#2d1b0b";
    context.lineWidth = 18;
    context.strokeRect(18, 18, canvas.width - 36, canvas.height - 36);
    context.fillStyle = "#271805";
    context.font = "bold 74px Arial, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(text, canvas.width / 2, canvas.height / 2);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makeCanvasTexture(
  draw: (context: CanvasRenderingContext2D, width: number, height: number) => void,
  repeat: [number, number]
) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext("2d");

  if (context) {
    draw(context, canvas.width, canvas.height);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat[0], repeat[1]);
  return texture;
}

function seededRandom(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function makeGravelTexture() {
  const random = seededRandom(44519);
  const texture = makeCanvasTexture((context, width, height) => {
    context.fillStyle = "#aaa89e";
    context.fillRect(0, 0, width, height);
    for (let index = 0; index < 5200; index += 1) {
      const shade = 92 + Math.floor(random() * 92);
      const size = 0.7 + random() * 3.2;
      context.fillStyle = `rgba(${shade}, ${shade - 2}, ${shade - 8}, ${0.28 + random() * 0.42})`;
      context.beginPath();
      context.arc(random() * width, random() * height, size, 0, Math.PI * 2);
      context.fill();
    }
  }, [1.3, 1]);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makeGrassTexture() {
  return makeCanvasTexture((context, width, height) => {
    context.fillStyle = "#52803d";
    context.fillRect(0, 0, width, height);

    const random = seededRandom(92015);
    for (let index = 0; index < 260; index += 1) {
      const radius = 8 + random() * 42;
      context.fillStyle = `rgba(${50 + random() * 40}, ${95 + random() * 60}, ${32 + random() * 36}, ${0.035 + random() * 0.08})`;
      context.beginPath();
      context.ellipse(random() * width, random() * height, radius * 1.7, radius, random() * Math.PI, 0, Math.PI * 2);
      context.fill();
    }

    for (let index = 0; index < 7600; index += 1) {
      const green = 86 + Math.floor(random() * 58);
      context.strokeStyle = `rgba(${31 + random() * 32}, ${green}, ${31 + random() * 28}, ${0.11 + random() * 0.16})`;
      context.lineWidth = 1;
      const x = random() * width;
      const y = random() * height;
      context.beginPath();
      context.moveTo(x, y);
      context.lineTo(x + random() * 5 - 2, y - 3 - random() * 7);
      context.stroke();
    }
  }, [24, 24]);
}

function RoadSigns({ track }: { track: TrackInfo }) {
  const signs = useMemo(
    () => [
      { progress: 0.035, label: "BETHLEHEM", side: 1, bg: "#e7f5ff" },
      { progress: 0.255, label: "TENNI", side: -1, bg: "#fff5b8" },
      { progress: 0.505, label: "EYMATT", side: 1, bg: "#d9f7c8" },
      { progress: 0.755, label: "FORSTHAUS", side: -1, bg: "#e7f5ff" }
    ],
    []
  );
  const textures = useMemo(() => signs.map((sign) => makeSignTexture(sign.label, sign.bg)), [signs]);

  return (
    <>
      {signs.map((sign, index) => {
        const pose = sampleTrack(track, sign.progress);
        const position = pose.center.clone().addScaledVector(pose.normal, sign.side * (TRACK_WIDTH / 2 + 22));

        return (
          <group key={sign.label} position={position} rotation={[0, tangentHeading(pose.tangent), 0]}>
            <mesh castShadow position={[0, 1.8, 0]}>
              <boxGeometry args={[6.4, 2.4, 0.18]} />
              <meshStandardMaterial map={textures[index]} roughness={0.55} />
            </mesh>
            <mesh castShadow position={[0, 0.35, 0]}>
              <boxGeometry args={[6.9, 0.7, 0.42]} />
              <meshStandardMaterial color="#6f6352" roughness={0.78} />
            </mesh>
          </group>
        );
      })}
    </>
  );
}

function TunnelAndBridge({ track, compact = false }: { track: TrackInfo; compact?: boolean }) {
  const tunnelFrames = useMemo(() => {
    const frameCount = compact ? 3 : 9;
    const frameStep = compact ? 0.018 : 0.006;
    return Array.from({ length: frameCount }, (_, index) => sampleTrack(track, 0.31 + index * frameStep));
  }, [compact, track]);
  const bridgePose = sampleTrack(track, 0.64);
  const bridgeHeading = tangentHeading(bridgePose.tangent);

  return (
    <>
      {tunnelFrames.map((pose, index) => (
        <group key={index} position={pose.center} rotation={[0, tangentHeading(pose.tangent), 0]}>
          <mesh position={[-TRACK_WIDTH / 2 - 8.5, 2.6, 0]}>
            <boxGeometry args={[0.55, 5.2, 0.65]} />
            <meshStandardMaterial color="#3c3937" roughness={0.74} />
          </mesh>
          <mesh position={[TRACK_WIDTH / 2 + 8.5, 2.6, 0]}>
            <boxGeometry args={[0.55, 5.2, 0.65]} />
            <meshStandardMaterial color="#3c3937" roughness={0.74} />
          </mesh>
          {index % 3 === 1 && (
            <mesh position={[-TRACK_WIDTH / 2 - 8.45, 4.9, 0.08]}>
              <boxGeometry args={[0.12, 0.12, 0.9]} />
              <meshBasicMaterial color="#ffc46e" toneMapped={false} />
            </mesh>
          )}
          {index % 3 === 1 && (
            <mesh position={[TRACK_WIDTH / 2 + 8.45, 4.9, 0.08]}>
              <boxGeometry args={[0.12, 0.12, 0.9]} />
              <meshBasicMaterial color="#ffc46e" toneMapped={false} />
            </mesh>
          )}
        </group>
      ))}
      <group position={bridgePose.center} rotation={[0, bridgeHeading, 0]}>
        <mesh position={[-TRACK_WIDTH / 2 - 15, 4.4, -4]}>
          <boxGeometry args={[0.9, 8.8, 0.9]} />
          <meshStandardMaterial color="#4f4942" roughness={0.7} />
        </mesh>
        <mesh position={[TRACK_WIDTH / 2 + 15, 4.4, 4]}>
          <boxGeometry args={[0.9, 8.8, 0.9]} />
          <meshStandardMaterial color="#4f4942" roughness={0.7} />
        </mesh>
        <mesh position={[-TRACK_WIDTH / 2 - 15, 8.9, -4]}>
          <boxGeometry args={[5.2, 0.28, 0.28]} />
          <meshStandardMaterial color="#f4c26f" emissive="#4a2c10" emissiveIntensity={0.18} />
        </mesh>
        <mesh position={[TRACK_WIDTH / 2 + 15, 8.9, 4]}>
          <boxGeometry args={[5.2, 0.28, 0.28]} />
          <meshStandardMaterial color="#f4c26f" emissive="#4a2c10" emissiveIntensity={0.18} />
        </mesh>
      </group>
    </>
  );
}

type TreeInstance = {
  position: THREE.Vector3;
  rotation: number;
  scale: number;
  color: string;
};

function InstancedForest({ trees, castShadow }: { trees: TreeInstance[]; castShadow: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => {
    const parts = [0, 1, 2].map(i => new THREE.ConeGeometry(2.8 - i * 0.6, 4.6 - i * 0.5, 7).translate(0, 3.5 + i * 1.8, 0));
    const merged = mergeGeometries(parts)!;
    parts.forEach(g => g.dispose());
    return merged;
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const dummy = new THREE.Object3D();
    trees.forEach((tree, i) => {
      dummy.position.copy(tree.position); dummy.rotation.set(0, tree.rotation, 0); dummy.scale.setScalar(tree.scale); dummy.updateMatrix();
      ref.current!.setMatrixAt(i, dummy.matrix);
      ref.current!.setColorAt(i, new THREE.Color(tree.color).multiplyScalar(0.6));
    });
    ref.current.instanceMatrix.needsUpdate = true;
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
    ref.current.computeBoundingSphere();
  }, [trees]);
  return <instancedMesh ref={ref} args={[geometry, undefined, trees.length]} castShadow={castShadow} receiveShadow>
    <meshStandardMaterial roughness={1} />
  </instancedMesh>;
}

function Trees({
  track,
  step,
  castShadow
}: {
  track: TrackInfo;
  step: number;
  castShadow: boolean;
}) {
  const trees = useMemo(() => {
    const output: TreeInstance[] = [];
    const roadClearance = TRACK_WIDTH / 2 + 24;
    const colors = ["#9bbb78", "#789d60", "#a6c582", "#638c54"];

    for (let index = 0; index < track.samples.length; index += step) {
      const sample = track.samples[index];
      for (const side of [-1, 1]) {
        for (let row = 0; row < 2; row += 1) {
          const noise = Math.sin(index * 13.17 + row * 4.7 + side * 2.1) * 0.5 + 0.5;
          let distance = TRACK_WIDTH / 2 + 34 + row * 22 + noise * 16;
          let position = sample.center
            .clone()
            .addScaledVector(sample.normal, side * distance)
            .addScaledVector(sample.tangent, (noise - 0.5) * 8);

          for (let attempt = 0; attempt < 5; attempt += 1) {
            const nearest = nearestTrackSample(track, position);
            if (Math.abs(nearest.lateral) > roadClearance) {
              break;
            }

            distance += 12;
            position = sample.center
              .clone()
              .addScaledVector(sample.normal, side * distance)
              .addScaledVector(sample.tangent, (noise - 0.5) * 8);
          }

          if (Math.abs(nearestTrackSample(track, position).lateral) > roadClearance) {
            output.push({
              position,
              rotation: noise * Math.PI * 2,
              scale: 0.72 + noise * 0.64,
              color: colors[(index + row + (side > 0 ? 1 : 0)) % colors.length]
            });
          }
        }
      }
    }

    return output;
  }, [step, track]);

  return <InstancedForest castShadow={castShadow} trees={trees} />;
}

function Environment({ qualityConfig, track, quality }: { qualityConfig: QualityConfig; track: TrackInfo; quality: GraphicsQuality }) {
  const preset = qualityPresets[quality];
  const grassTexture = useMemo(() => makeGrassTexture(), []);
  useEffect(() => () => grassTexture.dispose(), [grassTexture]);

  return (
    <>
      <BenchmarkAtmosphere quality={quality} />
      {preset.enhancedEnvironment ? <GpuGround /> : <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
        <planeGeometry args={[1200, 1200]} />
        <meshStandardMaterial color="#ffffff" map={grassTexture} roughness={0.98} />
      </mesh>}
      <BenchmarkLandscape quality={quality} track={track} />
      <TrackSurface track={track} anisotropy={preset.anisotropy} />
      <RoadShoulders track={track} />
      <SpeedReferencePosts track={track} />
      <Barriers track={track} />
      {!qualityConfig.minimalDrawCalls && <CheckpointGates track={track} />}
      <RoadSigns track={track} />
      <TunnelAndBridge compact={qualityConfig.minimalDrawCalls} track={track} />
      {!preset.enhancedEnvironment && <Trees
        castShadow={false}
        step={qualityConfig.sceneryStep}
        track={track}
      />}
    </>
  );
}

export default function RaceScene({
  graphicsQuality,
  playerVehicle,
  resetSeed,
  onHudUpdate,
  onPerformanceUpdate
}: RaceSceneProps) {
  const track = useMemo(() => createTrack(), []);
  const qualityConfig = qualityPresets[graphicsQuality].effects;
  const keyboard = useKeyboard();
  const { camera, clock } = useThree();
  const autoRaceTest = import.meta.env.DEV && new URLSearchParams(window.location.search).has("autoRace");
  const gameRef = useRef<GameRuntime>(createGame(track, 0, autoRaceTest));
  const carRefs = useRef<(THREE.Group | null)[]>([]);
  const hudCallback = useRef(onHudUpdate);

  useEffect(() => {
    hudCallback.current = onHudUpdate;
  }, [onHudUpdate]);

  useEffect(() => {
    const game = createGame(track, clock.getElapsedTime(), autoRaceTest);
    gameRef.current = game;
    hudCallback.current(makeHud(game, clock.getElapsedTime()));
  }, [autoRaceTest, clock, resetSeed, track]);

  useFrame((state, frameDelta) => {
    const game = gameRef.current;
    const now = state.clock.getElapsedTime();
    const dt = Math.min(frameDelta, 0.033);

    if (game.phase === "countdown" && now >= game.raceStartedAt) {
      game.phase = "race";
      game.raceStartedAt = now;
    }

    const raceTime = Math.max(0, now - game.raceStartedAt);

    if (game.phase === "race") {
      if (autoRaceTest) {
        updateAi(track, game.cars[0], game.cars, dt, raceTime);
      } else {
        updatePlayer(track, game.cars[0], keyboard.current, dt, raceTime);
        emitPlayerEffects(game, game.cars[0], qualityConfig, raceTime);
      }

      for (let index = 1; index < game.cars.length; index += 1) {
        updateAi(track, game.cars[index], game.cars, dt, raceTime);
      }

      resolveCarCollisions(track, game.cars);

      if (game.cars.every((car) => car.finished)) {
        game.phase = "finished";
      }
    } else if (game.phase === "finished") {
      updatePlayer(track, game.cars[0], keyboard.current, dt, raceTime);
    }

    updateEffectPools(game, dt);

    game.cars.forEach((car, index) => {
      const group = carRefs.current[index];
      if (group) {
        group.position.copy(car.position);
        group.position.y += 0.08 + car.suspensionOffset;
        group.rotation.set(car.bodyPitch, car.heading, car.bodyRoll);
      }
    });

    updateCamera(camera, game.cars[0], dt);
    if (import.meta.env.DEV && new URLSearchParams(window.location.search).has("environmentInspect")) {
      const view = Number(window.location.hash.slice(1));
      if (Number.isFinite(view)) {
        const pose = sampleTrack(track, view);
        camera.position.copy(pose.center).addScaledVector(pose.tangent, -9).add(new THREE.Vector3(0, 5.3, 0));
        camera.lookAt(pose.center.clone().addScaledVector(pose.tangent, 36).add(new THREE.Vector3(0, 3, 0)));
      }
    }

    if (now - game.lastHudAt > 0.08 || game.phase === "finished") {
      game.lastHudAt = now;
      hudCallback.current(makeHud(game, now));
    }

    if (autoRaceTest) {
      const hud = makeHud(game, now);
      (window as RaceTestWindow).__raceTestState = {
        phase: game.phase,
        raceTime,
        finishedCount: game.cars.filter((car) => car.finished).length,
        totalCars: game.cars.length,
        results: hud.results,
        bestLapTime: hud.bestLapTime
      };
    }
  });

  return (
    <>
      <PerformanceProbe onUpdate={onPerformanceUpdate} />
      <Environment qualityConfig={qualityConfig} track={track} quality={graphicsQuality} />
      <VisualEffects gameRef={gameRef} qualityConfig={qualityConfig} />
      {gameRef.current.cars.map((car, index) => (
        <group
          key={car.name}
          scale={car.isPlayer ? 1.08 : 1}
          ref={(node) => {
            carRefs.current[index] = node;
          }}
        >
          {graphicsQuality === "performance" ? (
            <PerformanceCarModel
              brakeLightOn={car.isBraking}
              collisionFlash={car.collisionFlash}
              color={car.color}
            />
          ) : qualityPresets[graphicsQuality].importedPlayer && car.isPlayer ? (
            <Suspense fallback={<CarModel brakeLightOn={car.isBraking} collisionFlash={car.collisionFlash} color={car.color} />}>
              <HighQualityPlayerCar brakeLightOn={car.isBraking} vehicle={playerVehicle} />
            </Suspense>
          ) : (
            <CarModel brakeLightOn={car.isBraking} collisionFlash={car.collisionFlash} color={car.color} />
          )}
        </group>
      ))}
    </>
  );
}
