# Sunset Loop Racer

A browser-based 3D arcade racing game built with React, TypeScript, Vite, Three.js and React Three Fiber.

**Play:** https://jonesc66.github.io/sunset-loop-racer/

## Current release — September 12, 2026

- Expanded closed-loop circuit: approximately 1,524.73 world units, 20 checkpoints, six cars and three laps.
- Ten environment zones, lakes and river, villages, industrial scenery, bridge and continuous tunnel.
- Updated trees, terrain, water and environment assets.
- Live track overview with player direction, five opponents and the start/finish line. Responsive HUD avoids overlap with quality controls.
- Separate Personal Top 5 storage for the expanded circuit; old short-track records are not mixed with new times. Records are local to each browser and site origin, so localhost and the public website have separate leaderboards.
- Closer chase camera with motion compensation keeps the player car visible at speed.
- Readonly driving keyboard focus reduces text-composition interference while preserving Chinese name entry in the garage. Native Windows Zhuyin behavior still requires confirmation on the player's machine.

## Run locally

Use an installed Node.js runtime, then:

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:5173/sunset-loop-racer/.

## Controls

- W / Up: accelerate
- S / Down: brake or reverse
- A / Left and D / Right: steer
- Space: handbrake
- R: reset to the track

Enter a name, select a vehicle and click **Start Race**. Sound and Perf / Low / Medium / High / GPU settings are below the minimap.

## Test your local GPU

Open the public URL in a browser on the machine whose graphics card you want to test, and select **GPU**. Inspect the in-game performance panel for FPS, renderer, draw calls and triangles. The GPU preset chooses visual quality; the renderer determines whether rendering actually uses hardware. If the panel shows **SOFTWARE**, it is not a hardware-GPU benchmark. Test a full lap and the tunnel on your own machine. After a deployment, refresh the page to load the latest release.

Codex's local runtime acceptance used a software renderer; those FPS and elapsed race times are not evidence of physical GPU performance.

## Build and verification

```sh
npm run build
```

Local regression checks (run in this order):

```sh
node scripts/verify-environment-phase3.mjs
node scripts/verify-phase4a.mjs
node scripts/verify-whole-scene.mjs
node scripts/verify-driving-controls.mjs
```

The existing browser checks use a dedicated local Edge CDP profile on port 9225 and a Vite server on port 5173. They are not enabled in the public game. Production builds exclude the development inspection/auto-race entry points. There is no configured lint script.

## Deployment

Pushes to main run the existing Deploy game to GitHub Pages workflow. GitHub Actions installs locked dependencies, builds the game and publishes dist. Local tool runtimes, browser profiles and development server logs are excluded.
