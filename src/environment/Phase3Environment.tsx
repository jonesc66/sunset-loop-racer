import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { sampleTrack, tangentHeading, nearestTrackSample, type TrackInfo } from '../game/track';
import { BRIDGE, TRACK_ZONES, TUNNEL } from '../game/trackZones';
import type { GraphicsQuality } from '../game/types';
import { makeLandSurface, FullSceneDetails } from './FullSceneArt';
import { Water, basin } from './Phase4AEnvironment';
import { roadDistance } from './benchmarkGeometry';

type Placement = { asset: string; position: THREE.Vector3; heading: number; pitch: number; scale: THREE.Vector3; detail: boolean };
export function environmentPlacements(track: TrackInfo) {
  const items: Placement[] = [];
  const put = (asset: string, progress: number, offset: number, scale = 1, detail = false, depth = 1) => {
    const pose = sampleTrack(track, progress);
    const position = pose.center.clone().addScaledVector(pose.normal, offset);
    // Non-road props stay outside every road segment, not just their source segment.
    if (offset && roadDistance(track, position.x, position.z) < 29) return;
    if(offset) position.y *= THREE.MathUtils.clamp((80-Math.abs(offset))/48,0,1);
    if(progress>=.3 && progress<.4 && offset>0) position.y=0;
    const ahead=sampleTrack(track,progress+.001), behind=sampleTrack(track,progress-.001);
    const pitch=offset?0:-Math.atan2(ahead.center.y-behind.center.y,Math.hypot(ahead.center.x-behind.center.x,ahead.center.z-behind.center.z));
    const facesRoad=['chalet','barn','church','garage','warehouse'].includes(asset);
    items.push({ asset, position, pitch, heading: tangentHeading(pose.tangent)+(facesRoad?Math.sign(offset)*Math.PI/2:0), scale: new THREE.Vector3(scale, scale, depth * scale), detail });
  };
  for (const [start,end,asset] of [[.115,.19,'fence'],[.61,.69,'fence'],[.71,.79,'pole']] as const)
    for(let p=start;p<end;p+=.009) put(asset,p,35);
  for(const p of [.13,.17,.62,.68]) { put('barn',p,62);put('hay',p+.012,40);put('chalet',p+.018,-55); }
  for(const p of [.21,.233,.257,.28]) { put('cliff',p,35);put('rock',p,-32);put('rock',p+.009,42,1,true); }
  for(let p=.31;p<.396;p+=.013) put('rock',p,35,.8);
  for(const p of [.516,.545,.579]) { put('chalet',p,40);put('chalet',p+.013,-44);put('utility',p+.007,29); }
  put('church',.563,65);put('garage',.59,-40);
  for(const p of [.722,.757]) { put('warehouse',p,49);put('tank',p+.018,38);put('utility',p-.008,-30); }
  put('garage',.782,43);
  for(let p=.905;p<.978;p+=.018) {put('alpine',p,45);put('rock',p,-35);put('rock',p+.007,-43,1.2,true);}
  const modules = (asset: string, start: number, end: number, size: number) => {
    const n=Math.ceil((end-start)*track.length/size);
    for(let i=0;i<n;i++) put(asset,start+(i+.5)/n*(end-start),0,1,false,((end-start)*track.length/n+3)/size);
  };
  modules('bridge',BRIDGE.start,BRIDGE.end,10);
  modules('tunnel',TUNNEL.start,TUNNEL.end,6);
  put('portal',TUNNEL.start,0);put('portal',TUNNEL.end,0);
  for(let p=.805;p<.896;p+=.018) {put('cliff',p,44);put('cliff',p,-44);}
  for (const z of TRACK_ZONES) if(z.id!=='A' && z.id!=='I' && z.id!=='E')
    for(let i=0;i<12;i++) put('rock',z.start+.007+i*.0075,(i%2?1:-1)*(33+i%4*5),.3+(i%3)*.15,true);
  return items;
}

function AssetBatch({ mesh, items, lod, gpu }: { mesh: THREE.Mesh; items: Placement[]; lod: number; gpu: boolean }) {
  const ref=useRef<THREE.InstancedMesh>(null);
  const geometry=useMemo(()=>mesh.geometry.clone().applyMatrix4(mesh.matrixWorld),[mesh]);
  const material=useMemo(()=>{
    const m=(mesh.material as THREE.MeshStandardMaterial).clone();
    if(/^(rock|cliff|alpine)/.test(mesh.name)){
      m.onBeforeCompile=shader=>{
        shader.vertexShader='varying vec3 rockPoint;\n'+shader.vertexShader;
        shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nrockPoint=position;');
        shader.fragmentShader='varying vec3 rockPoint;\n'+shader.fragmentShader;
        shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
          float layers=sin(rockPoint.y*2.8+sin(rockPoint.x*.65)*1.4+rockPoint.z*.18);
          float grain=fract(sin(dot(floor(rockPoint*22.0),vec3(12.9898,78.233,37.719)))*43758.5453);
          float macro=sin(rockPoint.x*.23+rockPoint.z*.31+cos(rockPoint.y*.29));
          diffuseColor.rgb *= .85 + .025*layers + .035*grain + .045*macro;`);
      };
      m.customProgramCacheKey=()=> 'phase3-rock-strata-v2';
    }
    if(/^(chalet|barn|church|garage|warehouse|tunnel|portal)/.test(mesh.name)){
      m.onBeforeCompile=shader=>{
        shader.vertexShader='varying vec3 buildingPoint;\n'+shader.vertexShader;
        shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nbuildingPoint=position;');
        shader.fragmentShader='varying vec3 buildingPoint;\n'+shader.fragmentShader;
        shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
          float grain=fract(sin(dot(floor(buildingPoint*48.0),vec3(12.9898,78.233,37.719)))*43758.5453);
          float rain=sin(buildingPoint.x*3.7+sin(buildingPoint.z*2.2))*.5+.5;
          float baseDamp=1.0-smoothstep(-.2,1.1,buildingPoint.y);
          diffuseColor.rgb*=.96+.035*grain-.09*baseDamp-.025*rain;`);
      };m.customProgramCacheKey=()=> 'phase3-building-weather-v1';
    }
    return m;
  },[mesh]);
  useEffect(()=>()=>material.dispose(),[material]);
  useEffect(()=>()=>geometry.dispose(),[geometry]);
  useEffect(()=>{const instance=ref.current;return ()=>{instance?.dispose();};},[]);
  const work=useMemo(()=>({dummy:new THREE.Object3D(),last:-1}),[]);
  useFrame(({camera,clock})=>{
    const m=ref.current;if(!m || clock.elapsedTime-work.last<.2)return;work.last=clock.elapsedTime;
    let count=0;
    for(const item of items){
      const distance=camera.position.distanceTo(item.position);
      if(distance>(gpu?440:300))continue;
      const selected=distance<(gpu?130:80)?0:distance<(gpu?260:170)?1:2;
      if(selected!==lod)continue;
      work.dummy.position.copy(item.position);work.dummy.rotation.set(item.pitch,item.heading,0,'YXZ');work.dummy.scale.copy(item.scale);work.dummy.updateMatrix();
      m.setMatrixAt(count++,work.dummy.matrix);
    }
    m.count=count;m.instanceMatrix.needsUpdate=true;m.computeBoundingSphere();
  });
  return <instancedMesh ref={ref} dispose={null} args={[geometry,material,items.length]} castShadow={lod===0&&(gpu||/^(chalet|barn|church|garage|warehouse)/.test(mesh.name))} receiveShadow />;
}

// Road embankments follow the same samples; the bridge opens onto the river below.
export function embankment(track: TrackInfo) {
  const v:number[]=[], ix:number[]=[];
  for(let i=0;i<track.samples.length;i++){
    const a=track.samples[i], b=track.samples[(i+1)%track.samples.length];
    if(a.progress>=.2&&a.progress<.5)continue; // Phase 4A owns local visual terrain only.
    if(a.progress>=BRIDGE.start&&a.progress<=BRIDGE.end)continue;
    for(const side of [-1,1]){
      const base=v.length/3;
      for(const pose of [a,b])for(const offset of [16.2,22,32,44,60,80]){
        const p=pose.center.clone().addScaledVector(pose.normal,side*offset);
        const lakeBank=pose.progress>=.3 && pose.progress<.4 && side===1;
        v.push(p.x,lakeBank && offset>=32?-.15:pose.center.y*THREE.MathUtils.clamp((80-offset)/48,0,1)-.035,p.z);
      }
      for(let j=0;j<5;j++)ix.push(base+j,base+j+6,base+j+1,base+j+1,base+j+6,base+j+7);
    }
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(v,3));g.setIndex(ix);g.computeVertexNormals();return g;
}

function fields(track: TrackInfo) {
  const vertices:number[]=[], colors:number[]=[], indices:number[]=[];
  for(const start of [.11,.61]) for(let i=0;i<36;i++) for(const side of [-1,1]){
    const base=vertices.length/3;
    const color=new THREE.Color(i%3===0?'#a69956':'#828446');
    for(const p of [start+i*.002,start+(i+1)*.002])for(const offset of [40,73]){
      const pose=sampleTrack(track,p), v=pose.center.clone().addScaledVector(pose.normal,side*offset);
      vertices.push(v.x,pose.center.y*(80-offset)/48+.06,v.z);colors.push(color.r,color.g,color.b);
    }
    indices.push(base,base+1,base+2,base+1,base+3,base+2);
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.setIndex(indices);g.computeVertexNormals();return g;
}

export function Phase3Environment({track,quality}:{track:TrackInfo;quality:GraphicsQuality}){
  const gltf=useLoader(GLTFLoader,`${import.meta.env.BASE_URL}assets/environment/phase3/environment-v1.glb`);
  const gpu=quality==='gpu';
  const placements=useMemo(()=>environmentPlacements(track),[track]);
  const landSurface=useMemo(()=>makeLandSurface(),[]),fieldSurface=useMemo(()=>makeLandSurface('field'),[]),bankSurface=useMemo(()=>makeLandSurface('paving'),[]);
  useEffect(()=>()=>{landSurface.dispose();fieldSurface.dispose();bankSurface.dispose();},[landSurface,fieldSurface,bankSurface]);
  const batches=useMemo(()=>{
    gltf.scene.updateMatrixWorld(true);
    const items=placements.filter(p=>{
      const progress=nearestTrackSample(track,p.position).progress;
      return (progress<.2||progress>=.5)&&(gpu||!p.detail);
    });
    return [...new Set(items.map(p=>p.asset))].flatMap(asset=>[0,1,2].map(lod=>{
      const mesh=gltf.scene.getObjectByName(`${asset}_lod${lod}`) as THREE.Mesh;
      if(!mesh?.isMesh)throw new Error(`Missing environment asset: ${asset}`);
      return {mesh,lod,items:items.filter(p=>p.asset===asset)};
    }));
  },[gltf,track,gpu,placements]);
  const ground=useMemo(()=>embankment(track),[track]);
  const farmland=useMemo(()=>fields(track),[track]);
  useEffect(()=>()=>farmland.dispose(),[farmland]);
  useEffect(()=>()=>ground.dispose(),[ground]);
  const channel=useMemo(()=>[basin(track,.76,-54,22,58,false),basin(track,.76,-54,22,58,true)],[track]);
  useEffect(()=>()=>channel.forEach(g=>g.dispose()),[channel]);
  return <group name="phase3-environment">
    <mesh geometry={ground} material={landSurface.material} receiveShadow/>
    <mesh geometry={farmland} material={fieldSurface.material} receiveShadow/>
    {batches.map(b=><AssetBatch key={`${b.mesh.name}-${gpu}`} {...b} gpu={gpu}/>)}
    <Water geometry={channel[0]}/><mesh geometry={channel[1]} material={bankSurface.material} receiveShadow/>
    <FullSceneDetails track={track} quality={quality} buildings={placements}/>
    {[.823,.845,.867].map(p=>{const pose=sampleTrack(track,p);return <group key={p} position={pose.center} rotation={[0,tangentHeading(pose.tangent),0]}>
      <pointLight position={[0,7,0]} color="#ffdfac" intensity={85} distance={32} decay={2}/>
      {[-12,12].map(x=><mesh key={x} position={[x,9.6,0]}><boxGeometry args={[1,.12,2]}/><meshBasicMaterial color="#ffe7ad" toneMapped={false}/></mesh>)}
    </group>;})}
  </group>;
}
