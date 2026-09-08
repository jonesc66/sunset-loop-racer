export const qualityOrder = ["performance", "low", "medium", "high", "gpu"];
const highEffects = { smoke: true, sparks: true, speedParticles: true, maxSmoke: 70, maxSparks: 36, maxSpeedParticles: 36, maxSkids: 115, sceneryStep: 6, minimalDrawCalls: false };
const high = {
    dpr: [1, 1.35], antialias: true, shadows: true, importedPlayer: true,
    enhancedEnvironment: false, anisotropy: 8, effects: highEffects,
    environment: { fogNear: 210, fogFar: 490, skyRadius: 460, sun: [-88, 112, -62], sunIntensity: 2.7, hemisphere: 1.35, shadowSize: 2048, shadowExtent: 75, mountainDetail: 24, slicePlants: 170, plantCutoff: 300 },
    forest: { candidates: 0, near: 85, mid: 160, far: 300, shadow: 85 },
    ground: { candidates: 0, distance: 0 }
};
// Preserve the existing four presets. GPU is opt-in and inherits High gameplay effects.
export const qualityPresets = {
    performance: { ...high, dpr: [.7, .9], antialias: false, shadows: false, importedPlayer: false,
        effects: { smoke: false, sparks: false, speedParticles: false, maxSmoke: 0, maxSparks: 0, maxSpeedParticles: 0, maxSkids: 24, sceneryStep: 14, minimalDrawCalls: true },
        environment: { ...high.environment, fogNear: 150, shadowSize: 1024, mountainDetail: 12, slicePlants: 32, plantCutoff: 160 } },
    low: { ...high, dpr: 1, antialias: false, shadows: false, importedPlayer: false,
        effects: { smoke: false, sparks: true, speedParticles: false, maxSmoke: 0, maxSparks: 18, maxSpeedParticles: 0, maxSkids: 45, sceneryStep: 9, minimalDrawCalls: false },
        environment: { ...high.environment, fogNear: 150, shadowSize: 1024, mountainDetail: 12, slicePlants: 65, plantCutoff: 160 } },
    medium: { ...high, dpr: [1, 1.1], antialias: false, importedPlayer: false,
        effects: { smoke: true, sparks: true, speedParticles: false, maxSmoke: 32, maxSparks: 18, maxSpeedParticles: 0, maxSkids: 65, sceneryStep: 9, minimalDrawCalls: false },
        environment: { ...high.environment, shadowSize: 1024, mountainDetail: 18, slicePlants: 115, plantCutoff: 240 } },
    high,
    gpu: { ...high, dpr: [1, 2], enhancedEnvironment: true, anisotropy: 16,
        environment: { ...high.environment, sun: [-100, 82, -72], sunIntensity: 3.0, hemisphere: 1.05, shadowSize: 4096, shadowExtent: 100 },
        forest: { candidates: 1250, near: 105, mid: 220, far: 420, shadow: 105 },
        ground: { candidates: 900, distance: 115 } }
};
