import * as THREE from "three";
import { randomSequence } from "./benchmarkGeometry";

// Four metres per tile: aggregate stays millimetre-sized rather than stretching across the road.
export function makeRoadMaterial(anisotropy: number) {
  const size = 256, random = randomSequence(7071);
  const height = Float32Array.from({ length: size * size }, () => random());
  const color = new Uint8Array(size * size * 4), normals = color.slice(), rough = color.slice();
  const h = (x: number, y: number) => height[((y + size) % size) * size + (x + size) % size];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = (y * size + x) * 4;
    const value = Math.round(68 + h(x, y) * 25);
    color.set([value, value + 2, value + 2, 255], i);
    const normal = new THREE.Vector3((h(x - 1, y) - h(x + 1, y)) * 0.35, (h(x, y - 1) - h(x, y + 1)) * 0.35, 1).normalize();
    normals.set([Math.round(normal.x * 127 + 128), Math.round(normal.y * 127 + 128), Math.round(normal.z * 127 + 128), 255], i);
    const r = Math.round(213 + h(x, y) * 35); rough.set([r, r, r, 255], i);
  }
  const texture = (data: Uint8Array, srgb = false) => {
    const t = new THREE.DataTexture(data, size, size);
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true; t.anisotropy = anisotropy; t.needsUpdate = true;
    return t;
  };
  const maps = [texture(color, true), texture(normals), texture(rough)];
  const material = new THREE.MeshStandardMaterial({ map: maps[0], normalMap: maps[1], normalScale: new THREE.Vector2(0.28, 0.28), roughnessMap: maps[2], roughness: 1, metalness: 0 });
  material.onBeforeCompile = shader => {
    shader.vertexShader = "varying vec3 roadWorld;\n" + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\nroadWorld = (modelMatrix * vec4(position, 1.0)).xyz;");
    shader.fragmentShader = "varying vec3 roadWorld;\n" + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace("#include <map_fragment>", `#include <map_fragment>
      // Broad non-periodic tonal drift removes a visible grid without extra texture reads.
      float weathering = sin(roadWorld.x * 0.13 + sin(roadWorld.z * 0.19)) * sin(roadWorld.z * 0.077 + roadWorld.x * 0.03);
      diffuseColor.rgb *= 0.92 + weathering * 0.085;`);
  };
  material.customProgramCacheKey = () => "benchmark-asphalt-v1";
  return { material, dispose: () => { material.dispose(); maps.forEach(t => t.dispose()); } };
}
