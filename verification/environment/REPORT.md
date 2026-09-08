# Environment benchmark — 2026-09-07

Status: **BLOCKED — hardware performance acceptance**. Implementation, automated checks, whole-course visual inspection and software-rendered gameplay checks have run. Hardware FPS regression acceptance remains unavailable on the browser's Microsoft Basic Render Driver. This is not final visual/performance acceptance.

## Scope and files

- `src/environment/BenchmarkEnvironment.tsx`: procedural sky, shared sun direction, PMREM environment lighting, moving shadow volume, near verge, layered mountains, distance-tiered instanced trees and sparse road wear.
- `src/environment/benchmarkGeometry.ts`: deterministic terrain geometry, road clearance, closed mountain meshes with welded seam normals.
- `src/environment/roadMaterial.ts`: 256 × 256 generated asphalt color, tangent-space normal and roughness maps; world-space tonal variation.
- `src/environment/terrainMaterial.ts`: shared 128 × 128 procedural detail map, world-space triplanar rock/soil variation without stretched UVs.
- `src/RaceScene.tsx`: environment integration, corrected shoulder UV closure, merged distant trees, removed unused billboard loading and old overlapping scenery. Includes a DEV-only camera inspection route.
- `src/game/track.ts`: rendering geometry only: continuous physical-scale road UVs and upward face winding. Track shape and gameplay calculations are unchanged.
- `scripts/verify-environment.mjs`: geometry and frozen-code regression checks.
- `verification/environment/`: original source snapshots, generated geometry-check modules, test result and this report.

Detail placement is limited to lap progress **0.92 → 1.00 → 0.18**, covering the approach, start straight and first bend. Shared road rendering corrections, sky, sun and mountain backdrop necessarily affect other viewing directions around the lap. The rest of the course has not been rebuilt.

## Assets and tools

No downloads, dependency installations, new GLBs or changes to player/AI car assets. Asphalt maps, environment map, mountain/verge geometry and vegetation are generated locally at runtime. Existing files were retained. Blender was available according to the user but was not needed for this procedural implementation. All rendering uses Three.js 0.177.0 / React Three Fiber 9.6.1 / WebGL.

## Rendering architecture and budgets

1. Standard PBR road material: four metres per repeat; integer repeats around the closing edge. Color map is sRGB; normal and roughness maps are linear data. Asphalt is nonmetallic. Twelve sparse patch/mark instances occupy the slice.
2. Two colored verge strips blend soil into grass and rise away from the driveable road. Tree bases raycast against these exact strips.
3. Four middle-distance mountain volumes and four lower-detail distant volumes. Meshes close beneath the ground; seam vertices are welded before computing normals. Rock/grass vertex colors combine with shared triplanar detail and slope variation. Distant colors blend toward haze.
4. Slice vegetation uses four shared instance batches: near trunks, detailed crowns, medium crowns and distant crowns. Distance thresholds are 85 and 160 metres; instance sets update twice per second. Only near instances cast shadows. Other course trees share one merged crown geometry and one instance batch.
5. A camera-centered procedural dome eliminates wrapping seams. Its sun and the directional light use the same vector. A generated PMREM supplies moderate environment contribution; hemisphere light fills shadows.
6. Shadow coverage is 150 × 150 metres following the camera. Medium uses 1024 maps, High 2048; Low/Perf disable realtime shadows. Existing ACES tone mapping and R3F sRGB output are retained. No post-processing passes were added.

| Setting | Candidate slice plants* | Vegetation cutoff | Mountain detail | Shadows |
| --- | ---: | ---: | --- | --- |
| Perf | 32 | 160 m | 12 / 10 | Off |
| Low | 65 | 160 m | 12 / 10 | Off |
| Medium | 115 | 240 m | 18 / 10 | 1024 |
| High | 170 | 300 m | 24 / 10 | 2048 |

*Road clearance can reject candidates. Mountain detail denotes latitude segment count; longitude count is twice that. These are quality-dependent resolutions, not dynamic mountain LOD. Vegetation has dynamic distance tiers and distance culling; mountains use frustum culling and fog. Fine road textures total about 1 MiB including mipmaps, excluding the generated PMREM.

## Automated verification

- TypeScript `tsc -b`: **PASS**, after latest changes.
- Geometry tests `node scripts/verify-environment.mjs`: **PASS**. See `geometry-results.json`.
- Production build `node node_modules/vite/bin/vite.js build --emptyOutDir false`: **PASS**, after latest changes. Existing output was retained to honor the no-bulk-deletion rule.
- ESLint: **N/A**, no configured lint command.
- Existing gameplay test suite: **N/A**, none configured. The added checks compare the physics, AI, checkpoint, camera and vehicle-model function bodies against the captured baseline.
- Build warning: application JavaScript remains over the 500 kB chunk advisory (about 1.175 MB raw / 329 kB gzip). This is not a failed build and was not addressed with unrelated bundling work.

## Runtime evidence — resumed local session

The browser connection has been restored. Latest terrain shaders, seam welding, plant anchoring, darker irregular crowns and PMREM changes have been loaded and visually re-used. PMREM's extra source blur was removed after its sampling warning was observed; the generated PMREM still supplies filtered environment lighting. Final-session console warnings/errors are empty at the time of inspection.

High-quality whole-lap inspection covered **19 camera positions**: 0.00, 0.07, 0.14, 0.21, 0.28, 0.31, 0.335, 0.36, 0.43, 0.50, 0.57, 0.62, 0.64, 0.67, 0.71, 0.78, 0.85, 0.92 and 0.97. Each was viewed, not merely captured. No obvious road holes, open mountain surfaces or sky wrapping seams were observed in these views. This is sampled coverage around the entire course, not proof of every possible camera angle.

The final material/crown revision was additionally re-inspected at 0.07, 0.14, 0.335, 0.64 and 0.97. Saved evidence:

- [Before, High, progress 0.07](before-007-high.png) / [After, same camera](after-007-high.png). AI positions differ, so these are visual comparisons, not controlled performance benchmarks.
- [Final approach](final-sector-0.97-high.png), [first bend](final-sector-0.14-high.png), [tunnel marker](final-sector-0.335-high.png), [bridge marker](final-sector-0.64-high.png).
- [Medium](after-007-medium.png) / [Low](after-007-low.png). High → Medium → Low → High remained usable and retained the ongoing race state.
- Other full-course views are saved as `sector-<progress>-high.png`; the initial 0.97 view is `after-097-high.png`. These precede the last material/crown refinement, while the final samples above cover its affected area and landmarks.

Normal URL, without DEV inspection or auto-driving: Start Race worked, W accelerated from rest to 75 and later 88 km/h, steering changed the car direction, S inputs returned the displayed speed to zero, and R moved the off-road car back to the road. The braking sample includes elapsed coasting time and is not a measured stopping-distance test. Sound-button interaction was exercised but audible output was not assessed. A fresh final-build autoRace is recorded separately below.

Before/after differences: finer physical-scale asphalt, raised grass/soil verges, irregular vegetation, layered mountains with rock variation, a blended horizon and consistent sky/sun lighting. The result remains procedural and stylized; it is not photorealistic production environment art.

The browser reports **SOFTWARE / Microsoft Basic Render Driver**. Final representative High captures range from approximately 2–4 FPS and 31–147 calls / 95–202k triangles as visible vehicles vary; normal Perf samples are around 6–9 FPS. These are diagnostic snapshots, not a fixed-scene frame-time benchmark. The no-severe-FPS-regression requirement is **not established**.

## Remaining limitations and next stage

- Hardware-GPU frame-time comparison at equal viewport, DPR, car visibility, quality and warmup is required before final performance acceptance. Do not extrapolate from software rendering.
- Existing nominal tunnel/bridge areas are posts and lamps, without tunnel roof/walls or an overhead bridge deck. Their entrance contrast and underpass shadowing cannot be claimed. They were preserved within the environment-slice scope.
- The implementation does not add complete terrain splatting, drainage assets or new weather/time-of-day modes. Painted line/curb designs remain largely as before.
- Console checks can identify reported failed assets; they do not replace a complete network request trace. The new environment uses generated assets and introduces no remote fetches.
- Next: accept the slice visually, establish hardware performance, then expand this system sector by sector. Complete bridge/tunnel meshes can use the installed Blender and GLB export; car assets and gameplay remain frozen.

## Final race regression

Final autoRace completed **3 / 3 laps, CP 14 / 14**, total **4:25.3**, best lap **1:11.8**, position **5 / 6**. The results and Personal Top 5 appeared. Race Again reset the HUD to lap 1, CP 0, time 0 and restarted the countdown. Sound toggled its active class off/on. Audible output and leaderboard persistence across a second completed race after reload were not independently verified; those unchanged systems are outside the environment-specific regression coverage.

Evidence: [race result screenshot](final-race-complete.png), [result UI state](final-race-state.txt), [final console check](final-console.json), [whole-course screenshot index](index.html). Final-session captured error/warning entries: **0**. No failed-resource messages were captured; a complete network waterfall was not recorded. Normal garage/race asset loading succeeded. The browser was returned to the ordinary garage URL for handoff.

This uses the existing DEV auto-driving mode; ordinary manual controls were checked separately above. No car assets or gameplay functions were changed. Automated typecheck, geometry regression and production build remain PASS on the latest implementation; subsequent changes only add verification documentation and evidence.
