import { useFrame, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { NaturalForest } from "./FullSceneArt";
import { sampleTrack, nearestTrackSample, TRACK_WIDTH, type TrackInfo } from "../game/track";
import type { GraphicsQuality } from "../game/types";
import { createMountain, createVerge, randomSequence, roadDistance, SLICE_START, SLICE_END } from "./benchmarkGeometry";
import { makeTerrainMaterial } from "./terrainMaterial";
import { qualityPresets } from "../qualityPresets";
import { makeGpuTerrainMaterial } from "./gpuTerrainMaterial";
import { GpuForest, GpuRidges, GpuRoadside } from "./GpuEnvironment";

import { TUNNEL, zoneAt } from "../game/trackZones";

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

export function BenchmarkAtmosphere({ quality, track }: { quality: GraphicsQuality; track: TrackInfo }) {
  const preset = qualityPresets[quality], settings = preset.environment;
  const sun = useMemo(() => new THREE.Vector3(...settings.sun).normalize(), [settings.sun]);
  const dome = useRef<THREE.Mesh>(null);
  const light = useRef<THREE.DirectionalLight>(null);
  const ambient = useRef<THREE.HemisphereLight>(null);
  const target = useMemo(() => new THREE.Object3D(), []);
  const uniforms = useMemo(() => ({ sun: { value: sun } }), [sun]);
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
  useFrame(({ camera }, dt) => {
    const nearest=nearestTrackSample(track,camera.position);
    const p=nearest.progress;
    const tunnelBlend=Math.abs(nearest.lateral)<19 && camera.position.y<nearest.sample.center.y+10
      ? THREE.MathUtils.smoothstep(p,TUNNEL.start-.004,TUNNEL.start+.01)*(1-THREE.MathUtils.smoothstep(p,TUNNEL.end-.01,TUNNEL.end+.004)) : 0;
    if(light.current)light.current.intensity=THREE.MathUtils.damp(light.current.intensity,settings.sunIntensity*(1-.94*tunnelBlend),5,dt);
    if(ambient.current)ambient.current.intensity=THREE.MathUtils.damp(ambient.current.intensity,settings.hemisphere*(1-.83*tunnelBlend),5,dt);
    dome.current?.position.copy(camera.position);
    if (light.current) {
      // Tight, camera-following shadow volume; snap the target to shadow texels.
      const texel = settings.shadowExtent * 2 / settings.shadowSize;
      target.position.set(Math.round(camera.position.x / texel) * texel, 0, Math.round(camera.position.z / texel) * texel);
      light.current.position.copy(target.position).addScaledVector(sun, 180);
      target.updateMatrixWorld();
    }
  });
  return <>
    <fog attach="fog" args={[HAZE, settings.fogNear, settings.fogFar]} />
    <mesh ref={dome} renderOrder={-100} frustumCulled={false}>
      <sphereGeometry args={[settings.skyRadius, 32, 16]} />
      <shaderMaterial vertexShader={skyVertex} fragmentShader={skyFragment} uniforms={uniforms} side={THREE.BackSide} depthWrite={false} />
    </mesh>
    <hemisphereLight ref={ambient} args={["#dce8f5", "#68654b", settings.hemisphere]} />
    <primitive object={target} />
    <directionalLight key={settings.shadowSize} ref={light} target={target} color="#fff0d4" intensity={settings.sunIntensity}
      castShadow={preset.shadows}
      shadow-camera-left={-settings.shadowExtent} shadow-camera-right={settings.shadowExtent} shadow-camera-top={settings.shadowExtent} shadow-camera-bottom={-settings.shadowExtent}
      shadow-camera-near={50} shadow-camera-far={300} shadow-bias={-0.00015} shadow-normalBias={0.045}
      shadow-mapSize-width={settings.shadowSize} shadow-mapSize-height={settings.shadowSize} />
  </>;
}

type Plant = { position: THREE.Vector3; scale: number; rotation: number; color: THREE.Color };
function SliceForest({ track, quality, ground }: { track: TrackInfo; quality: GraphicsQuality; ground: THREE.BufferGeometry[] }) {
  const count = qualityPresets[quality].environment.slicePlants;
  const plants = useMemo(() => {
    const random = randomSequence(260906);
    const output: Plant[] = [];
    const groundMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const surfaces = ground.map(g => new THREE.Mesh(g, groundMaterial));
    const ray = new THREE.Raycaster();
    for (let i = 0; i < count; i++) {
      const pose = sampleTrack(track, SLICE_START + random() * (SLICE_END - SLICE_START));
      if(random()>zoneAt(pose.progress).trees) continue;
      const side = random() > 0.5 ? 1 : -1;
      const offset = TRACK_WIDTH / 2 + 13 + random() ** 1.4 * 86;
      const p = pose.center.clone().addScaledVector(pose.normal, side * offset).addScaledVector(pose.tangent, (random() - 0.5) * 20);
      if (roadDistance(track, p.x, p.z) < TRACK_WIDTH / 2 + 10) continue;
      // Anchor every base to the actual sloping verge, including scattered shrubs.
      const small = offset < 49;
      ray.set(new THREE.Vector3(p.x, 20, p.z), new THREE.Vector3(0, -1, 0));
      p.y = Math.max(ray.intersectObjects(surfaces, false)[0]?.point.y ?? -0.02,
        pose.center.y*THREE.MathUtils.clamp((80-offset)/48,0,1)) - 0.03;
      output.push({ position: p, scale: small ? 0.4 + random() * 0.4 : 0.9 + random() * 1.0,
        rotation: random() * Math.PI * 2, color: new THREE.Color().setHSL(0.24 + random() * 0.055, 0.3 + random() * 0.2, 0.08 + random() * 0.075) });
    }
    groundMaterial.dispose();
    return output;
  }, [count, track, ground]);
  return <Suspense fallback={null}><NaturalForest trees={plants} castShadow={qualityPresets[quality].shadows} cutoff={qualityPresets[quality].environment.plantCutoff} /></Suspense>;
}

export function BenchmarkLandscape({ track, quality }: { track: TrackInfo; quality: GraphicsQuality }) {
  const preset = qualityPresets[quality];
  const surface = useMemo(() => preset.enhancedEnvironment ? makeGpuTerrainMaterial() : makeTerrainMaterial(), [preset.enhancedEnvironment]);
  useEffect(() => () => surface.dispose(), [surface]);
  const geometry = useMemo(() => {
    const detail = preset.environment.mountainDetail;
    const near = [createVerge(track, -1), createVerge(track, 1)];
    const middle = [[270, -45, 80, 67, 115], [210, -200, 106, 83, 73], [-205, -220, 95, 63, 78], [-300, 70, 74, 55, 90]];
    const far = [[340, -205, 120, 106, 120], [70, -340, 135, 112, 80], [-330, -200, 90, 98, 100], [325, 200, 100, 73, 100]];
    const mountains = [...middle, ...far].map(([x, z, w, h, d], i) => {
      const g = createMountain(13 + i * 4.7, w, h, d, i < 4 ? detail : 10);
      // Keep accepted mountain geometry, relocate only where expanded road needs clearance.
      let px=x, pz=z;
      const direction=new THREE.Vector2(x+100,z+70).normalize();
      for(let attempt=0;attempt<100 && roadDistance(track,px,pz)<Math.max(w,d)*1.25+32;attempt++) {px+=direction.x*12;pz+=direction.y*12;}
      g.translate(px, 0, pz);
      if (i >= 4) {
        const c = g.getAttribute("color"); const haze = new THREE.Color("#8caaa9");
        for (let n = 0; n < c.count; n++) { const col = new THREE.Color(c.getX(n), c.getY(n), c.getZ(n)).lerp(haze, 0.56); c.setXYZ(n, col.r, col.g, col.b); }
      }
      return g;
    });
    return { near, mountains };
  }, [track, preset.environment.mountainDetail]);
  useEffect(() => () => [...geometry.near, ...geometry.mountains].forEach(g => g.dispose()), [geometry]);
  const ground = useMemo(() => [...geometry.near, ...geometry.mountains], [geometry]);
  return <>
    {geometry.near.map((g, i) => <mesh key={`verge-${i}`} geometry={g} material={surface.material} receiveShadow />)}
    {geometry.mountains.map((g, i) => <mesh key={`mountain-${i}`} geometry={g} material={surface.material} receiveShadow={i < 4} />)}
    {preset.enhancedEnvironment ? <>
      <Suspense fallback={<SliceForest track={track} quality="high" ground={geometry.near} />}><GpuForest track={track} ground={ground} /></Suspense>
      <GpuRoadside track={track} ground={ground} />
      <GpuRidges track={track} />
    </> : <SliceForest track={track} quality={quality} ground={geometry.near} />}
  </>;
}

export function RoadWear({ track }: { track: TrackInfo }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const dummy = new THREE.Object3D(); const random = randomSequence(881);
    for (let i = 0; i < 12; i++) {
      const pose = sampleTrack(track, 0.94 + random() * 0.22);
      dummy.position.copy(pose.center).addScaledVector(pose.normal, (random() - 0.5) * 17);
      dummy.position.y = pose.center.y + 0.063;
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
