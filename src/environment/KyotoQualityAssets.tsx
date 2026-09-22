import { useEffect, useMemo } from 'react';
import { useLoader } from '@react-three/fiber';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as THREE from 'three';
import type { KyotoPlacement } from './kyotoArtData';
import { AssetBatch } from './KyotoAssetBatch';
const families=['timber','plaster','roof','stone','concrete'];
const base=`${import.meta.env.BASE_URL}assets/environment/kyoto-quality/`;
const paths=families.flatMap(key=>['base','normal','roughness'].map(kind=>`${base}textures/${key}-${kind}.png`));
export function KyotoQualityAssets({placements}:{placements:KyotoPlacement[]}) {
 const gltf=useLoader(GLTFLoader,base+'library.glb');
 const textures=useLoader(THREE.TextureLoader,paths);
 const materials=useMemo(()=>{
  const result:Record<string,THREE.MeshStandardMaterial>={};
  families.forEach((key,i)=>{
   const [map,normalMap,roughnessMap]=textures.slice(i*3,i*3+3);
   for(const texture of [map,normalMap,roughnessMap]) {texture.flipY=false;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.anisotropy=4;texture.needsUpdate=true;}
   map.colorSpace=THREE.SRGBColorSpace;
   result[key]=new THREE.MeshStandardMaterial({name:'quality_'+key,map,normalMap,roughnessMap,normalScale:new THREE.Vector2(.55,.55),roughness:1});
  });
  for(const [key,color] of Object.entries({glass:0x354b49,accent:0x9e4b32,cloth:0x607765}))result[key]=new THREE.MeshStandardMaterial({name:'quality_'+key,color,roughness:key==='glass'?.38:.8});
  return result;
 },[textures]);
 useEffect(()=>()=>Object.values(materials).forEach(m=>m.dispose()),[materials]);
 const batches=useMemo(()=>{
  gltf.scene.updateMatrixWorld(true);
  const result:{mesh:THREE.Mesh;items:KyotoPlacement[];lod:number}[]=[];
  gltf.scene.traverse(o=>{if(!(o instanceof THREE.Mesh))return;const match=o.name.match(/^(.+)_lod([01])_(\w+)$/);if(!match)return;const items=placements.filter(p=>p.asset===match[1]);if(!items.length)return;const mesh=o.clone();mesh.material=materials[match[3]];if(!mesh.material)throw Error('Missing quality material '+match[3]);mesh.matrixWorld.copy(o.matrixWorld);result.push({mesh,items,lod:Number(match[2])});});
  return result;
 },[gltf,placements,materials]);
 return <group name="kyoto-quality-prototype" userData={{districts:[2,3],placements:placements.length,status:'USER REVIEW REQUIRED'}}>{batches.map(b=><AssetBatch key={b.mesh.name} {...b} detailDistance={45} cullInstances/>)}</group>;
}


