# Rebuild the environment forest

Requires the locally installed Blender **4.5.9 LTS**. Locate its executable first; the development machine currently has `.tools/blender-4.5.9-windows-x64/blender.exe`.

```powershell
& '.\.tools\blender-4.5.9-windows-x64\blender.exe' --background --factory-startup --python tools/blender/generate_forest.py
```

No input/downloaded assets. The script creates a separate in-memory scene and exports `public/assets/environment/forest-v1.glb` plus its manifest. It does not delete files or modify existing scenes. Regeneration replaces these two generated outputs. Seed **48120**, species parameters and LOD parameters are stored in the script.

Four branch-cluster silhouettes (spruce, Scots pine, fir, mountain pine), each with three independently simplified meshes. Opaque vertex-colour PBR, no alpha cards/textures/overdraw. Metres, base at origin, Blender Z-up converted to glTF Y-up. One material; runtime merges no individual trees, instead instances each species/LOD mesh. Scene layout is an asset library: all objects intentionally share the origin, and must be used separately, not rendered as the complete GLB scene.
