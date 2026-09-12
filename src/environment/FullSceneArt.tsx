import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { nearestTrackSample, sampleTrack, type TrackInfo } from '../game/track';
import { randomSequence } from './benchmarkGeometry';
import type { GraphicsQuality } from '../game/types';

type Building={asset:string;position:THREE.Vector3;heading:number;scale:THREE.Vector3};
export function makeLandSurface(kind:'land'|'field'|'paving'='land'){
  const random=randomSequence(59103),data=new Uint8Array(128*128*4);
  for(let i=0;i<128*128;i++){const n=Math.floor(random()*255);data.set([n,n,n,255],i*4);}
  const noise=new THREE.DataTexture(data,128,128);noise.wrapS=noise.wrapT=THREE.RepeatWrapping;noise.minFilter=THREE.LinearMipmapLinearFilter;noise.magFilter=THREE.LinearFilter;noise.generateMipmaps=true;noise.needsUpdate=true;
  const material=new THREE.MeshStandardMaterial({roughness:.98,side:THREE.DoubleSide,vertexColors:kind==='field'});
  material.onBeforeCompile=s=>{
    s.uniforms.landNoise={value:noise};
    s.vertexShader='varying vec3 sceneLand; varying vec3 sceneSlope;\n'+s.vertexShader;
    s.vertexShader=s.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nsceneLand=(modelMatrix*vec4(position,1.0)).xyz;sceneSlope=mat3(modelMatrix)*normal;');
    s.fragmentShader='uniform sampler2D landNoise; varying vec3 sceneLand; varying vec3 sceneSlope; float landRelief;\n'+s.fragmentShader;
    s.fragmentShader=s.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      float broad=texture2D(landNoise,sceneLand.xz*.00012).r;
      float landPatch=texture2D(landNoise,sceneLand.xz*.0015).r;
      float fine=texture2D(landNoise,sceneLand.xz*.025).r;
      float slope=1.0-abs(normalize(sceneSlope).y);
      vec3 grass=mix(vec3(.075,.105,.035),vec3(.13,.15,.068),broad);
      vec3 earth=mix(vec3(.15,.119,.074),vec3(.24,.21,.14),landPatch);
      vec3 stone=vec3(.26,.27,.23);
      vec3 land=mix(grass,earth,smoothstep(.55,.82,broad*.7+landPatch*.4));
      land=mix(land,stone,smoothstep(.18,.65,slope));
      ${kind==='paving'?'land=mix(earth,vec3(.24,.23,.19),.5);':kind==='field'?'land=mix(land,diffuseColor.rgb*.7,.55);':''}
      diffuseColor.rgb=land*(.88+.22*fine);
      landRelief=fine*.035*(1.0-smoothstep(50.0,180.0,length(vViewPosition)));`);
    s.fragmentShader=s.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
      vec3 dx=dFdx(-vViewPosition),dy=dFdy(-vViewPosition),rx=cross(dy,normal),ry=cross(normal,dx);float det=dot(dx,rx);
      normal=normalize(abs(det)*normal-sign(det)*(dFdx(landRelief)*rx+dFdy(landRelief)*ry));`);
  };material.customProgramCacheKey=()=> 'whole-scene-land-'+kind;
  return {material,dispose(){material.dispose();noise.dispose();}};
}
export function FullSceneGround(){
  const surface=useMemo(()=>makeLandSurface(),[]);useEffect(()=>()=>surface.dispose(),[surface]);
  return <mesh name="whole-scene-ground" rotation={[-Math.PI/2,0,0]} position={[0,-.02,0]} material={surface.material} receiveShadow><planeGeometry args={[1200,1200]}/></mesh>;
}
export function landscapeHeight(track:TrackInfo,point:THREE.Vector3){const n=nearestTrackSample(track,point);return n.sample.center.y*THREE.MathUtils.clamp((80-Math.abs(n.lateral))/48,0,1)-.035;}
export function scenePlanting(track:TrackInfo,buildings:Building[]){
  const random=randomSequence(83719),trees:{position:THREE.Vector3;scale:number;heading:number;species:number}[]=[];
  const houses=buildings.filter(p=>/chalet|barn|church|warehouse|garage|tank/.test(p.asset));
  for(const progress of [.118,.152,.184,.509,.534,.574,.603,.632,.661,.687,.718,.759,.787,.913,.95,.98])for(let j=0;j<7;j++){
    const p=sampleTrack(track,progress+(random()-.5)*.015),side=j%2?1:-1,position=p.center.clone().addScaledVector(p.normal,side*(43+random()*42));
    if(Math.abs(nearestTrackSample(track,position).lateral)<30||houses.some(h=>h.position.distanceToSquared(position)<19*19))continue;
    position.y=landscapeHeight(track,position);trees.push({position,scale:.5+random()*.45,heading:random()*6.28,species:j%4});
  }
  for(const h of houses.filter(h=>/chalet|barn|church/.test(h.asset)))for(let j=0;j<4;j++){
    const a=j*1.7+h.heading,position=h.position.clone().add(new THREE.Vector3(Math.sin(a)*12,0,Math.cos(a)*12));
    if(Math.abs(nearestTrackSample(track,position).lateral)<26||houses.some(other=>other!==h&&other.position.distanceToSquared(position)<100))continue;
    position.y=landscapeHeight(track,position);trees.push({position,scale:.12+random()*.09,heading:a,species:3});
  }
  return trees;
}
export function settlementPaths(track:TrackInfo,buildings:Building[]){
  const v:number[]=[],ix:number[]=[];
  for(const h of buildings.filter(b=>/chalet|barn|church|garage|warehouse/.test(b.asset))){
    const toward=new THREE.Vector3(0,0,-1).applyAxisAngle(new THREE.Vector3(0,1,0),h.heading);
    const start=h.position.clone().addScaledVector(toward,7*h.scale.z),n=nearestTrackSample(track,h.position);
    const end=n.sample.center.clone().lerp(h.position,Math.min(1,24/Math.max(24,Math.abs(n.lateral))));
    const direction=end.clone().sub(start).normalize(),side=new THREE.Vector3(-direction.z,0,direction.x),base=v.length/3;
    for(let i=0;i<=8;i++)for(const sign of [-1,1]){const p=start.clone().lerp(end,i/8).addScaledVector(side,sign*(1.05+.25*Math.sin(i*.8)));p.y=landscapeHeight(track,p)+.14;v.push(p.x,p.y,p.z);}
    for(let i=0;i<8;i++){const k=base+i*2;ix.push(k,k+2,k+1,k+1,k+2,k+3);}
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(v,3));g.setIndex(ix);g.computeVertexNormals();return g;
}
export function FullSceneDetails({track,quality,buildings}:{track:TrackInfo;quality:GraphicsQuality;buildings:Building[]}){
  const forest=useLoader(GLTFLoader,`${import.meta.env.BASE_URL}assets/environment/forest-v1.glb`);
  const planting=useMemo(()=>scenePlanting(track,buildings),[track,buildings]);
  const paths=useMemo(()=>settlementPaths(track,buildings),[track,buildings]),surface=useMemo(()=>makeLandSurface('paving'),[]);
  useEffect(()=>()=>{paths.dispose();},[paths]);useEffect(()=>()=>surface.dispose(),[surface]);
  const assets=useMemo(()=>{forest.scene.updateMatrixWorld(true);return ['alpine_spruce','scots_pine','silver_fir','mountain_pine'].flatMap(name=>[1,2].map(l=>{const m=forest.scene.getObjectByName(`${name}_lod${l}`) as THREE.Mesh;return {geometry:m.geometry.clone().applyMatrix4(m.matrixWorld),material:m.material as THREE.Material};}));},[forest]);
  const refs=useRef<(THREE.InstancedMesh|null)[]>([]),work=useMemo(()=>({last:-1,dummy:new THREE.Object3D()}),[]);
  useEffect(()=>()=>assets.forEach(a=>a.geometry.dispose()),[assets]);
  useEffect(()=>{const meshes=refs.current.slice();return()=>meshes.forEach(m=>m?.dispose());},[assets]);
  useFrame(({camera,clock})=>{if(clock.elapsedTime-work.last<.25)return;work.last=clock.elapsedTime;const counts=Array(8).fill(0);
    for(const p of planting){const distance=p.position.distanceTo(camera.position);if(distance>(quality==='gpu'?310:220))continue;const index=p.species*2+(distance<105?0:1),d=work.dummy;d.position.copy(p.position);d.rotation.set(0,p.heading,0);d.scale.setScalar(p.scale);d.updateMatrix();refs.current[index]?.setMatrixAt(counts[index]++,d.matrix);}
    refs.current.forEach((m,i)=>{if(m){m.count=counts[i];m.instanceMatrix.needsUpdate=true;m.computeBoundingSphere();}});
  });
  return <group name="whole-scene-details"><mesh geometry={paths} material={surface.material} receiveShadow/>{assets.map((a,i)=><instancedMesh key={i} ref={m=>{refs.current[i]=m;}} args={[a.geometry,a.material,planting.length]} dispose={null} receiveShadow/>)}</group>;
}
export function NaturalForest({trees,castShadow,cutoff=260}:{trees:{position:THREE.Vector3;rotation:number;scale:number}[];castShadow:boolean;cutoff?:number}){
  const forest=useLoader(GLTFLoader,`${import.meta.env.BASE_URL}assets/environment/forest-v1.glb`);
  const assets=useMemo(()=>{forest.scene.updateMatrixWorld(true);return [1,2].map(l=>{const m=forest.scene.getObjectByName(`scots_pine_lod${l}`) as THREE.Mesh;return {geometry:m.geometry.clone().applyMatrix4(m.matrixWorld).scale(.72,.72,.72),material:m.material as THREE.Material};});},[forest]);
  const refs=useRef<(THREE.InstancedMesh|null)[]>([]),work=useMemo(()=>({last:-1,dummy:new THREE.Object3D()}),[]);
  useEffect(()=>()=>assets.forEach(a=>a.geometry.dispose()),[assets]);useEffect(()=>{const instances=refs.current.slice();return()=>instances.forEach(m=>m?.dispose());},[assets]);
  useFrame(({camera,clock})=>{if(clock.elapsedTime-work.last<.22)return;work.last=clock.elapsedTime;const counts=[0,0];for(const t of trees){const distance=t.position.distanceTo(camera.position);if(distance>cutoff)continue;const i=distance<95?0:1,d=work.dummy;d.position.copy(t.position);d.rotation.set(0,t.rotation,0);d.scale.setScalar(t.scale);d.updateMatrix();refs.current[i]?.setMatrixAt(counts[i]++,d.matrix);}refs.current.forEach((m,i)=>{if(m){m.count=counts[i];m.instanceMatrix.needsUpdate=true;m.computeBoundingSphere();}});});
  return <group name="natural-base-forest">{assets.map((a,i)=><instancedMesh key={i} ref={m=>{refs.current[i]=m;}} args={[a.geometry,a.material,trees.length]} dispose={null} castShadow={castShadow&&i===0} receiveShadow/>)}</group>;
}
