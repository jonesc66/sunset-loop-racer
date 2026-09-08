import * as THREE from "three";
import { randomSequence } from "./benchmarkGeometry";

// Shared linear noise, projected in world space: no mountain UV seam or stretched cliff UVs.
export function makeTerrainMaterial() {
  const random = randomSequence(8821), size = 128;
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const n = Math.round(random() * 255);
    data.set([n, n, n, 255], i * 4);
  }
  const noise = new THREE.DataTexture(data, size, size);
  noise.wrapS = noise.wrapT = THREE.RepeatWrapping;
  noise.minFilter = THREE.LinearMipmapLinearFilter;
  noise.magFilter = THREE.LinearFilter;
  noise.generateMipmaps = true;
  noise.needsUpdate = true;
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide });
  material.onBeforeCompile = shader => {
    shader.uniforms.terrainNoise = { value: noise };
    shader.vertexShader = "varying vec3 terrainWorld; varying vec3 terrainSlope;\n" + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>
      terrainWorld = (modelMatrix * vec4(position, 1.0)).xyz;
      terrainSlope = normal;`);
    shader.fragmentShader = "uniform sampler2D terrainNoise; varying vec3 terrainWorld; varying vec3 terrainSlope;\n" + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace("#include <color_fragment>", `#include <color_fragment>
      vec3 weights = pow(abs(normalize(terrainSlope)), vec3(4.0));
      weights /= max(dot(weights, vec3(1.0)), 0.001);
      vec3 grain = vec3(texture2D(terrainNoise, terrainWorld.yz * 0.009).r,
                        texture2D(terrainNoise, terrainWorld.xz * 0.009).r,
                        texture2D(terrainNoise, terrainWorld.xy * 0.009).r);
      float detail = dot(grain, weights);
      float macro = texture2D(terrainNoise, terrainWorld.xz * 0.0013).r;
      float exposed = smoothstep(0.2, 0.7, 1.0 - abs(normalize(terrainSlope).y));
      // Rock on steep faces, warm soil variation below, retaining authored distant haze.
      diffuseColor.rgb *= mix(vec3(0.79, 0.83, 0.72), vec3(1.08, 1.03, 0.98), detail);
      diffuseColor.rgb *= 0.87 + 0.26 * macro;
      diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.08, 1.015, 0.96), exposed * 0.5);`);
  };
  material.customProgramCacheKey = () => "terrain-triplanar-v1";
  return { material, dispose: () => { material.dispose(); noise.dispose(); } };
}
