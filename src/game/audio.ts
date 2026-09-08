import type { HudState } from "./types";

type RaceAudioEngine = {
  dispose: () => void;
  setEnabled: (enabled: boolean) => void;
  update: (hud: HudState) => void;
};

function makeNoiseBuffer(context: AudioContext) {
  const length = context.sampleRate;
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);

  for (let index = 0; index < length; index += 1) {
    data[index] = Math.random() * 2 - 1;
  }

  return buffer;
}

export function createRaceAudioEngine(): RaceAudioEngine {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const context = new AudioContextClass();
  const master = context.createGain();
  const compressor = context.createDynamicsCompressor();
  const engineGain = context.createGain();
  const engineFilter = context.createBiquadFilter();
  const brakeGain = context.createGain();
  const brakeFilter = context.createBiquadFilter();
  const engineOsc = context.createOscillator();
  const enginePulse = context.createOscillator();
  const brakeSource = context.createBufferSource();
  const collisionNoiseBuffer = makeNoiseBuffer(context);

  let enabled = false;
  let lastCollisionCount = 0;
  let lastCollisionSoundAt = -1;
  let unlocked = false;

  master.gain.value = 0;
  compressor.threshold.value = -24;
  compressor.knee.value = 24;
  compressor.ratio.value = 10;
  compressor.attack.value = 0.018;
  compressor.release.value = 0.28;
  engineGain.gain.value = 0.0001;
  brakeGain.gain.value = 0.0001;
  engineFilter.type = "lowpass";
  engineFilter.frequency.value = 900;
  engineFilter.Q.value = 1.8;
  brakeFilter.type = "highpass";
  brakeFilter.frequency.value = 1900;

  engineOsc.type = "sine";
  engineOsc.frequency.value = 58;
  enginePulse.type = "triangle";
  enginePulse.frequency.value = 29;
  brakeSource.buffer = makeNoiseBuffer(context);
  brakeSource.loop = true;

  engineOsc.connect(engineFilter);
  enginePulse.connect(engineFilter);
  engineFilter.connect(engineGain);
  engineGain.connect(master);
  brakeSource.connect(brakeFilter);
  brakeFilter.connect(brakeGain);
  brakeGain.connect(master);
  master.connect(compressor);
  compressor.connect(context.destination);

  engineOsc.start();
  enginePulse.start();
  brakeSource.start();

  const unlock = () => {
    unlocked = true;
    void context.resume();
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
  };

  window.addEventListener("pointerdown", unlock);
  window.addEventListener("keydown", unlock);

  function playCollision(intensity: number) {
    const now = context.currentTime;
    const clampedIntensity = Math.min(0.42, Math.max(0.12, intensity));
    const hitOsc = context.createOscillator();
    const hitGain = context.createGain();
    const noise = context.createBufferSource();
    const noiseGain = context.createGain();
    const filter = context.createBiquadFilter();

    hitOsc.type = "triangle";
    hitOsc.frequency.setValueAtTime(74 + clampedIntensity * 32, now);
    hitOsc.frequency.exponentialRampToValueAtTime(42, now + 0.2);
    hitGain.gain.setValueAtTime(0.0001, now);
    hitGain.gain.linearRampToValueAtTime(0.055 * clampedIntensity, now + 0.024);
    hitGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);

    noise.buffer = collisionNoiseBuffer;
    filter.type = "bandpass";
    filter.frequency.value = 280;
    filter.Q.value = 0.55;
    noiseGain.gain.setValueAtTime(0.0001, now);
    noiseGain.gain.linearRampToValueAtTime(0.024 * clampedIntensity, now + 0.018);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);

    hitOsc.connect(hitGain);
    hitGain.connect(master);
    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(master);
    hitOsc.start(now);
    hitOsc.stop(now + 0.24);
    noise.start(now);
    noise.stop(now + 0.16);
  }

  function setEnabled(nextEnabled: boolean) {
    enabled = nextEnabled;
    if (enabled && !unlocked) {
      void context.resume();
    }
  }

  function update(hud: HudState) {
    const now = context.currentTime;
    const racing = hud.phase !== "finished";
    const speedAmount = Math.min(1, hud.speedKmh / 230);
    const driftAmount = Math.min(1, Math.max(0, hud.drifting));
    const brakingAmount = hud.braking ? Math.min(1, 0.25 + speedAmount + driftAmount * 0.45) : 0;
    const movingAmount = speedAmount > 0.02 || hud.accelerating ? 1 : 0;
    const engineAmount = racing ? movingAmount * (0.025 + speedAmount * 0.2 + (hud.accelerating ? 0.09 : 0)) : 0.0001;

    master.gain.setTargetAtTime(enabled ? 0.34 : 0.0001, now, 0.16);
    engineOsc.frequency.setTargetAtTime(46 + speedAmount * 118 + (hud.accelerating ? 18 : 0), now, 0.09);
    enginePulse.frequency.setTargetAtTime(24 + speedAmount * 52, now, 0.1);
    engineFilter.frequency.setTargetAtTime(260 + speedAmount * 880 + (hud.accelerating ? 160 : 0), now, 0.12);
    engineGain.gain.setTargetAtTime(engineAmount, now, 0.16);
    brakeGain.gain.setTargetAtTime(brakingAmount * 0.1, now, 0.055);
    brakeFilter.frequency.setTargetAtTime(1400 + speedAmount * 2300, now, 0.05);

    if (enabled && speedAmount > 0.08 && hud.collisionCount > lastCollisionCount && now - lastCollisionSoundAt > 0.32) {
      lastCollisionSoundAt = now;
      playCollision(Math.min(0.38, 0.14 + speedAmount * 0.18));
    }
    lastCollisionCount = hud.collisionCount;
  }

  function dispose() {
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
    engineOsc.stop();
    enginePulse.stop();
    brakeSource.stop();
    void context.close();
  }

  return { dispose, setEnabled, update };
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}
