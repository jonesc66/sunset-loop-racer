import { Canvas, useFrame, useLoader } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import RaceScene from "./RaceScene";
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

const TIME_LEADERBOARD_STORAGE_KEY = "bern-circuit-time-leaderboard-v1";
const emptyTimeLeaderboard = (): TimeLeaderboard => ({ race: [], lap: [] });

function loadTimeLeaderboard(): TimeLeaderboard {
  try {
    const stored = JSON.parse(window.localStorage.getItem(TIME_LEADERBOARD_STORAGE_KEY) ?? "null") as Partial<TimeLeaderboard> | null;
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
  sportcar2: "/assets/sportcar2-cgtrader.glb",
  sportcar1: "/assets/mercedes-amg-gt.glb",
  sedan: "/assets/sedan-cgtrader.glb",
  acuraNsx: "/assets/acura-nsx.glb",
  corvetteC7: "/assets/corvette-c7-grand-sport.glb",
  ferrariSf90: "/assets/ferrari-sf90.glb"
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
  hud,
  graphicsQuality,
  leaderboard,
  newRecords,
  soundEnabled,
  onGraphicsQualityChange,
  onSoundToggle,
  onRestart
}: {
  hud: HudState;
  graphicsQuality: GraphicsQuality;
  leaderboard: TimeLeaderboard;
  newRecords: NewLeaderboardRecord[];
  soundEnabled: boolean;
  onGraphicsQualityChange: (quality: GraphicsQuality) => void;
  onSoundToggle: () => void;
  onRestart: () => void;
}) {
  const qualityOptions: GraphicsQuality[] = ["performance", "low", "medium", "high"];

  return (
    <div className="hudLayer">
      <section className="hudTop">
        <div className="hudTile">
          <span>Speed</span>
          <strong>{hud.speedKmh}</strong>
          <small>km/h</small>
        </div>
        <div className="hudTile">
          <span>Lap</span>
          <strong>
            {hud.lap}/{hud.totalLaps}
          </strong>
          <small>
            CP {hud.checkpoint}/{hud.checkpointTotal}
          </small>
        </div>
        <div className="hudTile">
          <span>Time</span>
          <strong>{formatTime(hud.timer)}</strong>
          <small>
            Position {hud.position}/{hud.totalCars}
          </small>
        </div>
        <div className="hudTile">
          <span>Best</span>
          <strong>{formatOptionalTime(hud.bestLapTime)}</strong>
          <small>lap time</small>
        </div>
      </section>

      <section className="controlsHint">
        <span>W/S</span> accelerate/brake
        <span>A/D</span> steer
        <span>Space</span> handbrake
        <span>R</span> reset
      </section>

      <section className="graphicsControls" aria-label="Graphics quality">
        <button
          className={soundEnabled ? "activeQuality" : ""}
          type="button"
          onClick={onSoundToggle}
        >
          Sound
        </button>
        {qualityOptions.map((quality) => (
          <button
            className={quality === graphicsQuality ? "activeQuality" : ""}
            key={quality}
            type="button"
            onClick={() => onGraphicsQualityChange(quality)}
          >
            {quality === "performance" ? "perf" : quality}
          </button>
        ))}
      </section>

      {hud.phase === "countdown" && <div className="countdown">{hud.countdownText}</div>}

      {hud.phase === "finished" && (
        <section className="resultsPanel" aria-label="Race results">
          <h1>Race Complete</h1>
          {newRecords.length > 0 && (
            <section className="newRecordNotice" aria-label="New top five record">
              <strong>NEW TOP 5 RECORD{newRecords.length > 1 ? "S" : ""}</strong>
              {newRecords.map((record) => (
                <span key={record.category}>{record.playerName} · {record.category} · #{record.rank} · {formatTime(record.time)}</span>
              ))}
            </section>
          )}
          <div className="resultsList">
            {hud.results.map((row) => (
              <div className={row.isPlayer ? "resultRow playerResult" : "resultRow"} key={row.name}>
                <span className="place">{row.place}</span>
                <span className="carSwatch" style={{ background: row.color }} />
                <span className="driverName">{row.name}</span>
                <span className="resultTime">
                  {row.finished && row.time !== null
                    ? `${formatTime(row.time)} / ${formatOptionalTime(row.bestLapTime)}`
                    : `Best ${formatOptionalTime(row.bestLapTime)}`}
                </span>
              </div>
            ))}
          </div>
          <section className="timeLeaderboard" aria-label="Personal top five times">
            <h2>Personal Top 5</h2>
            <div className="timeLeaderboardColumns">
              <div>
                <h3>Full race</h3>
                <ol>
                  {leaderboard.race.length > 0 ? leaderboard.race.map((record) => (
                    <li className={newRecords.some((newRecord) => newRecord.kind === "race" && newRecord.recordedAt === record.recordedAt) ? "newTopTime" : ""} key={`${record.recordedAt}-${record.time}`}>
                      <span className="timeRecordName">{record.playerName}</span>
                      <span>{formatTime(record.time)}</span>
                    </li>
                  )) : <li>—</li>}
                </ol>
              </div>
              <div>
                <h3>Fastest lap</h3>
                <ol>
                  {leaderboard.lap.length > 0 ? leaderboard.lap.map((record) => (
                    <li className={newRecords.some((newRecord) => newRecord.kind === "lap" && newRecord.recordedAt === record.recordedAt) ? "newTopTime" : ""} key={`${record.recordedAt}-${record.time}`}>
                      <span className="timeRecordName">{record.playerName}</span>
                      <span>{formatTime(record.time)}</span>
                    </li>
                  )) : <li>—</li>}
                </ol>
              </div>
            </div>
          </section>
          <button type="button" onClick={onRestart}>
            Race Again
          </button>
        </section>
      )}
    </div>
  );
}

function VehicleGarage({
  onStart,
  onPlayerNameChange,
  onVehicleChange,
  playerName,
  playerVehicle
}: {
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
    <section className="vehicleGarage" aria-label="Choose a car">
      <div className="garageHeading">
        <span>Bern Circuit</span>
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
      <button className="startRaceButton" onClick={onStart} type="button">
        Start Race
      </button>
    </section>
  );
}

export default function App() {
  const [hud, setHud] = useState<HudState>(defaultHudState);
  const [resetSeed, setResetSeed] = useState(0);
  const [graphicsQuality, setGraphicsQuality] = useState<GraphicsQuality>("high");
  const [playerVehicle, setPlayerVehicle] = useState<PlayerVehicle>("sportcar2");
  const [playerName, setPlayerName] = useState("Driver");
  const [raceStarted, setRaceStarted] = useState(false);
  const [performanceStats, setPerformanceStats] = useState<PerformanceStats | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [leaderboard, setLeaderboard] = useState<TimeLeaderboard>(loadTimeLeaderboard);
  const [newRecords, setNewRecords] = useState<NewLeaderboardRecord[]>([]);
  const shellRef = useRef<HTMLElement | null>(null);
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
    audioRef.current?.update(hud);
  }, [hud]);

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
    const race = addTopTime(leaderboard.race, playerResult.time, playerVehicle, recordPlayerName);
    const lap = playerResult.bestLapTime === null
      ? { records: leaderboard.lap, rank: null, candidate: null }
      : addTopTime(leaderboard.lap, playerResult.bestLapTime, playerVehicle, recordPlayerName);
    const nextLeaderboard = { race: race.records, lap: lap.records };
    const nextRecords: NewLeaderboardRecord[] = [];
    if (race.rank !== null) nextRecords.push({ kind: "race", category: "Full race", rank: race.rank, time: playerResult.time, playerName: recordPlayerName, recordedAt: race.candidate.recordedAt });
    if (lap.rank !== null && playerResult.bestLapTime !== null && lap.candidate !== null) {
      nextRecords.push({ kind: "lap", category: "Fastest lap", rank: lap.rank, time: playerResult.bestLapTime, playerName: recordPlayerName, recordedAt: lap.candidate.recordedAt });
    }

    setLeaderboard(nextLeaderboard);
    setNewRecords(nextRecords);
    try {
      window.localStorage.setItem(TIME_LEADERBOARD_STORAGE_KEY, JSON.stringify(nextLeaderboard));
    } catch {
      // The end-of-race notification remains available even if storage is disabled.
    }
  }, [hud.phase, hud.results, leaderboard, playerName, playerVehicle]);

  useEffect(() => {
    shellRef.current?.focus();

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
        shellRef.current?.focus();
      }
    };

    window.addEventListener("keydown", focusGame, { capture: true });

    return () => {
      window.removeEventListener("keydown", focusGame, { capture: true });
    };
  }, []);

  return (
    <main
      className="gameShell"
      onPointerDown={() => shellRef.current?.focus()}
      ref={shellRef}
      tabIndex={-1}
    >
      <Canvas
        camera={{ fov: 58, near: 0.1, far: 500, position: [0, 12, -25] }}
        dpr={
          graphicsQuality === "performance"
            ? [0.7, 0.9]
            : graphicsQuality === "high"
              ? [1, 1.35]
              : graphicsQuality === "medium"
                ? [1, 1.1]
                : 1
        }
        gl={{
          antialias: graphicsQuality === "high",
          powerPreference: "high-performance",
          preserveDrawingBuffer: false,
          stencil: false
        }}
        shadows={graphicsQuality === "performance" || graphicsQuality === "low" ? false : "soft"}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.04;
        }}
      >
        {raceStarted && (
          <RaceScene
            graphicsQuality={graphicsQuality}
            playerVehicle={playerVehicle}
            resetSeed={resetSeed}
            onHudUpdate={setHud}
            onPerformanceUpdate={setPerformanceStats}
          />
        )}
      </Canvas>
      {raceStarted ? (
        <Hud
          graphicsQuality={graphicsQuality}
          hud={hud}
          leaderboard={leaderboard}
          newRecords={newRecords}
          onGraphicsQualityChange={setGraphicsQuality}
          onSoundToggle={() => setSoundEnabled((enabled) => !enabled)}
          onRestart={() => setResetSeed((seed) => seed + 1)}
          soundEnabled={soundEnabled}
        />
      ) : (
        <VehicleGarage
          onStart={() => {
            setResetSeed((seed) => seed + 1);
            setRaceStarted(true);
          }}
          onPlayerNameChange={setPlayerName}
          onVehicleChange={setPlayerVehicle}
          playerName={playerName}
          playerVehicle={playerVehicle}
        />
      )}
      {raceStarted && performanceStats && (
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
