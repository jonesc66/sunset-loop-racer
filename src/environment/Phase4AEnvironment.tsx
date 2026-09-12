import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { sampleTrack, tangentHeading, nearestTrackSample, type TrackInfo } from '../game/track';
import { BRIDGE } from '../game/trackZones';
import type { GraphicsQuality } from '../game/types';
import { createMaterialLibrary, TEXTURE_URLS, terrainMaterial } from './phase4aMaterials';

export type ArtPlacement={asset:string;position:THREE.Vector3;heading:number;pitch:number;scale:THREE.Vector3;detail:boolean};
export function phase4aPlacements(track:TrackInfo) {
  const items:ArtPlacement[]=[];
  const put=(asset:string,p:number,offset:number,scale=1,detail=false,depth=1,turn=0)=>{
    const s=sampleTrack(track,p),pos=s.center.clone().addScaledVector(s.normal,offset);
    if(offset && Math.abs(nearestTrackSample(track,pos).lateral)<25)return;
    if(offset)pos.y=p>=.3&&offset>0?0:s.center.y*THREE.MathUtils.clamp((80-Math.abs(offset))/48,0,1);
    const a=sampleTrack(track,p-.001).center,b=sampleTrack(track,p+.001).center;
    items.push({asset,position:pos,heading:tangentHeading(s.tangent)+turn,pitch:offset?0:-Math.atan2(b.y-a.y,Math.hypot(b.x-a.x,b.z-a.z)),scale:new THREE.Vector3(scale,scale,scale*depth),detail});
  };
  for(let i=0;i<7;i++){
    const p=.207+i*.014;
    put(i%2?'cliff-b':'cliff-a',p,39+2*Math.sin(i*2.3),.92+.12*Math.sin(i*1.8),false,1.48,Math.PI+.08*Math.sin(i));
    put('boulder',p-.006,28,.8,false,1,i*.8);
    for(let j=0;j<5;j++)put('rubble',p-.007+j*.0028,23.8+j%2*3,.5+j%3*.2,j%2===0,1,j);
  }
  for(let i=0;i<14;i++){
    const p=.304+i*.0068;
    put(i%3===0?'shore-shelf':'boulder',p,33+7*Math.sin(i*1.9),.35+(i%4)*.16,false,1,i*1.7);
    put('rubble',p+.002,27+3*Math.sin(i),.65,true,1,i);
  }
  const n=Math.ceil((BRIDGE.end-BRIDGE.start)*track.length/12),depth=((BRIDGE.end-BRIDGE.start)*track.length/n+.9)/12;
  for(let i=0;i<n;i++){
    const p=BRIDGE.start+(i+.5)/n*(BRIDGE.end-BRIDGE.start);
    put('deck',p,0,1,false,depth);put('railing',p,0,1,false,depth);
    if(i%2===0){put('pier',p,0);put('drain',p,0);}
  }
  for(const p of [.426,.466])for(const offset of [-105,-74,-43,44,76,108])put('shore-shelf',p+.001*Math.sin(offset),offset,.4+.18*Math.abs(Math.sin(offset)),false,1,offset*.17);
  put('abutment',BRIDGE.start,0);put('abutment',BRIDGE.end,0);
  for(const p of [.398,.493])for(const offset of [-32,32])put('shore-shelf',p,offset,1.1);
  return items;
}

function Batch({mesh,items,lod,material,gpu}:{mesh:THREE.Mesh;items:ArtPlacement[];lod:number;material:THREE.Material;gpu:boolean}){
  const ref=useRef<THREE.InstancedMesh>(null);
  const geometry=useMemo(()=>mesh.geometry.clone().applyMatrix4(mesh.matrixWorld),[mesh]);
  const work=useMemo(()=>({dummy:new THREE.Object3D(),last:-1}),[]);
  useEffect(()=>()=>geometry.dispose(),[geometry]);
  useEffect(()=>{const m=ref.current;return()=>{m?.dispose();};},[]);
  useFrame(({camera,clock})=>{
    const m=ref.current;if(!m||clock.elapsedTime-work.last<.18)return;work.last=clock.elapsedTime;
    let count=0;for(const p of items){
      const d=camera.position.distanceTo(p.position);if(d>(gpu?420:300))continue;
      if((d<(gpu?145:95)?0:d<(gpu?270:190)?1:2)!==lod)continue;
      work.dummy.position.copy(p.position);work.dummy.rotation.set(p.pitch,p.heading,0,'YXZ');work.dummy.scale.copy(p.scale);work.dummy.updateMatrix();m.setMatrixAt(count++,work.dummy.matrix);
    }m.count=count;m.instanceMatrix.needsUpdate=true;m.computeBoundingSphere();
  });
  const important=/cliff|pier|deck|boulder|shore-shelf/.test(mesh.name);
  return <instancedMesh name={mesh.name} ref={ref} args={[geometry,material,items.length]} dispose={null} receiveShadow castShadow={important&&lod===0}/>;
}

export function artTerrain(track:TrackInfo){
  const v:number[]=[],uv:number[]=[],ix:number[]=[];
  const lake=sampleTrack(track,.35),lakeCenter=lake.center.clone().addScaledVector(lake.normal,90);
  for(let i=120;i<300;i++){
    const a=track.samples[i],b=track.samples[(i+1)%track.samples.length];
    if(a.progress>=BRIDGE.start&&a.progress<=BRIDGE.end)continue;
    for(const side of [-1,1]){
      const base=v.length/3;const offsets=[16.2,19,21,23,25,27,30,34,38,42,50,60,80,105];
      for(const s of [a,b])for(const offset of offsets){
        const p=s.center.clone().addScaledVector(s.normal,side*offset);
        let y=s.center.y*THREE.MathUtils.clamp((80-offset)/48,0,1);
        if(side===1){
          const lakeBlend=THREE.MathUtils.smoothstep(s.progress,.295,.315)*(1-THREE.MathUtils.smoothstep(s.progress,.385,.405));
          const bank=offset<=19?s.center.y:offset<42?s.center.y*(42-offset)/23:0;
          y=THREE.MathUtils.lerp(y,bank,lakeBlend);
        }
        if(offset>23)y+=Math.sin(p.x*.13)*Math.cos(p.z*.17)*Math.min(.5,(offset-23)/30);
        const relative=p.clone().sub(lakeCenter),lx=relative.dot(lake.normal)/65,lz=relative.dot(lake.tangent)/94;
        const angle=Math.atan2(lz,lx),edge=1+.065*Math.sin(angle*5)+.035*Math.cos(angle*9);
        if(offset>23){
          const distance=Math.hypot(lx,lz);
          if(distance<edge)y=Math.min(y,.02);
          else y=THREE.MathUtils.lerp(Math.min(y,.02),y,THREE.MathUtils.smoothstep(distance,edge,edge+.16));
        }
        if(offset===16.2)y=s.center.y-.03;
        v.push(p.x,y-.025,p.z);uv.push(p.x/7,p.z/7);
      }
      for(let j=0;j<offsets.length-1;j++)ix.push(base+j,base+j+offsets.length,base+j+1,base+j+1,base+j+offsets.length,base+j+offsets.length+1);
    }
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(v,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(ix);g.computeVertexNormals();return g;
}

function basin(track:TrackInfo,p:number,offset:number,rx:number,rz:number,shore:boolean){
  const pose=sampleTrack(track,p),center=pose.center.clone().addScaledVector(pose.normal,offset),v:number[]=[],uv:number[]=[],ix:number[]=[];
  if(p>.4){
    const segments=170,rows=shore?2:25,depth:number[]=[];
    const along=offset===0?pose.normal:pose.tangent,across=offset===0?pose.tangent:pose.normal,length=offset===0?340:rz*2;
    for(const side of (shore?[-1,1]:[0])){
      const base=v.length/3;
      for(let i=0;i<=segments;i++){
        const t=i/segments,x=(t-.5)*length;
        const bend=10*Math.sin(t*5.2)-6*Math.sin(t*9.1);
        const width=(offset===0?21:rx*.45)*(1+.23*Math.sin(t*7.4+1)+.095*Math.sin(t*19));
        for(let j=0;j<rows;j++){
          const z=bend+(shore?side*(width+(j===0?-.7:7+2*Math.sin(t*24))):(j/(rows-1)*2-1)*width);
          const point=center.clone().addScaledVector(along,x).addScaledVector(across,z);
          v.push(point.x,shore?(j===0?.12:.48):.18,point.z);uv.push(point.x/4,point.z/4);depth.push(shore?0:Math.sin(Math.PI*j/(rows-1)));
        }
      }
      for(let i=0;i<segments;i++)for(let j=0;j<rows-1;j++){const k=base+i*rows+j;ix.push(k,k+rows,k+1,k+1,k+rows,k+rows+1);}
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(v,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setAttribute('waterDepth',new THREE.Float32BufferAttribute(depth,1));g.userData.flow=[along.x,along.z];g.setIndex(ix);g.computeVertexNormals();return g;
  }
  const n=96,rings=shore?2:21,depth:number[]=[];
  for(let ring=0;ring<rings;ring++)for(let i=0;i<=n;i++){
    const a=i/n*Math.PI*2,r=1+.065*Math.sin(a*5)+.035*Math.cos(a*9);
    const radius=shore?(ring===0?.95:1.07+.018*Math.sin(a*13)):ring/(rings-1);
    const x=Math.cos(a)*rx*r*radius,z=Math.sin(a)*rz*r*radius;
    const pos=center.clone().addScaledVector(pose.normal,x).addScaledVector(pose.tangent,z);
    v.push(pos.x,shore?(ring===0?.12:.28+.10*Math.sin(a*7)):.18,pos.z);uv.push(shore?pos.x/4:i/n,shore?pos.z/4:radius);depth.push(shore?0:1-radius);
  }
  for(let ring=0;ring<rings-1;ring++)for(let i=0;i<n;i++){const k=ring*(n+1)+i;ix.push(k,k+n+1,k+1,k+1,k+n+1,k+n+2);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(v,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setAttribute('waterDepth',new THREE.Float32BufferAttribute(depth,1));g.setIndex(ix);g.computeVertexNormals();return g;
}
const WATER_SURFACE_GLSL=`
  uniform float artTime;
  uniform float river;
  uniform vec2 flow;
  float waterHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
  float waterNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(waterHash(i),waterHash(i+vec2(1,0)),f.x),mix(waterHash(i+vec2(0,1)),waterHash(i+vec2(1,1)),f.x),f.y);}
  float swell(vec2 p){
    vec2 q=p-flow*artTime*.85;
    return mix(.3,1.0,river)*(.065*sin(dot(q,flow)*.55+1.2*sin(dot(q,vec2(-flow.y,flow.x))*.19))+.035*sin(q.x*.73+q.y*.48-artTime*.45));
  }
  float waterHeight(vec2 p){
    vec2 q=p-flow*artTime*.85;
    vec2 warp=vec2(waterNoise(q*.19),waterNoise(q*.17+31.0));
    return swell(p)+.028*waterNoise(q*.7+warp*2.0)+.012*waterNoise(q*1.9-warp)+.004*waterNoise(q*4.1);
  }
`;
function Water({geometry}:{geometry:THREE.BufferGeometry}){
  const time=useMemo(()=>({value:0}),[]);
  const material=useMemo(()=>{
    const isRiver=!!geometry.userData.flow;
    const m=new THREE.MeshStandardMaterial({color:'#367c82',roughness:.24,metalness:0,side:THREE.DoubleSide});
    m.onBeforeCompile=s=>{
      s.uniforms.artTime=time;s.uniforms.river={value:isRiver?1:0};s.uniforms.flow={value:new THREE.Vector2(...(geometry.userData.flow??[.85,.53]) as [number,number])};
      s.vertexShader=WATER_SURFACE_GLSL+'attribute float waterDepth; varying vec3 waterPoint; varying float channelDepth;\n'+s.vertexShader;
      s.vertexShader=s.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
        waterPoint=position;channelDepth=waterDepth;
        transformed.y+=swell(position.xz)*smoothstep(0.0,.28,channelDepth);`);
      s.fragmentShader=WATER_SURFACE_GLSL+'varying vec3 waterPoint; varying float channelDepth;\n'+s.fragmentShader;
      s.fragmentShader=s.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
        vec2 p=waterPoint.xz;float h=waterHeight(p);
        vec3 gradient=vec3((waterHeight(p+vec2(.08,0))-h)/.08,0.0,(waterHeight(p+vec2(0,.08))-h)/.08);
        normal=normalize(normal-mat3(viewMatrix)*gradient);`);
      s.fragmentShader=s.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
        vec2 moving=waterPoint.xz-flow*artTime*.85;
        float variation=waterNoise(moving*.10);
        float depth=smoothstep(.0,.75,channelDepth+.10*(variation-.5));
        vec3 shallow=vec3(.19,.29,.25),deep=vec3(.035,.15,.18);
        diffuseColor.rgb=mix(diffuseColor.rgb,mix(shallow,deep,depth),mix(.5,.85,river));
        float broken=waterNoise(moving*.7+vec2(waterNoise(moving*.13)*3.0));
        float crest=smoothstep(.60,.80,broken)*smoothstep(.025,.11,channelDepth)*(1.0-smoothstep(.12,.42,channelDepth));
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.56,.65,.61),crest*river*.42);`);
    };m.customProgramCacheKey=()=> 'phase4a-water-v3';return m;
  },[time,geometry]);
  useFrame((_,dt)=>{time.value+=dt;});useEffect(()=>()=>material.dispose(),[material]);
  return <mesh geometry={geometry} material={material} receiveShadow/>;
}

function VegetationComposition({track,gpu}:{track:TrackInfo;gpu:boolean}){
  const forest=useLoader(GLTFLoader,`${import.meta.env.BASE_URL}assets/environment/forest-v1.glb`);
  const items=useMemo(()=>{
    const ground=new THREE.Mesh(artTerrain(track),new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));ground.updateMatrixWorld();
    const ray=new THREE.Raycaster(),result:ArtPlacement[]=[];
    // Small stands frame open water and canyon views; bridge deck and water remain clear.
    for(const [p,offset] of [[.205,-52],[.278,-58],[.312,-49],[.373,-58],[.395,-53],[.493,-58]])for(let j=0;j<(gpu?5:4);j++){
      const s=sampleTrack(track,p+j*.0018),position=s.center.clone().addScaledVector(s.normal,offset-(j%2)*7);
      ray.set(position.clone().setY(100),new THREE.Vector3(0,-1,0));position.y=ray.intersectObject(ground)[0]?.point.y??0;
      result.push({asset:'tree',position,heading:j*1.7,pitch:0,scale:new THREE.Vector3(.65+j*.08,.7+j*.06,.65+j*.08),detail:false});
    }
    ground.geometry.dispose();(ground.material as THREE.Material).dispose();return result;
  },[track,gpu]);
  const assets=useMemo(()=>{forest.scene.updateMatrixWorld(true);return [1,2,2].map(l=>(forest.scene.getObjectByName(`scots_pine_lod${l}`) as THREE.Mesh));},[forest]);
  return <group name="phase4a-composed-trees">{assets.map((mesh,lod)=><Batch key={lod} mesh={mesh} material={mesh.material as THREE.Material} items={items} lod={lod} gpu={gpu}/>)}</group>;
}

export function Phase4AEnvironment({track,quality}:{track:TrackInfo;quality:GraphicsQuality}){
  const gpu=quality==='gpu';
  const gltf=useLoader(GLTFLoader,`${import.meta.env.BASE_URL}assets/environment/phase4a/environment.glb`);
  const textures=useLoader(THREE.TextureLoader,TEXTURE_URLS);
  const library=useMemo(()=>createMaterialLibrary(textures,gpu),[textures,gpu]);
  useEffect(()=>()=>library.dispose(),[library]);
  const terrain=useMemo(()=>terrainMaterial(library.materials.gravel),[library]);
  useEffect(()=>()=>terrain.dispose(),[terrain]);
  const geometries=useMemo(()=>[artTerrain(track),basin(track,.35,90,65,94,false),basin(track,.35,90,65,94,true),basin(track,.445,0,100,85,false),basin(track,.445,0,100,85,true)],[track]);
  useEffect(()=>()=>geometries.forEach(g=>g.dispose()),[geometries]);
  const batches=useMemo(()=>{
    gltf.scene.updateMatrixWorld(true);const placements=phase4aPlacements(track).filter(p=>gpu||!p.detail);
    return [...new Set(placements.map(p=>p.asset))].flatMap(asset=>[0,1,2].map(lod=>{
      const mesh=gltf.scene.getObjectByName(`${asset}_lod${lod}`) as THREE.Mesh;
      if(!mesh?.isMesh)throw new Error(`Missing Phase 4A asset ${asset} / ${lod}`);
      const material=library.materials[mesh.userData.materialKey];
      if(!material)throw new Error(`Missing Phase 4A material ${mesh.userData.materialKey}`);
      return {mesh,lod,material,items:placements.filter(p=>p.asset===asset)};
    }));
  },[gltf,track,gpu,library]);
  return <group name="phase4a-environment">
    <VegetationComposition track={track} gpu={gpu}/>
    <mesh geometry={geometries[0]} material={terrain} receiveShadow/>
    <Water geometry={geometries[1]}/><Water geometry={geometries[3]}/>
    {[2,4].map(i=><mesh key={i} geometry={geometries[i]} material={library.materials.gravel} receiveShadow/>)}
    {batches.map(b=><Batch key={b.mesh.name} {...b} gpu={gpu}/>)}
  </group>;
}

export { Water, basin };
