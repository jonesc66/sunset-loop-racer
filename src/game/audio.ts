import type { HudState } from "./types";

type RaceAudioEngine = {
  dispose: () => void;
  setActive: (active: boolean) => void;
  setEnabled: (enabled: boolean) => void;
  update: (hud: HudState) => void;
};

type TransientVoice = {
  source: AudioScheduledSourceNode;
  nodes: AudioNode[];
};

const SILENCE = 0.0001;
const MAX_TRANSIENT_VOICES = 12;
const GEAR_SPEEDS = [0, 44, 82, 124, 172, 238];

function clamp01(value: number) {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}

function makeNoiseBuffer(context: AudioContext) {
  const length = context.sampleRate;
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < length; index += 1) data[index] = Math.random() * 2 - 1;
  return buffer;
}

export function createRaceAudioEngine(): RaceAudioEngine {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  // Unsupported WebAudio must not prevent the race or navigation from working.
  if (!AudioContextClass) return { dispose() {}, setActive() {}, setEnabled() {}, update() {} };

  const context = new AudioContextClass();
  const master = context.createGain();
  const compressor = context.createDynamicsCompressor();
  const engineGain = context.createGain();
  const engineFilter = context.createBiquadFilter();
  const tireGain = context.createGain();
  const tireFilter = context.createBiquadFilter();
  const surfaceGain = context.createGain();
  const surfaceFilter = context.createBiquadFilter();
  const engineOsc = context.createOscillator();
  const enginePulse = context.createOscillator();
  const tireSource = context.createBufferSource();
  const surfaceSource = context.createBufferSource();
  const noiseBuffer = makeNoiseBuffer(context);
  const voices = new Set<TransientVoice>();
  const loops = [engineOsc, enginePulse, tireSource, surfaceSource];
  const persistentNodes: AudioNode[] = [
    ...loops, engineFilter, engineGain, tireFilter, tireGain, surfaceFilter, surfaceGain, master, compressor
  ];

  let enabled = false;
  let active = false;
  let disposed = false;
  let lastCollisionCount = 0;
  let lastCollisionSoundAt = -10;
  let lastCountdown = "";
  let lastLap = 1;
  let previousPhase: HudState["phase"] = "countdown";
  let goPlayed = false;
  let finishPlayed = false;
  let gear = 0;
  let lastShiftAt = -10;

  master.gain.value = 0;
  compressor.threshold.value = -18;
  compressor.knee.value = 18;
  compressor.ratio.value = 8;
  compressor.attack.value = 0.006;
  compressor.release.value = 0.18;
  engineGain.gain.value = SILENCE;
  tireGain.gain.value = SILENCE;
  surfaceGain.gain.value = SILENCE;
  engineFilter.type = "lowpass";
  engineFilter.frequency.value = 480;
  engineFilter.Q.value = 0.7;
  tireFilter.type = "bandpass";
  tireFilter.frequency.value = 1500;
  tireFilter.Q.value = 0.8;
  surfaceFilter.type = "lowpass";
  surfaceFilter.frequency.value = 520;
  surfaceFilter.Q.value = 0.5;
  engineOsc.type = "triangle";
  engineOsc.frequency.value = 48;
  enginePulse.type = "sine";
  enginePulse.frequency.value = 24;
  tireSource.buffer = noiseBuffer;
  tireSource.loop = true;
  surfaceSource.buffer = noiseBuffer;
  surfaceSource.loop = true;
  surfaceSource.playbackRate.value = 0.72;

  engineOsc.connect(engineFilter);
  enginePulse.connect(engineFilter);
  engineFilter.connect(engineGain);
  engineGain.connect(master);
  tireSource.connect(tireFilter);
  tireFilter.connect(tireGain);
  tireGain.connect(master);
  surfaceSource.connect(surfaceFilter);
  surfaceFilter.connect(surfaceGain);
  surfaceGain.connect(master);
  master.connect(compressor);
  compressor.connect(context.destination);
  for (const source of loops) source.start();

  function canPlay() {
    return enabled && active && !disposed && !document.hidden && context.state === "running";
  }

  function updateMaster() {
    if (disposed) return;
    master.gain.setTargetAtTime(enabled && active && !document.hidden ? 0.3 : SILENCE, context.currentTime, 0.055);
  }

  function stopTransients() {
    for (const voice of voices) {
      voice.source.onended = null;
      voice.source.stop(context.currentTime);
      for (const node of voice.nodes) node.disconnect();
    }
    voices.clear();
  }

  function resetRace() {
    stopTransients();
    lastCollisionCount = 0;
    lastCollisionSoundAt = -10;
    lastCountdown = "";
    lastLap = 1;
    previousPhase = "countdown";
    goPlayed = false;
    finishPlayed = false;
    gear = 0;
    lastShiftAt = -10;
  }

  // A stopped event disconnects every node, including its filter and envelope.
  function trackVoice(source: AudioScheduledSourceNode, nodes: AudioNode[], startsAt: number, endsAt: number) {
    const voice = { source, nodes };
    voices.add(voice);
    source.onended = () => {
      for (const node of nodes) node.disconnect();
      voices.delete(voice);
    };
    source.start(startsAt);
    source.stop(endsAt);
  }

  function tone(frequency: number, offset: number, duration: number, gain = 0.075) {
    if (!canPlay() || voices.size >= MAX_TRANSIENT_VOICES) return;
    const at = context.currentTime + offset;
    const source = context.createOscillator();
    const envelope = context.createGain();
    source.type = "sine";
    source.frequency.value = frequency;
    envelope.gain.setValueAtTime(SILENCE, at);
    envelope.gain.linearRampToValueAtTime(gain, at + 0.014);
    envelope.gain.exponentialRampToValueAtTime(SILENCE, at + duration);
    source.connect(envelope);
    envelope.connect(master);
    trackVoice(source, [source, envelope], at, at + duration + 0.025);
  }

  function playGo() {
    if (goPlayed) return;
    goPlayed = true;
    tone(659, 0, 0.22, 0.085);
    tone(988, 0.065, 0.34, 0.065);
  }

  function playCollision(intensity: number) {
    if (!canPlay() || voices.size > MAX_TRANSIENT_VOICES - 2) return;
    const now = context.currentTime;
    const impact = clamp01(intensity);
    const duration = 0.09 + impact * 0.15;
    const hitOsc = context.createOscillator();
    const hitGain = context.createGain();
    const noise = context.createBufferSource();
    const noiseGain = context.createGain();
    const filter = context.createBiquadFilter();
    hitOsc.type = "triangle";
    hitOsc.frequency.setValueAtTime(92 + impact * 38, now);
    hitOsc.frequency.exponentialRampToValueAtTime(38, now + duration);
    hitGain.gain.setValueAtTime(SILENCE, now);
    hitGain.gain.linearRampToValueAtTime(0.018 + impact * 0.105, now + 0.008);
    hitGain.gain.exponentialRampToValueAtTime(SILENCE, now + duration);
    noise.buffer = noiseBuffer;
    filter.type = "bandpass";
    filter.frequency.value = 260 + impact * 580;
    filter.Q.value = 0.5;
    noiseGain.gain.setValueAtTime(SILENCE, now);
    noiseGain.gain.linearRampToValueAtTime(0.012 + impact * 0.075, now + 0.006);
    noiseGain.gain.exponentialRampToValueAtTime(SILENCE, now + duration * 0.8);
    hitOsc.connect(hitGain);
    hitGain.connect(master);
    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(master);
    trackVoice(hitOsc, [hitOsc, hitGain], now, now + duration + 0.025);
    trackVoice(noise, [noise, filter, noiseGain], now, now + duration + 0.025);
  }

  const unlock = () => {
    if (disposed) return;
    void context.resume().then(() => {
      if (disposed || context.state !== "running") return;
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    }).catch(() => { /* Keep gesture listeners available for a later successful resume. */ });
  };
  const onVisibilityChange = () => {
    if (document.hidden) stopTransients();
    updateMaster();
  };
  window.addEventListener("pointerdown", unlock);
  window.addEventListener("keydown", unlock);
  document.addEventListener("visibilitychange", onVisibilityChange);

  function setEnabled(nextEnabled: boolean) {
    if (disposed || nextEnabled === enabled) return;
    enabled = nextEnabled;
    if (!enabled) stopTransients();
    else unlock();
    updateMaster();
  }

  function setActive(nextActive: boolean) {
    if (disposed || nextActive === active) return;
    active = nextActive;
    resetRace();
    if (!active) {
      engineGain.gain.setTargetAtTime(SILENCE, context.currentTime, 0.05);
      tireGain.gain.setTargetAtTime(SILENCE, context.currentTime, 0.035);
      surfaceGain.gain.setTargetAtTime(SILENCE, context.currentTime, 0.035);
    }
    updateMaster();
  }

  function update(hud: HudState) {
    if (disposed || !active) return;
    const now = context.currentTime;
    // Race Again reuses this engine: reset events and pseudo gears, never create new loops.
    if (hud.phase === "countdown" && previousPhase !== "countdown") resetRace();
    const countingDown = hud.phase === "countdown";
    const finished = hud.phase === "finishing" || hud.phase === "finished";
    const speedKmh = Math.max(0, Number.isFinite(hud.speedKmh) ? hud.speedKmh : 0);
    const speedAmount = clamp01(speedKmh / 230);
    const load = hud.accelerating && !hud.braking ? 1 : 0;
    const drift = clamp01(hud.drifting);
    const slip = clamp01(hud.tireSlip ?? Math.max(0, (drift - 0.18) / 0.82));
    const surface = clamp01(hud.surfaceRoughness ?? (hud.offRoad ? 1 : 0));

    // Hysteresis and a minimum dwell prevent a threshold from chattering at steady speed.
    if (!countingDown && !finished && now - lastShiftAt > 0.42) {
      if (gear < GEAR_SPEEDS.length - 2 && speedKmh > GEAR_SPEEDS[gear + 1] + 3) {
        gear += 1;
        lastShiftAt = now;
      } else if (gear > 0 && speedKmh < GEAR_SPEEDS[gear] - 8) {
        gear -= 1;
        lastShiftAt = now;
      }
    }
    const gearAmount = clamp01((speedKmh - GEAR_SPEEDS[gear]) / (GEAR_SPEEDS[gear + 1] - GEAR_SPEEDS[gear]));
    const countdownBuild = hud.countdownText === "1" ? 0.82 : hud.countdownText === "2" ? 0.57 : 0.32;
    const rpm = countingDown ? countdownBuild + load * 0.1 : 0.24 + gearAmount * 0.76;
    const shiftDip = now - lastShiftAt < 0.14 ? 0.78 : 1;
    const engineAmount = finished ? SILENCE : (countingDown ? 0.052 + rpm * 0.036 : 0.04 + speedAmount * 0.075 + load * 0.05) * shiftDip;
    // Moderate braking is a low scrub. Squeal requires meaningful slip/drift at speed.
    const brakeScrub = hud.braking ? Math.max(0, speedAmount - 0.12) * 0.2 : 0;
    const tireAmount = finished || countingDown ? 0 : Math.max(brakeScrub, slip * 0.92) * clamp01(speedAmount * 2.4) * (1 - surface * 0.72);
    const surfaceAmount = finished || countingDown ? 0 : surface * clamp01(speedAmount * 2.1);
    engineOsc.frequency.setTargetAtTime((46 + rpm * 120 + load * 12) * shiftDip, now, 0.08);
    enginePulse.frequency.setTargetAtTime((25 + rpm * 53) * shiftDip, now, 0.09);
    engineFilter.frequency.setTargetAtTime(300 + rpm * 850 + load * 210, now, 0.1);
    engineGain.gain.setTargetAtTime(engineAmount, now, 0.075);
    tireGain.gain.setTargetAtTime(Math.max(SILENCE, tireAmount * 0.09), now, 0.045);
    tireFilter.frequency.setTargetAtTime(1050 + speedAmount * 1200 + slip * 850, now, 0.065);
    tireFilter.Q.setTargetAtTime(0.8 + slip * 1.6, now, 0.09);
    surfaceGain.gain.setTargetAtTime(Math.max(SILENCE, surfaceAmount * 0.11), now, 0.08);
    surfaceFilter.frequency.setTargetAtTime(260 + speedAmount * 560, now, 0.12);

    if (hud.countdownText && hud.countdownText !== lastCountdown) {
      if (hud.countdownText.startsWith("GO")) playGo();
      else if (countingDown) tone(440, 0, 0.16, 0.07);
    }
    if (hud.phase === "race" && previousPhase === "countdown") playGo();
    if (!countingDown && !finished && hud.lap > lastLap) {
      if (hud.lap === hud.totalLaps) {
        tone(659, 0, 0.15); tone(784, 0.16, 0.15); tone(988, 0.32, 0.28);
      } else {
        tone(523, 0, 0.14, 0.065); tone(784, 0.14, 0.23, 0.065);
      }
    }
    if (finished && !finishPlayed) {
      finishPlayed = true;
      tone(523, 0, 0.2); tone(659, 0.16, 0.22); tone(784, 0.33, 0.24); tone(1047, 0.52, 0.5, 0.085);
    }
    if (!finished && !countingDown && hud.collisionCount > lastCollisionCount && now - lastCollisionSoundAt > 0.22) {
      lastCollisionSoundAt = now;
      playCollision(hud.collisionIntensity ?? (0.1 + speedAmount * 0.6));
    }
    lastCollisionCount = hud.collisionCount;
    lastCountdown = hud.countdownText;
    lastLap = hud.lap;
    previousPhase = hud.phase;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    stopTransients();
    for (const source of loops) source.stop();
    for (const node of persistentNodes) node.disconnect();
    void context.close().catch(() => { /* Closing an already unavailable device is harmless. */ });
  }

  return { dispose, setActive, setEnabled, update };
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}
