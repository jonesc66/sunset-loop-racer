# PLAN.md

## Goal
Build a genuinely playable browser-based 3D arcade racing game using React, TypeScript, Vite, Three.js, and React Three Fiber.

## Repository State
- The repository starts empty apart from `.git`.
- We need to scaffold the app, install dependencies, implement gameplay, and document how to run it.

## Implementation Plan
1. Scaffold a Vite React TypeScript app.
   - Add `package.json`, TypeScript config, Vite config, HTML entry, and source files.
   - Use `@react-three/fiber`, `three`, and React.

2. Build the racing simulation.
   - Add player input for `W/S`, `A/D`, `Space`, and `R`.
   - Implement arcade vehicle physics with acceleration, braking, drag, steering, handbrake drift, and off-road slowdown.
   - Add reset-to-track behavior.

3. Create the closed-loop race logic.
   - Define one loop track from sampled centerline points.
   - Generate checkpoints around the loop.
   - Count laps only when checkpoints are passed in order.
   - Run a 3-lap race with timer, finish state, and rankings.

4. Add AI racers.
   - Implement 3 AI cars that follow the loop with simple lane offsets and speed variation.
   - Give them lap/checkpoint progress so they can finish and appear in results.

5. Build the Three.js scene.
   - Third-person chase camera following the player car.
   - Drivable road, grass infield/outfield, barriers, trees, road signs, checkpoint gates, and sunset lighting/sky.
   - Use performant geometry and instancing where helpful for normal-laptop responsiveness.

6. Build the HUD and game states.
   - Start countdown.
   - Speedometer, timer, lap display, checkpoint progress, and control hints.
   - Results screen after the race with placement and times.

7. Verify and polish.
   - Run dependency install.
   - Run TypeScript/build checks.
   - Run the app in a browser, inspect console errors, and fix issues.
   - Add `README.md` with setup, controls, and implementation notes.

## Design Direction
- Sunset arcade racer with warm sky, long shadows, bright readable road markings, colored opponent cars, simple low-poly trees, and visible race signage.
- The first screen is the playable game canvas and HUD, not a marketing page.
- All gameplay objects are code-native Three.js/R3F assets so the scene remains interactive and performant.
