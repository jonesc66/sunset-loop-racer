import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { sampleTrack, TRACK_WIDTH, type TrackInfo } from "../game/track";
import type { GraphicsQuality } from "../game/types";
import { createMountain, createVerge, randomSequence, roadDistance, SLICE_START, SLICE_END } from "./benchmarkGeometry";
import { makeTerrainMaterial } from "./terrainMaterial";

export const SUN = new THREE.Vector3(-88, 112, -62).normalize();
const HAZE = "#c6d5d5";

const skyVertex = `varying vec3 direction;
void main() { direction = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const skyFragment = `uniform vec3 sun; varying vec3 direction;
void main() {
  vec3 d = normalize(direction);
  vec3 horizon = vec3(0.565, 0.665, 0.665);
  vec3 zenith = vec3(0.12, 0.34, 0.60);
  vec3 color = mix(horizon, zenith, pow(max(d.y, 0.0), 0.55));
  float alignment = max(dot(d, sun), 0.0);
  color += vec3(0.25, 0.20, 0.12) * pow(alignment, 24.0);
  color += vec3(2.4, 1.8, 0.9) * smoothstep(0.9995, 0.99985, alignment);
  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function BenchmarkAtmosphere({ quality }: { quality: GraphicsQuality }) {
  const dome = useRef<THREE.Mesh>(null);
  const light = useRef<THREE.DirectionalLight>(null);
  const target = useMemo(() => new THREE.Object3D(), []);
  const uniforms = useMemo(() => ({ sun: { value: SUN } }), []);
  const { scene, gl } = useThree();
  useEffect(() => {
    // A tiny procedural sky capture supplies rough PBR reflections without HDR downloads.
    const source = new THREE.Scene();
    const material = new THREE.ShaderMaterial({ vertexShader: skyVertex, fragmentShader: skyFragment, uniforms, side: THREE.BackSide });
    const geometry = new THREE.SphereGeometry(10, 24, 12);
    source.add(new THREE.Mesh(geometry, material));
    const pmrem = new THREE.PMREMGenerator(gl);
    const map = pmrem.fromScene(source, 0, 0.1, 30);
    const previous = scene.environment;
    const intensity = scene.environmentIntensity;
    scene.environment = map.texture;
    scene.environmentIntensity = 0.32;
    geometry.dispose(); material.dispose(); pmrem.dispose();
    return () => { scene.environment = previous; scene.environmentIntensity = intensity; map.dispose(); };
  }, [gl, scene, uniforms]);
  useFrame(({ camera }) => {
    dome.current?.position.copy(camera.position);
    if (light.current) {
      // Tight, camera-following shadow volume; snap the target to shadow texels.
      const texel = 150 / (quality === "high" ? 2048 : 1024);
      target.position.set(Math.round(camera.position.x / texel) * texel, 0, Math.round(camera.position.z / texel) * texel);
      light.current.position.copy(target.position).addScaledVector(SUN, 180);
      target.updateMatrixWorld();
    }
  });
  return <>
    <fog attach="fog" args={[HAZE, quality === "low" || quality === "performance" ? 150 : 210, 490]} />
    <mesh ref={dome} renderOrder={-100} frustumCulled={false}>
      <sphereGeometry args={[460, 32, 16]} />
      <shaderMaterial vertexShader={skyVertex} fragmentShader={skyFragment} uniforms={uniforms} side={THREE.BackSide} depthWrite={false} />
    </mesh>
    <hemisphereLight args={["#dce8f5", "#68654b", 1.35]} />
    <primitive object={target} />
    <directionalLight ref={light} target={target} color="#fff0d4" intensity={2.7}
      castShadow={quality === "high" || quality === "medium"}
      shadow-camera-left={-75} shadow-camera-right={75} shadow-camera-top={75} shadow-camera-bottom={-75}
      shadow-camera-near={50} shadow-camera-far={300} shadow-bias={-0.00015} shadow-normalBias={0.045}
      shadow-mapSize-width={quality === "high" ? 2048 : 1024} shadow-mapSize-height={quality === "high" ? 2048 : 1024} />
  </>;
}

type Plant = { position: THREE.Vector3; scale: number; rotation: number; color: THREE.Color };
function SliceForest({ track, quality, ground }: { track: TrackInfo; quality: GraphicsQuality; ground: THREE.BufferGeometry[] }) {
  const refs = useRef<(THREE.InstancedMesh | null)[]>([]);
  const count = quality === "high" ? 170 : quality === "medium" ? 115 : quality === "low" ? 65 : 32;
  const plants = useMemo(() => {
    const random = randomSequence(260906);
    const output: Plant[] = [];
    const groundMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const surfaces = ground.map(g => new THREE.Mesh(g, groundMaterial));
    const ray = new THREE.Raycaster();
    for (let i = 0; i < count; i++) {
      const pose = sampleTrack(track, SLICE_START + random() * (SLICE_END - SLICE_START));
      const side = random() > 0.5 ? 1 : -1;
      const offset = TRACK_WIDTH / 2 + 13 + random() ** 1.4 * 86;
      const p = pose.center.clone().addScaledVector(pose.normal, side * offset).addScaledVector(pose.tangent, (random() - 0.5) * 20);
      if (roadDistance(track, p.x, p.z) < TRACK_WIDTH / 2 + 10) continue;
      // Anchor every base to the actual sloping verge, including scattered shrubs.
      const small = offset < 49;
      ray.set(new THREE.Vector3(p.x, 20, p.z), new THREE.Vector3(0, -1, 0));
      p.y = (ray.intersectObjects(surfaces, false)[0]?.point.y ?? -0.02) - 0.03;
      output.push({ position: p, scale: small ? 0.4 + random() * 0.4 : 0.9 + random() * 1.0,
        rotation: random() * Math.PI * 2, color: new THREE.Color().setHSL(0.24 + random() * 0.055, 0.3 + random() * 0.2, 0.08 + random() * 0.075) });
    }
    groundMaterial.dispose();
    return output;
  }, [count, track, ground]);
  const geometries = useMemo(() => {
    const trunk = new THREE.CylinderGeometry(0.22, 0.38, 5, 6).translate(0, 2.5, 0);
    const tiers = Array.from({ length: 7 }, (_, i) => {
      const g = new THREE.ConeGeometry(2.65 - i * 0.31, 3.4 - i * 0.18, 16, 2);
      const p = g.getAttribute("position");
      for (let j = 0; j < p.count; j++) {
        const angle = Math.atan2(p.getZ(j), p.getX(j));
        const branch = 1 + 0.18 * Math.sin(angle * 7 + i * 2.1) + 0.08 * Math.cos(angle * 3 - i);
        p.setXYZ(j, p.getX(j) * branch, p.getY(j) + Math.sin(angle * 5 + i) * 0.15, p.getZ(j) * branch);
      }
      g.rotateY(i * 1.9);
      g.translate(Math.sin(i * 2.3) * 0.18, 3.5 + i * 0.87, Math.cos(i) * 0.12);
      g.computeVertexNormals();
      return g;
    });
    const near = mergeGeometries(tiers)!;
    tiers.forEach(g => g.dispose());
    const midParts = [0, 1, 2].map(i => new THREE.ConeGeometry(2.5 - i * 0.6, 4.6 - i * 0.45, 6).translate(0, 3.4 + i * 1.9, 0));
    const farParts = [0, 1].map(i => new THREE.ConeGeometry(2.5 - i * 0.8, 6 - i, 4).translate(0, 3.8 + i * 2.5, 0));
    const mid = mergeGeometries(midParts)!;
    const far = mergeGeometries(farParts)!;
    [...midParts, ...farParts].forEach(g => g.dispose());
    return [trunk, near, mid, far];
  }, []);
  useEffect(() => () => geometries.forEach(g => g.dispose()), [geometries]);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const last = useRef(-10);
  useFrame(({ camera, clock }) => {
    if (clock.elapsedTime - last.current < 0.5) return;
    last.current = clock.elapsedTime;
    const counts = [0, 0, 0, 0];
    const maxDistance = quality === "high" ? 300 : quality === "medium" ? 240 : 160;
    for (const p of plants) {
      const distance = p.position.distanceTo(camera.position);
      if (distance > maxDistance) continue;
      const tier = distance < 85 ? 1 : distance < 160 ? 2 : 3;
      dummy.position.copy(p.position); dummy.rotation.set(0, p.rotation, 0); dummy.scale.setScalar(p.scale); dummy.updateMatrix();
      const mesh = refs.current[tier];
      mesh?.setMatrixAt(counts[tier], dummy.matrix); mesh?.setColorAt(counts[tier]++, p.color);
      if (tier === 1) refs.current[0]?.setMatrixAt(counts[0]++, dummy.matrix);
    }
    refs.current.forEach((m, i) => {
      if (!m) return;
      m.count = counts[i]; m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      m.computeBoundingSphere();
    });
  });
  return <>{geometries.map((g, i) => <instancedMesh key={i} ref={m => { refs.current[i] = m; }} args={[g, undefined, plants.length]}
    castShadow={i < 2 && (quality === "high" || quality === "medium")} receiveShadow={i < 2}>
    <meshStandardMaterial color={i === 0 ? "#615044" : "#ffffff"} roughness={0.95} />
  </instancedMesh>)}</>;
}

export function BenchmarkLandscape({ track, quality }: { track: TrackInfo; quality: GraphicsQuality }) {
  const surface = useMemo(() => makeTerrainMaterial(), []);
  useEffect(() => () => surface.dispose(), [surface]);
  const geometry = useMemo(() => {
    const detail = quality === "high" ? 24 : quality === "medium" ? 18 : 12;
    const near = [createVerge(track, -1), createVerge(track, 1)];
    const middle = [[270, -45, 80, 67, 115], [210, -200, 106, 83, 73], [-205, -220, 95, 63, 78], [-300, 70, 74, 55, 90]];
    const far = [[340, -205, 120, 106, 120], [70, -340, 135, 112, 80], [-330, -200, 90, 98, 100], [325, 200, 100, 73, 100]];
    const mountains = [...middle, ...far].map(([x, z, w, h, d], i) => {
      const g = createMountain(13 + i * 4.7, w, h, d, i < 4 ? detail : 10);
      g.translate(x, 0, z);
      if (i >= 4) {
        const c = g.getAttribute("color"); const haze = new THREE.Color("#8caaa9");
        for (let n = 0; n < c.count; n++) { const col = new THREE.Color(c.getX(n), c.getY(n), c.getZ(n)).lerp(haze, 0.56); c.setXYZ(n, col.r, col.g, col.b); }
      }
      return g;
    });
    return { near, mountains };
  }, [track, quality]);
  useEffect(() => () => [...geometry.near, ...geometry.mountains].forEach(g => g.dispose()), [geometry]);
  return <>
    {geometry.near.map((g, i) => <mesh key={`verge-${i}`} geometry={g} material={surface.material} receiveShadow />)}
    {geometry.mountains.map((g, i) => <mesh key={`mountain-${i}`} geometry={g} material={surface.material} receiveShadow={i < 4} />)}
    <SliceForest track={track} quality={quality} ground={geometry.near} />
  </>;
}

export function RoadWear({ track }: { track: TrackInfo }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const dummy = new THREE.Object3D(); const random = randomSequence(881);
    for (let i = 0; i < 12; i++) {
      const pose = sampleTrack(track, 0.94 + random() * 0.22);
      dummy.position.copy(pose.center).addScaledVector(pose.normal, (random() - 0.5) * 17);
      dummy.position.y = 0.063;
      dummy.rotation.set(-Math.PI / 2, 0, -Math.atan2(pose.tangent.x, pose.tangent.z) + (random() - 0.5) * 0.2);
      dummy.scale.set(i < 3 ? 1.2 + random() : 0.13, i < 3 ? 2.4 : 4 + random() * 5, 1);
      dummy.updateMatrix(); ref.current?.setMatrixAt(i, dummy.matrix);
    }
    if (ref.current) { ref.current.instanceMatrix.needsUpdate = true; ref.current.computeBoundingSphere(); }
  }, [track]);
  return <instancedMesh ref={ref} args={[undefined, undefined, 12]} receiveShadow>
    <planeGeometry />
    <meshStandardMaterial color="#252829" roughness={0.92} transparent opacity={0.22} depthWrite={false} polygonOffset polygonOffsetFactor={-1} />
  </instancedMesh>;
}
