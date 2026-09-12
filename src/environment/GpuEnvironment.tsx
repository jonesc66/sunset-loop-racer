import { useFrame, useLoader } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { sampleTrack, TRACK_WIDTH, type TrackInfo } from "../game/track";
import { qualityPresets } from "../qualityPresets";
import { createMountain, randomSequence, roadDistance } from "./benchmarkGeometry";
import { makeGpuTerrainMaterial } from "./gpuTerrainMaterial";

import { zoneAt } from "../game/trackZones";

const config = qualityPresets.gpu;
const species = ["alpine_spruce", "scots_pine", "silver_fir", "mountain_pine"];
type Instance = { position: THREE.Vector3; scale: number; rotation: number; variant: number; color: THREE.Color; lod: number };

// Actual geometry anchoring includes the raised verge and existing mountain foothills.
function scatter(track: TrackInfo, surfaces: THREE.BufferGeometry[], count: number, small: boolean) {
  const random = randomSequence(small ? 18024 : 71021);
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const meshes = surfaces.map(g => new THREE.Mesh(g, material));
  const ray = new THREE.Raycaster();
  const output: Instance[] = [];
  for (let i=0;i<count;i++) {
    const pose=sampleTrack(track,random());
    if (random()>zoneAt(pose.progress).trees) continue;
    const offset=TRACK_WIDTH/2+(small ? 4+random()*24 : 9+random()**1.5*130);
    const p=pose.center.clone().addScaledVector(pose.normal,(random()>.5?1:-1)*offset).addScaledVector(pose.tangent,(random()-.5)*18);
    if(pose.progress>=.3 && pose.progress<.4 && p.clone().sub(pose.center).dot(pose.normal)>0)continue;
    if (roadDistance(track,p.x,p.z)<TRACK_WIDTH/2+(small?3.7:8)) continue;
    ray.set(new THREE.Vector3(p.x,170,p.z),new THREE.Vector3(0,-1,0));
    const hit=ray.intersectObjects(meshes,false)[0];
    if (hit && Math.abs(hit.face?.normal.y ?? 1)<.58) continue;
    p.y=Math.max(hit?.point.y ?? -.02,pose.center.y*THREE.MathUtils.clamp((80-offset)/48,0,1))-.035;
    output.push({position:p,scale:small ? .55+random()*.9 : .65+random()*.65,rotation:random()*Math.PI*2,variant:Math.floor(random()*(small?3:4)),lod:-1,
      color:new THREE.Color().setRGB(.82+random()*.26,.88+random()*.22,.78+random()*.22)});
  }
  material.dispose();
  return output;
}

export function GpuForest({track, ground}:{track:TrackInfo;ground:THREE.BufferGeometry[]}) {
  const gltf=useLoader(GLTFLoader,`${import.meta.env.BASE_URL}assets/environment/forest-v1.glb`);
  const assets=useMemo(()=>{
    gltf.scene.updateMatrixWorld(true);
    return species.flatMap(name=>[0,1,2].map(lod=>{
      const mesh=gltf.scene.getObjectByName(`${name}_lod${lod}`) as THREE.Mesh | undefined;
      if (!mesh?.isMesh) throw new Error(`Missing forest asset ${name} LOD ${lod}`);
      const geometry=mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
      const material=(mesh.material as THREE.MeshStandardMaterial).clone();
      material.roughness=.96;
      return {geometry,material};
    }));
  },[gltf]);
  useEffect(()=>()=>assets.forEach(a=>{a.geometry.dispose();a.material.dispose();}),[assets]);
  const plants=useMemo(()=>scatter(track,ground,config.forest.candidates,false),[track,ground]);
  const refs=useRef<(THREE.InstancedMesh|null)[]>([]);
  useEffect(()=>{
    // Capture mounted meshes before React clears their refs during unmount.
    const meshes=refs.current.slice();
    return ()=>meshes.forEach(mesh=>mesh?.dispose());
  },[assets,plants.length]);
  const work=useMemo(()=>({dummy:new THREE.Object3D(),frustum:new THREE.Frustum(),matrix:new THREE.Matrix4(),sphere:new THREE.Sphere(new THREE.Vector3(),24),last:-1}),[]);
  useFrame(({camera,clock})=>{
    if(clock.elapsedTime-work.last<.2) return;
    work.last=clock.elapsedTime;
    work.frustum.setFromProjectionMatrix(work.matrix.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
    const counts=Array(12).fill(0);
    for(const p of plants){
      const distance=p.position.distanceTo(camera.position);
      if(distance>config.forest.far) continue;
      work.sphere.center.copy(p.position).y+=8;
      // Allow near off-screen trees to continue casting into the visible road.
      if(distance>config.forest.shadow && !work.frustum.intersectsSphere(work.sphere))continue;
      let lod=distance<config.forest.near?0:distance<config.forest.mid?1:2;
      // Eight-metre hysteresis avoids flicker while hovering around a LOD boundary.
      if(p.lod===0&&distance<config.forest.near+8)lod=0;
      if(p.lod===1&&distance>config.forest.near-8&&distance<config.forest.mid+8)lod=1;
      if(p.lod===2&&distance>config.forest.mid-8)lod=2;
      p.lod=lod;
      const index=p.variant*3+lod, mesh=refs.current[index];
      work.dummy.position.copy(p.position);work.dummy.rotation.set(0,p.rotation,0);work.dummy.scale.set(p.scale,p.scale*(.92+.1*p.variant),p.scale);work.dummy.updateMatrix();
      mesh?.setMatrixAt(counts[index],work.dummy.matrix);mesh?.setColorAt(counts[index]++,p.color);
    }
    refs.current.forEach((m,i)=>{if(m){m.count=counts[i];m.instanceMatrix.needsUpdate=true;if(m.instanceColor)m.instanceColor.needsUpdate=true;m.computeBoundingSphere();}});
  });
  return <group name="gpu-forest" dispose={null}>{assets.map((a,i)=><instancedMesh key={i} ref={m=>{refs.current[i]=m;}} args={[a.geometry,a.material,plants.length]} castShadow={i%3===0} receiveShadow={i%3!==2} />)}</group>;
}

export function GpuGround(){
  const surface=useMemo(()=>makeGpuTerrainMaterial(true),[]);
  useEffect(()=>()=>surface.dispose(),[surface]);
  return <mesh rotation={[-Math.PI/2,0,0]} position={[0,-.02,0]} material={surface.material} receiveShadow><planeGeometry args={[1200,1200]} /></mesh>;
}

export function GpuRoadside({track,ground}:{track:TrackInfo;ground:THREE.BufferGeometry[]}){
  const plants=useMemo(()=>scatter(track,ground,config.ground.candidates,true),[track,ground]);
  const refs=useRef<(THREE.InstancedMesh|null)[]>([]);
  const geometry=useMemo(()=>{
    const parts=[0,1,2,3,4].map(i=>new THREE.IcosahedronGeometry(.45,1).scale(1,.65,1).translate(Math.sin(i*2.4)*.5,.42+Math.cos(i)*.1,Math.cos(i*2.4)*.5));
    const shrub=mergeGeometries(parts)!;parts.forEach(g=>g.dispose());
    const rock=new THREE.IcosahedronGeometry(.5,1).scale(1.3,.7,.9).translate(0,.23,0);
    const blades=Array.from({length:7},(_,i)=>new THREE.ConeGeometry(.09,.65,3).rotateZ(Math.sin(i)*.3).translate(Math.sin(i*2.4)*.32,.28,Math.cos(i*2.4)*.32));
    const grass=mergeGeometries(blades)!;blades.forEach(g=>g.dispose());
    return [shrub,rock,grass];
  },[]);
  useEffect(()=>()=>geometry.forEach(g=>g.dispose()),[geometry]);
  const work=useMemo(()=>({last:-1,dummy:new THREE.Object3D()}),[]);
  useFrame(({camera,clock})=>{
    if(clock.elapsedTime-work.last<.25)return;work.last=clock.elapsedTime;
    const counts=[0,0,0];
    for(const p of plants){if(p.position.distanceTo(camera.position)>config.ground.distance)continue;
      const d=work.dummy;d.position.copy(p.position);d.rotation.set(0,p.rotation,0);d.scale.setScalar(p.scale);d.updateMatrix();
      refs.current[p.variant]?.setMatrixAt(counts[p.variant]++,d.matrix);
    }
    refs.current.forEach((m,i)=>{if(m){m.count=counts[i];m.instanceMatrix.needsUpdate=true;m.computeBoundingSphere();}});
  });
  return <>{geometry.map((g,i)=><instancedMesh key={i} ref={m=>{refs.current[i]=m;}} args={[g,undefined,plants.length]} castShadow={i<2} receiveShadow><meshStandardMaterial color={["#435735","#777665","#8a8351"][i]} roughness={1}/></instancedMesh>)}</>;
}

export function GpuRidges({track}:{track:TrackInfo}){
  const geometry=useMemo(()=>{
    const parts=Array.from({length:10},(_,i)=>{
      const a=i*Math.PI*2/10;
      let radius=375;
      while(radius<950 && roadDistance(track,Math.cos(a)*radius,Math.sin(a)*radius)<155)radius+=15;
      return createMountain(81+i*7,95,42+(i%3)*16,64,8).rotateY(-a).translate(Math.cos(a)*radius,0,Math.sin(a)*radius);
    });
    const merged=mergeGeometries(parts)!;parts.forEach(g=>g.dispose());return merged;
  },[track]);
  useEffect(()=>()=>geometry.dispose(),[geometry]);
  return <mesh geometry={geometry}><meshStandardMaterial color="#93abaa" roughness={1}/></mesh>;
}
