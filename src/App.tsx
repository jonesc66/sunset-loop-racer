import { createRaceTrack, type RaceTrack } from "./game/trackDefinition";
import "./trackSelection.css";
import { DEFAULT_TRACK_ID, getTrackDefinition, leaderboardStorageKey, trackRegistry } from "./game/trackRegistry";
import TrackMinimap from "./TrackMinimap";
import { Canvas, useFrame, useLoader } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import RaceScene from "./RaceScene";
import { assetUrl } from "./assetUrl";
import { qualityOrder, qualityPresets } from "./qualityPresets";
import { createRaceAudioEngine } from "./game/audio";
import {
  defaultHudState,
  type GraphicsQuality,
  type HudState,
  type PerformanceStats,
  type PlayerVehicle
} from "./game/types";

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const wholeSeconds = Math.floor(seconds % 60);
  const tenths = Math.floor((seconds % 1) * 10);
  return `${minutes}:${wholeSeconds.toString().padStart(2, "0")}.${tenths}`;
}

function formatOptionalTime(seconds: number | null) {
  return seconds === null ? "NONE" : formatTime(seconds);
}

type TimeRecord = {
  time: number;
  vehicle: PlayerVehicle;
  playerName: string;
  recordedAt: number;
};

type TimeLeaderboard = {
  race: TimeRecord[];
  lap: TimeRecord[];
};

type NewLeaderboardRecord = {
  kind: "race" | "lap";
  category: "Full race" | "Fastest lap";
  rank: number;
  time: number;
  playerName: string;
  recordedAt: number;
};

const emptyTimeLeaderboard = (): TimeLeaderboard => ({ race: [], lap: [] });

function loadTimeLeaderboard(storageKey: string): TimeLeaderboard {
  try {
    const stored = JSON.parse(window.localStorage.getItem(storageKey) ?? "null") as Partial<TimeLeaderboard> | null;
    const readEntries = (entries: unknown): TimeRecord[] =>
      Array.isArray(entries)
        ? entries
          .filter((entry): entry is TimeRecord =>
            typeof entry?.time === "number" && Number.isFinite(entry.time) && entry.time > 0 &&
            typeof entry?.recordedAt === "number" && typeof entry?.vehicle === "string"
          )
          .map((entry) => ({
            ...entry,
            playerName: typeof entry.playerName === "string" && entry.playerName.trim() ? entry.playerName.trim().slice(0, 24) : "Driver"
          }))
          .sort((a, b) => a.time - b.time)
          .slice(0, 5)
        : [];

    return { race: readEntries(stored?.race), lap: readEntries(stored?.lap) };
  } catch {
    return emptyTimeLeaderboard();
  }
}

function addTopTime(records: TimeRecord[], time: number, vehicle: PlayerVehicle, playerName: string) {
  const candidate: TimeRecord = { time, vehicle, playerName, recordedAt: Date.now() };
  const updated = [...records, candidate].sort((a, b) => a.time - b.time).slice(0, 5);
  const index = updated.indexOf(candidate);
  return { records: updated, rank: index === -1 ? null : index + 1, candidate };
}

const garageVehicleAssets: Record<PlayerVehicle, string> = {
  sportcar2: assetUrl("assets/sportcar2-cgtrader.glb"),
  sportcar1: assetUrl("assets/mercedes-amg-gt.glb"),
  sedan: assetUrl("assets/sedan-cgtrader.glb"),
  acuraNsx: assetUrl("assets/acura-nsx.glb"),
  corvetteC7: assetUrl("assets/corvette-c7-grand-sport.glb"),
  ferrariSf90: assetUrl("assets/ferrari-sf90.glb")
};

function applyGarageColorProfile(model: THREE.Object3D, vehicle: "corvetteC7" | "acuraNsx") {
  model.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const sourceMaterials = Array.isArray(child.material) ? child.material : [child.material];
    const materials = sourceMaterials.map((sourceMaterial) => {
      const material = sourceMaterial.clone();
      const name = material.name.toLowerCase();
      if (!(material instanceof THREE.MeshStandardMaterial)) return material;

      if (vehicle === "corvetteC7" && name.includes("admiral_blue")) {
        material.color.set("#4d8ee6");
        material.metalness = 0.62;
        material.roughness = 0.2;
        material.emissive.set("#102b58");
        material.emissiveIntensity = 0.34;
      } else if (vehicle === "corvetteC7" && (name === "metallic_black" || name === "black")) {
        material.color.set("#3e5870");
        material.metalness = 0.58;
        material.roughness = 0.24;
        material.emissive.set("#0d1d2c");
        material.emissiveIntensity = 0.3;
      } else if (vehicle === "corvetteC7" && (name.includes("metallic_white") || name.includes("grand_sport"))) {
        material.color.set("#e5edf7");
        material.metalness = 0.48;
        material.roughness = 0.22;
      } else if (vehicle === "corvetteC7" && name.includes("glass_dark")) {
        material.color.set("#263746");
        material.roughness = 0.16;
      } else if (vehicle === "acuraNsx" && (name === "body" || name === "sidemirror")) {
        material.color.set("#c92c24");
        material.metalness = 0.64;
        material.roughness = 0.18;
        material.emissive.set("#310705");
        material.emissiveIntensity = 0.24;
      } else if (vehicle === "acuraNsx" && name.includes("glass")) {
        material.color.set("#18242d");
        material.metalness = 0.15;
        material.roughness = 0.12;
      } else if (vehicle === "acuraNsx" && (name === "chrome" || name === "rims")) {
        material.color.set("#bec5cc");
        material.metalness = 0.86;
        material.roughness = 0.2;
      } else if (vehicle === "acuraNsx" && (name.includes("headlight") || name === "taillight")) {
        material.color.set("#fff0d7");
        material.emissive.set(name === "taillight" ? "#ff1827" : "#fff0d5");
        material.emissiveIntensity = name === "taillight" ? 1.15 : 0.65;
      }
      return material;
    });
    child.material = Array.isArray(child.material) ? materials : materials[0];
  });
}

function GaragePreviewModel({ vehicle }: { vehicle: PlayerVehicle }) {
  const group = useRef<THREE.Group>(null);
  const gltf = useLoader(GLTFLoader, garageVehicleAssets[vehicle]);
  const model = useMemo(() => {
    const previewModel = gltf.scene.clone(true);
    if (vehicle === "corvetteC7" || vehicle === "acuraNsx") applyGarageColorProfile(previewModel, vehicle);
    return previewModel;
  }, [gltf.scene, vehicle]);
  const fit = useMemo(() => {
    const bounds = new THREE.Box3().setFromObject(model);
    const size = bounds.getSize(new THREE.Vector3());
    const scale = 3.6 / Math.max(size.x, size.y, size.z, 0.001);
    return { scale, x: -bounds.getCenter(new THREE.Vector3()).x * scale, y: -bounds.min.y * scale, z: -bounds.getCenter(new THREE.Vector3()).z * scale };
  }, [model]);

  useFrame((_, delta) => {
    if (group.current) group.current.rotation.y += delta * 0.65;
  });

  return (
    <group ref={group} rotation={[0, Math.PI * 0.25, 0]}>
      <primitive object={model} position={[fit.x, fit.y, fit.z]} scale={fit.scale} />
    </group>
  );
}

function GaragePreview({ vehicle }: { vehicle: PlayerVehicle }) {
  return (
    <div className="garagePreview" aria-label={`${vehicle} rotating vehicle preview`}>
      <Canvas camera={{ fov: 42, position: [0, 2.1, 7] }} dpr={[0.75, 1]}>
        <color attach="background" args={["#0b1519"]} />
        <ambientLight intensity={1.45} />
        <directionalLight position={[5, 7, 4]} intensity={2.8} />
        <directionalLight position={[-5, 2, -4]} intensity={1.2} color="#8ac7ff" />
        <Suspense fallback={null}><GaragePreviewModel vehicle={vehicle} /></Suspense>
      </Canvas>
    </div>
  );
}

function Hud({
  track,
  hud,
  graphicsQuality,
  leaderboard,
  newRecords,
  recordSaveFailed,
  soundEnabled,
  onGraphicsQualityChange,
  onSoundToggle,
  onChangeCar,
  onChangeTrack,
  onRestart
}: {
  track: RaceTrack;
  hud: HudState;
  graphicsQuality: GraphicsQuality;
  leaderboard: TimeLeaderboard;
  newRecords: NewLeaderboardRecord[];
  recordSaveFailed: boolean;
  soundEnabled: boolean;
  onGraphicsQualityChange: (quality: GraphicsQuality) => void;
  onSoundToggle: () => void;
  onChangeCar: () => void;
  onChangeTrack: () => void;
  onRestart: () => void;
}) {
  const [positionNotice, setPositionNotice] = useState<{ from: number; to: number; id: number } | null>(null);
  const [lapNotice, setLapNotice] = useState<{ lap: number; time: number; delta: number | null; best: boolean; final: boolean } | null>(null);
  const previousPosition = useRef(hud.position);
  const completedLaps = useRef(0);
  const personalBest = useRef(leaderboard.lap[0]?.time ?? null);
  const noticeId = useRef(0);
  const playerResult = hud.results.find(row => row.isPlayer);
  const isFinalLap = hud.lap === hud.totalLaps && hud.phase === "race";
  const showGo = hud.phase === "race" && hud.countdownText === "GO!";
  const speedRatio = Math.min(hud.speedKmh / 220, 1);
  const drivingState = hud.offRoad ? "OFF ROAD" : hud.drifting > 0.4 ? "DRIFT" : hud.braking ? "BRAKING" : hud.accelerating ? "ACCELERATING" : "COASTING";

  useEffect(() => {
    if (hud.phase === "countdown") {
      previousPosition.current = hud.position;
      completedLaps.current = 0;
      personalBest.current = leaderboard.lap[0]?.time ?? null;
      setPositionNotice(null);
      setLapNotice(null);
      return;
    }
    if (hud.phase !== "race") return;
    if (hud.position !== previousPosition.current) {
      if (hud.timer > 2) setPositionNotice({ from: previousPosition.current, to: hud.position, id: ++noticeId.current });
      previousPosition.current = hud.position;
    }
    if (hud.lapTimes.length > completedLaps.current) {
      const latestIndex = hud.lapTimes.length - 1;
      const time = hud.lapTimes[latestIndex];
      const priorTimes = hud.lapTimes.slice(0, latestIndex);
      const reference = Math.min(personalBest.current ?? Infinity, ...priorTimes);
      setLapNotice({ lap: latestIndex + 1, time, delta: Number.isFinite(reference) ? time - reference : null, best: time < reference, final: hud.lap === hud.totalLaps });
      completedLaps.current = hud.lapTimes.length;
    }
  }, [hud.phase, hud.position, hud.timer, hud.lap, hud.lapTimes, hud.totalLaps, leaderboard.lap]);

  useEffect(() => {
    if (!positionNotice) return;
    const timeout = window.setTimeout(() => setPositionNotice(null), 1900);
    return () => window.clearTimeout(timeout);
  }, [positionNotice]);

  useEffect(() => {
    if (!lapNotice) return;
    const timeout = window.setTimeout(() => setLapNotice(null), 3200);
    return () => window.clearTimeout(timeout);
  }, [lapNotice]);

  return (
    <div className={`hudLayer phase-${hud.phase}`} data-race-phase={hud.phase}>
      <TrackMinimap definition={track.definition} cars={hud.mapCars} />
      <section className="hudTop" aria-label="Race telemetry">
        <div className="hudTile positionTile">
          <span>Position</span>
          <strong>{hud.position}<em> / {hud.totalCars}</em></strong>
          <small>{hud.position === 1 ? "Leading the field" : "Race for the line"}</small>
        </div>
        <div className={`hudTile lapTile ${isFinalLap ? "finalLapTile" : ""}`}>
          <span>{isFinalLap ? "Final lap" : "Lap"}</span>
          <strong>{hud.lap}<em> / {hud.totalLaps}</em></strong>
          <small>CP {hud.checkpoint}/{hud.checkpointTotal}</small>
        </div>
        <div className="hudTile timeTile">
          <span>Race time</span>
          <strong>{formatTime(hud.timer)}</strong>
          <small>Lap {formatTime(hud.currentLapTime)}</small>
        </div>
        <div className="hudTile bestTile">
          <span>Best lap</span>
          <strong>{formatOptionalTime(hud.bestLapTime)}</strong>
          <small>{hud.bestLapTime === null ? "Set your pace" : "This race"}</small>
        </div>
      </section>

      <section className={`speedGauge ${hud.offRoad ? "surfaceWarning" : ""}`} aria-label="Speed and driving feedback">
        <div className="drivingState">{drivingState}</div>
        <div className="speedReadout"><strong>{hud.speedKmh}</strong><span>KM/H</span></div>
        <div className="speedMeter" aria-hidden="true"><i style={{ transform: `scaleX(${speedRatio})` }} /></div>
      </section>
      <section className="controlsHint"><span>W/S</span> accelerate/brake <span>A/D</span> steer <span>Space</span> handbrake <span>R</span> reset</section>
      <section className="graphicsControls" aria-label="Graphics quality">
        <button className={soundEnabled ? "activeQuality" : ""} type="button" aria-pressed={soundEnabled} aria-label={soundEnabled ? "Mute sound" : "Enable sound"} onClick={onSoundToggle}>Sound {soundEnabled ? "on" : "off"}</button>
        {qualityOrder.map(quality => <button className={quality === graphicsQuality ? "activeQuality" : ""} key={quality} type="button" aria-pressed={quality === graphicsQuality} onClick={() => onGraphicsQualityChange(quality)}>{quality === "performance" ? "perf" : quality}</button>)}
      </section>

      {hud.phase === "countdown" && <div className="startPresentation" aria-live="polite">
        <p>{track.definition.displayName}</p>
        <div className="startLights" aria-hidden="true">{[3, 2, 1].map(light => <i className={Number(hud.countdownText) <= light ? "lit" : ""} key={light} />)}</div>
        <div className="countdown" key={hud.countdownText}>{hud.countdownText}</div>
        <span>{hud.totalLaps} LAPS · {hud.totalCars} DRIVERS · GET READY</span>
      </div>}
      {showGo && <div className="goPresentation" role="status">GO!</div>}

      {hud.phase === "race" && <div className="raceNotices" aria-live="polite" aria-atomic="true">
        {lapNotice && <div className={`lapNotice ${lapNotice.best ? "personalBestNotice" : ""}`} key={`lap-${lapNotice.lap}`}>
          <strong>{lapNotice.final ? "FINAL LAP" : lapNotice.best ? "BEST LAP" : `LAP ${lapNotice.lap} COMPLETE`}</strong>
          <span>{lapNotice.final && lapNotice.best ? "BEST LAP · " : `LAP ${lapNotice.lap} · `}{formatTime(lapNotice.time)}{lapNotice.delta !== null && <b className={lapNotice.delta < 0 ? "fasterSplit" : "slowerSplit"}>{lapNotice.delta < 0 ? "−" : "+"}{Math.abs(lapNotice.delta).toFixed(2)}s</b>}</span>
        </div>}
        {positionNotice && <div className={`positionNotice ${positionNotice.to < positionNotice.from ? "positionGain" : "positionLoss"}`} key={positionNotice.id}>
          <span>{positionNotice.to < positionNotice.from ? "OVERTAKE" : "POSITION"}</span><strong>{positionNotice.from} → {positionNotice.to}</strong>
        </div>}
      </div>}

      {hud.phase === "finishing" && <section className="finishPresentation" aria-label="Finish presentation" role="status">
        <div className="finishFlag" aria-hidden="true" />
        <span>{playerResult?.place === 1 ? "RACE WINNER" : "CHEQUERED FLAG"}</span>
        <h1>FINISH</h1>
        <p><strong>P{playerResult?.place ?? hud.position}</strong> / {hud.totalCars}<i />{formatTime(playerResult?.time ?? hud.timer)}</p>
      </section>}

      {hud.phase === "finished" && <div className="resultsBackdrop"><section className="resultsPanel" aria-label="Race results">
        <header className="resultHeader">
          <div><p className="resultEyebrow">{playerResult?.place === 1 ? "VICTORY" : "RACE COMPLETE"}</p><h1>{playerResult?.place === 1 ? "You take the win." : "Across the line."}</h1><p className="resultTrackName">{track.definition.displayName} · {track.lapCount} laps</p></div>
          <div className="resultPosition"><span>FINISHED</span><strong>P{playerResult?.place ?? hud.position}</strong><small>OF {hud.totalCars}</small></div>
        </header>
        <div className="resultStats"><div><span>Race time</span><strong>{formatOptionalTime(playerResult?.time ?? null)}</strong></div><div><span>Best lap</span><strong>{formatOptionalTime(playerResult?.bestLapTime ?? hud.bestLapTime)}</strong></div><div><span>Driver</span><strong>{playerResult?.name ?? "Driver"}</strong></div></div>
        {newRecords.length > 0 && <section className="newRecordNotice" aria-label="New top five record">
          <strong>{newRecords.some(record => record.rank === 1) ? "NEW PERSONAL BEST" : "NEW TOP 5 RECORD"}</strong>
          <div>{newRecords.map(record => <span key={record.category}>{record.category} · #{record.rank} · {formatTime(record.time)}</span>)}</div>
          {recordSaveFailed && <small>Storage unavailable — this result is visible for this session only.</small>}
        </section>}
        <section className="lapBreakdown" aria-label="Your lap times">{hud.lapTimes.map((time, index) => <div className={time === hud.bestLapTime ? "bestLapSplit" : ""} key={index}><span>LAP {index + 1}{time === hud.bestLapTime && <b>BEST</b>}</span><strong>{formatTime(time)}</strong></div>)}</section>
        <div className="resultDetails">
          <section className="classification" aria-label="Final ranking"><h2>Race classification</h2><div className="resultsList">{hud.results.map(row => <div className={`${row.isPlayer ? "resultRow playerResult" : "resultRow"}${row.place === 1 ? " winnerResult" : ""}`} key={row.name}>
            <span className="place">{row.place}</span><span className="carSwatch" style={{ background: row.color }} /><span className="driverName">{row.name}{row.isPlayer && <small>YOU</small>}</span><span className="resultTime">{row.finished && row.time !== null ? formatTime(row.time) : "Racing"}<small>Best {formatOptionalTime(row.bestLapTime)}</small></span>
          </div>)}</div></section>
          <section className="timeLeaderboard" aria-label="Personal top five times"><h2>Personal Top 5</h2><div className="timeLeaderboardColumns">{(["race", "lap"] as const).map(kind => <div key={kind}><h3>{kind === "race" ? "Full race" : "Fastest lap"}</h3><ol>{leaderboard[kind].length > 0 ? leaderboard[kind].map((record, index) => <li className={newRecords.some(newRecord => newRecord.kind === kind && newRecord.recordedAt === record.recordedAt && newRecord.time === record.time) ? "newTopTime" : ""} key={`${record.recordedAt}-${record.time}`}><b>{index + 1}</b><span className="timeRecordName">{record.playerName}</span><span>{formatTime(record.time)}</span></li>) : <li className="noRecords">No records yet</li>}</ol></div>)}</div></section>
        </div>
        <div className="resultNavigation" aria-label="Next race"><button type="button" onClick={onRestart}>Race Again</button><button type="button" onClick={onChangeCar}>Change Car</button><button type="button" onClick={onChangeTrack}>Change Track</button></div>
      </section></div>}
    </div>
  );
}

function TrackSelection({ selectedTrackId, onSelect, onContinue, onBack }: { selectedTrackId: string; onSelect: (id: string) => void; onContinue: () => void; onBack: () => void }) {
  const selected = getTrackDefinition(selectedTrackId);
  const records = loadTimeLeaderboard(leaderboardStorageKey(selected, selected.defaultLapCount));
  return <section className="trackSelection" aria-label="Choose a track">
    <div className="trackSelectionContent">
      <p className="selectionStep">01 / TRACK · 02 / CAR · 03 / RACE</p>
      <h1>Choose Your Track</h1>
      <div className="trackCards">{[...trackRegistry.values()].map(track => <button type="button" key={track.id} data-track-id={track.id} aria-pressed={selectedTrackId === track.id} className="trackCard" onClick={() => onSelect(track.id)}>
        <strong>{track.displayName}</strong><span>{track.description}</span>
        <small>{track.defaultLapCount} laps · {track.route.length.toFixed(2)} world units</small>
        <b>{selectedTrackId === track.id ? "Selected" : "Available — select track"}</b>
      </button>)}</div>
      <section className="trackSelectionLeaderboard" aria-label={selected.displayName + " Personal Top 5"}>
        <h2>{selected.displayName} · Personal Top 5</h2>
        <div className="timeLeaderboardColumns">{(["race", "lap"] as const).map(kind => <div key={kind}><h3>{kind === "race" ? "Full race" : "Fastest lap"}</h3>
          {records[kind].length ? <ol>{records[kind].map(r => <li key={r.recordedAt + "-" + r.time}><span>{r.playerName}</span><strong>{formatTime(r.time)}</strong></li>)}</ol> : <p>No records yet</p>}
        </div>)}</div>
      </section>
      <div className="trackNavigation">
        <button className="trackContinue" type="button" onClick={onContinue}>Continue to Car Select</button>
        <button className="selectionBack" type="button" onClick={onBack}>Back to Main Menu</button>
      </div>
    </div>
  </section>;
}

function VehicleGarage({
  trackName,
  onBack,
  onStart,
  onPlayerNameChange,
  onVehicleChange,
  playerName,
  playerVehicle
}: {
  trackName: string;
  onBack: () => void;
  onStart: () => void;
  onPlayerNameChange: (name: string) => void;
  onVehicleChange: (vehicle: PlayerVehicle) => void;
  playerName: string;
  playerVehicle: PlayerVehicle;
}) {
  const vehicles: Array<{ id: PlayerVehicle; name: string; detail: string; accent: string }> = [
    { id: "sportcar2", name: "Porsche 718 Cayman S", detail: "2017 sports coupe", accent: "#e0b13d" },
    { id: "sportcar1", name: "Mercedes-AMG GT", detail: "sports coupe", accent: "#7e74d8" },
    { id: "sedan", name: "BMW M2 Coupé", detail: "2017 performance coupe", accent: "#4b93dc" },
    { id: "acuraNsx", name: "Honda Acura NSX", detail: "hybrid supercar", accent: "#d7443e" },
    { id: "corvetteC7", name: "Chevrolet Corvette Grand Sport", detail: "C7 sports car", accent: "#e2e4e8" },
    { id: "ferrariSf90", name: "Ferrari SF90 Stradale", detail: "plug-in hybrid supercar", accent: "#e33c32" }
  ];

  return (
    <section className="vehicleGarage" style={{ backgroundImage: `url("${assetUrl("assets/bern-alpine-panorama-v2.png")}")` }} aria-label="Choose a car">
      <div className="garageHeading">
        <span>{trackName} · Car Select</span>
        <h1>Choose Your Car</h1>
      </div>
      <label className="playerNameField">
        <span>Driver name</span>
        <input maxLength={24} onChange={(event) => onPlayerNameChange(event.target.value)} placeholder="Enter your name" type="text" value={playerName} />
      </label>
      <GaragePreview vehicle={playerVehicle} />
      <div className="garageVehicles">
        {vehicles.map((vehicle) => (
          <button
            className={playerVehicle === vehicle.id ? "garageVehicle selectedVehicle" : "garageVehicle"}
            key={vehicle.id}
            onClick={() => onVehicleChange(vehicle.id)}
            type="button"
          >
            <span className="garageVehicleMark" style={{ background: vehicle.accent }} />
            <strong>{vehicle.name}</strong>
            <small>{vehicle.detail}</small>
          </button>
        ))}
      </div>
      <button className="backToTracks" type="button" onClick={onBack}>Back to Track Select</button>
      <button className="startRaceButton" onClick={onStart} type="button">
        Start Race
      </button>
    </section>
  );
}

export default function App() {
  const [selectedTrackId, setSelectedTrackId] = useState(DEFAULT_TRACK_ID);
  const [selectionScreen, setSelectionScreen] = useState<"start" | "track" | "car" | "race">("start");
  const [activeTrack, setActiveTrack] = useState(() => createRaceTrack(getTrackDefinition(selectedTrackId)));
  const storageKey = leaderboardStorageKey(activeTrack.definition, activeTrack.lapCount);
  const [hud, setHud] = useState<HudState>(defaultHudState);
  const [resetSeed, setResetSeed] = useState(0);
  const [graphicsQuality, setGraphicsQuality] = useState<GraphicsQuality>("high");
  const [selectedCarId, setSelectedCarId] = useState<PlayerVehicle>("sportcar2");
  const [playerName, setPlayerName] = useState("Driver");
  const raceStarted = selectionScreen === "race";
  const [performanceStats, setPerformanceStats] = useState<PerformanceStats | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [leaderboard, setLeaderboard] = useState<TimeLeaderboard>(() => loadTimeLeaderboard(storageKey));
  const [newRecords, setNewRecords] = useState<NewLeaderboardRecord[]>([]);
  const [recordSaveFailed, setRecordSaveFailed] = useState(false);
  const shellRef = useRef<HTMLElement | null>(null);
  const keyboardCaptureRef = useRef<HTMLInputElement | null>(null);
  const audioRef = useRef<ReturnType<typeof createRaceAudioEngine> | null>(null);
  const finishedRaceHandledRef = useRef(false);

  useEffect(() => {
    audioRef.current = createRaceAudioEngine();

    return () => {
      audioRef.current?.dispose();
      audioRef.current = null;
    };
  }, []);

  useEffect(() => {
    audioRef.current?.setEnabled(soundEnabled);
  }, [soundEnabled]);

  useEffect(() => {
    audioRef.current?.setActive(raceStarted);
    audioRef.current?.update(hud);
  }, [hud, raceStarted]);

  useEffect(() => {
    if (hud.phase !== "finished") {
      if (finishedRaceHandledRef.current) {
        finishedRaceHandledRef.current = false;
        setNewRecords([]);
      }
      return;
    }
    if (finishedRaceHandledRef.current) return;

    const playerResult = hud.results.find((row) => row.isPlayer);
    if (!playerResult?.finished || playerResult.time === null) return;
    finishedRaceHandledRef.current = true;

    const recordPlayerName = playerName.trim().slice(0, 24) || "Driver";
    // Re-read this identity at commit time, preserving records saved since race start.
    const currentLeaderboard = loadTimeLeaderboard(storageKey);
    const race = addTopTime(currentLeaderboard.race, playerResult.time, selectedCarId, recordPlayerName);
    const lap = playerResult.bestLapTime === null
      ? { records: currentLeaderboard.lap, rank: null, candidate: null }
      : addTopTime(currentLeaderboard.lap, playerResult.bestLapTime, selectedCarId, recordPlayerName);
    const nextLeaderboard = { race: race.records, lap: lap.records };
    const nextRecords: NewLeaderboardRecord[] = [];
    if (race.rank !== null) nextRecords.push({ kind: "race", category: "Full race", rank: race.rank, time: playerResult.time, playerName: recordPlayerName, recordedAt: race.candidate.recordedAt });
    if (lap.rank !== null && playerResult.bestLapTime !== null && lap.candidate !== null) {
      nextRecords.push({ kind: "lap", category: "Fastest lap", rank: lap.rank, time: playerResult.bestLapTime, playerName: recordPlayerName, recordedAt: lap.candidate.recordedAt });
    }

    setLeaderboard(nextLeaderboard);
    setNewRecords(nextRecords);
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(nextLeaderboard));
      setRecordSaveFailed(false);
    } catch {
      setRecordSaveFailed(true);
      // Preserve the result for this session when persistent storage is unavailable.
    }
  }, [hud.phase, hud.results, leaderboard, playerName, selectedCarId, storageKey]);

  useEffect(() => {
    if (raceStarted) keyboardCaptureRef.current?.focus({ preventScroll: true });

    const focusGame = (event: KeyboardEvent) => {
      const target = event.target;
      const activeElement = document.activeElement;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable) ||
        activeElement instanceof HTMLInputElement ||
        activeElement instanceof HTMLTextAreaElement ||
        activeElement instanceof HTMLSelectElement ||
        (activeElement instanceof HTMLElement && activeElement.isContentEditable)
      ) {
        return;
      }
      if (
        event.code === "KeyW" ||
        event.code === "KeyA" ||
        event.code === "KeyS" ||
        event.code === "KeyD" ||
        event.code === "ArrowUp" ||
        event.code === "ArrowLeft" ||
        event.code === "ArrowDown" ||
        event.code === "ArrowRight" ||
        event.code === "Space"
      ) {
        if (raceStarted) keyboardCaptureRef.current?.focus({ preventScroll: true });
      }
    };

    window.addEventListener("keydown", focusGame, { capture: true });

    return () => {
      window.removeEventListener("keydown", focusGame, { capture: true });
    };
  }, [raceStarted]);

  function startRace() {
    const definition = getTrackDefinition(selectedTrackId);
    // Race Again resets GameRuntime via resetSeed; retain immutable geometry configuration.
    const nextTrack = activeTrack.definition === definition && activeTrack.lapCount === definition.defaultLapCount
      ? activeTrack
      : createRaceTrack(definition);
    setActiveTrack(nextTrack);
    setLeaderboard(loadTimeLeaderboard(leaderboardStorageKey(nextTrack.definition, nextTrack.lapCount)));
    finishedRaceHandledRef.current = false;
    setNewRecords([]);
    setRecordSaveFailed(false);
    setPerformanceStats(null);
    setHud({ ...defaultHudState, totalLaps: nextTrack.lapCount, checkpointTotal: nextTrack.checkpointTargets.length });
    setResetSeed(seed => seed + 1);
    setSelectionScreen("race");
  }

  function leaveRace(destination: "track" | "car") {
    // Unmount the scene and discard transient race/results before another selection.
    setHud({ ...defaultHudState, totalLaps: activeTrack.lapCount, checkpointTotal: activeTrack.checkpointTargets.length });
    setNewRecords([]);
    setPerformanceStats(null);
    finishedRaceHandledRef.current = false;
    setSelectedTrackId(activeTrack.definition.id);
    setSelectionScreen(destination);
  }

  return (
    <main
      className="gameShell"
      onPointerDown={() => { if (raceStarted) keyboardCaptureRef.current?.focus({ preventScroll: true }); }}
      onClick={() => { if (raceStarted) keyboardCaptureRef.current?.focus({ preventScroll: true }); }}
      ref={shellRef}
      tabIndex={-1}
    >
      {raceStarted && <input className="raceKeyboardCapture" data-race-controls="true" readOnly inputMode="none" tabIndex={-1} aria-label="Race keyboard controls" ref={keyboardCaptureRef} />}
      <Canvas
        camera={{ fov: 58, near: 0.1, far: 500, position: [0, 12, -25] }}
        dpr={qualityPresets[graphicsQuality].dpr}
        gl={{
          antialias: qualityPresets[graphicsQuality].antialias,
          powerPreference: "high-performance",
          preserveDrawingBuffer: false,
          stencil: false
        }}
        shadows={qualityPresets[graphicsQuality].shadows ? "soft" : false}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.04;
        }}
      >
        {raceStarted && (
          <RaceScene
            key={`${activeTrack.definition.id}:${activeTrack.definition.timingVersion}:${activeTrack.lapCount}`}
            track={activeTrack}
            graphicsQuality={graphicsQuality}
            playerVehicle={selectedCarId}
            resetSeed={resetSeed}
            onHudUpdate={setHud}
            onPerformanceUpdate={setPerformanceStats}
          />
        )}
      </Canvas>
      {raceStarted ? (
        <Hud
          track={activeTrack}
          graphicsQuality={graphicsQuality}
          hud={hud}
          leaderboard={leaderboard}
          newRecords={newRecords}
          recordSaveFailed={recordSaveFailed}
          onGraphicsQualityChange={setGraphicsQuality}
          onSoundToggle={() => setSoundEnabled((enabled) => !enabled)}
          onRestart={startRace}
          onChangeCar={() => leaveRace("car")}
          onChangeTrack={() => leaveRace("track")}
          soundEnabled={soundEnabled}
        />
      ) : (
        selectionScreen === "start" ? <section className="trackSelection" aria-label="Main menu"><div className="trackSelectionContent startMenu"><p>Sunset Loop Racer</p><h1>Two circuits. Your line.</h1><button type="button" className="trackContinue" onClick={() => setSelectionScreen("track")}>Start Game</button></div></section>
        : selectionScreen === "track" ? <TrackSelection selectedTrackId={selectedTrackId} onSelect={setSelectedTrackId} onContinue={() => setSelectionScreen("car")} onBack={() => setSelectionScreen("start")} />
        : <VehicleGarage
          trackName={getTrackDefinition(selectedTrackId).displayName}
          onBack={() => setSelectionScreen("track")}

          onStart={startRace}
          onPlayerNameChange={setPlayerName}
          onVehicleChange={setSelectedCarId}
          playerName={playerName}
          playerVehicle={selectedCarId}
        />
      )}
      {raceStarted && hud.phase !== "finished" && performanceStats && (
        <aside className="performancePanel" aria-label="Rendering performance">
          <strong className={performanceStats.fps < 28 ? "performanceWarning" : ""}>
            {performanceStats.fps} FPS
          </strong>
          <span>{performanceStats.hardwareAccelerated ? "GPU" : "SOFTWARE"}</span>
          <small title={performanceStats.renderer}>{performanceStats.renderer}</small>
          <small>
            {performanceStats.drawCalls} calls | {Math.round(performanceStats.triangles / 1000)}k triangles
          </small>
        </aside>
      )}
    </main>
  );
}
