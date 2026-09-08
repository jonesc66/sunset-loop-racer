# Sunset Loop Racer

A browser-based 3D arcade racing game built with React, TypeScript, Vite, Three.js, and React Three Fiber.

## Run

```bash
npm install
npm run dev
```

Open the local Vite URL, usually `http://127.0.0.1:5173/`.

The published game is available at https://jonesc66.github.io/sunset-loop-racer/ after the GitHub Pages workflow finishes.

## Build

```bash
npm run build
```

## Controls

- `W`: accelerate
- `S`: brake / reverse slowly
- `A` / `D`: steer
- `Space`: handbrake for tighter arcade turns
- `R`: reset the player car to the track

## Gameplay

- 3-lap closed-loop race.
- Sequential checkpoint gates with lateral validation help prevent shortcut lap counting.
- Five AI opponent cars follow a racing line with corner slowdown, lane variation, and basic collision avoidance.
- Chase camera follows the player car.
- HUD shows speed, lap, checkpoint progress, timer, race position, and best lap time.
- Start countdown and final race ranking with finish times and best laps are included.
- Low, medium, and high graphics settings are available from the in-game HUD.

## Implementation Notes

- Track geometry is generated from a sampled closed loop.
- Player vehicle physics are intentionally arcade-style: speed-dependent steering, acceleration, braking, delayed reverse, grip-based side slip, controlled handbrake drifting, off-road slowdown, and stable barrier collision damping.
- The player car has visual body roll, pitch, and a small smoothed suspension bob; the chase camera smooths distance and increases FOV at higher speed.
- The scene uses low-poly code-native assets for performance: road, barriers, checkpoint gates, cars, trees, and road signs.
- Visual polish includes sunset lighting, reflective car paint, brake lights, drift smoke, skid marks, collision sparks, speed streak particles, tunnel and bridge sections, and a distant city skyline.
- Dynamic shadows are disabled for stable rendering and laptop-friendly performance; the sunset look comes from warm lighting, fog, and color choices.
