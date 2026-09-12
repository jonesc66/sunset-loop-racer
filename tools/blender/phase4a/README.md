# Phase 4A local asset authoring

Use the already installed Blender 4.5.9 LTS executable from the repository root:

```powershell
& '.\.tools\blender-4.5.9-windows-x64\blender.exe' --background --factory-startup --python tools/blender/phase4a/build.py
```

Seed: 41027. Metres; Blender Z-up is exported as glTF Y-up. No external asset downloads or rendering services are used.

`build.py` creates irregular stratified cliff surfaces, fracture boulders and shoreline shelves, swept bridge cross sections, shared metric UVs, and three decimated LODs. Structural LODs keep at least 65% of their geometry to avoid collapsing thin rail or beam sections. The script validates meshes and recalculates outward normals before export.

The material source is retained in `verification/environment-phase4a/phase4a-library.blend`. Runtime output is `public/assets/environment/phase4a/environment.glb`, `manifest.json` and 12 shared 1024² PNG textures. glTF extras `materialKey` bind each exported mesh to `src/environment/phase4aMaterials.ts`. This avoids embedding duplicate textures into geometry exports.

Base color is sRGB. Normal and packed ORM are saved as Non-Color; roughness is G, metallic is B. AO R is reserved, not currently sampled at runtime. Four texture families supply ten reusable material presets. Runtime texture budget is approximately 64 MiB including mipmaps, excluding the existing scene and driver overhead.

The native `.blend` is an editable model/material library, not an offline rendered deliverable. Art acceptance uses the real WebGL game and the fixed-view comparison gallery in `verification/environment-phase4a/`.
