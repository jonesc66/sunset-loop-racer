# Phase 3 reproducible environment library

Use the installed Blender executable; no downloads or third-party source assets are required.

```powershell
& '.\.tools\blender-4.5.9-windows-x64\blender.exe' --background --factory-startup --python tools/blender/generate_environment.py
```

Verified executable: Blender **4.5.9 LTS**, seed **9031**. The script creates an isolated in-memory scene and overwrites only its generated GLB and manifest. It does not delete files or edit an existing user scene.

Outputs:

- `public/assets/environment/phase3/environment-v1.glb`
- `public/assets/environment/phase3/manifest.json`

The manifest records the Blender version, invocation, seed, output path and per-mesh triangle counts. Dimensions, palette and LOD parameters are source-controlled in `generate_environment.py`.

16 asset families, three levels each: cliff, rock, alpine, chalet, barn, church, warehouse, garage, tank, fence, hay, pole, bridge, tunnel, portal, utility. The library shares one opaque vertex-colour material and requires no image textures. Runtime adds a rock-strata shader to rock families. Major forms remain in every LOD; windows/chimneys/ribs and polygon counts simplify where applicable. Minimal props intentionally retain their already tiny geometry.

Units: metres. Authoring X/right, Y/forward, Z/up; exporter converts to glTF Y/up. All library objects share an origin and **must be instanced separately**, never display the whole library scene.

Bridge modules are 10 m long, 36 m wide, with their deck below road Y=0. Tunnel modules are 6 m long with a 38 m clear interior and a 10 m ceiling. Runtime resizes depth with overlap and tilts modules to the single track spline; Blender never owns a separate road. Building foundations extend 4 m below origin to meet sloping terrain.

Runtime limits: 300 m culling / 80–170 m LOD for standard presets; 440 m culling / 130–260 m LOD for GPU. Detail placements and nearby asset shadows are GPU-only; all structural content remains available in every preset. The Phase 2 forest pipeline and quality preset values remain intact.

Validation:

```powershell
node scripts/verify-environment-phase3.mjs
npm run build
```

See `verification/environment-phase3/REPORT.md` for browser evidence and outstanding acceptance items. Automated tests alone do not establish runtime completion.
