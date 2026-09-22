import {useEffect,useMemo,useRef} from 'react';
import {useFrame,useLoader} from '@react-three/fiber';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as THREE from 'three';
import type {KyotoPlacement} from './kyotoArtData';
import {nightMaterial} from './neonNightMaterial';
import {nightPresets,useNeonNightQuality} from './neonNightSettings';
const base=`${import.meta.env.BASE_URL}assets/environment/kyoto-max/`;
function MaxBatch({mesh,items,lod,material}:{mesh:THREE.Mesh;items:KyotoPlacement[];lod:number;material:THREE.Material}){
 const ref=useRef<THREE.InstancedMesh>(null);
 const quality=useNeonNightQuality();
 const geometry=useMemo(()=>{const g=mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);g.computeBoundingSphere();g.setAttribute('uv1',g.getAttribute('uv').clone());return g;},[mesh]);
 useEffect(()=>()=>geometry.dispose(),[geometry]);
 const state=useMemo(()=>({dummy:new THREE.Object3D(),sphere:new THREE.Sphere(),frustum:new THREE.Frustum(),matrix:new THREE.Matrix4(),levels:new Map<number,number>()}),[]);
 useFrame(({camera})=>{
  if(!ref.current)return;state.frustum.setFromProjectionMatrix(state.matrix.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));let count=0;
  items.forEach((p,i)=>{
   const distance=Math.hypot(camera.position.x-p.position[0],camera.position.z-p.position[2]);
   let level=state.levels.get(i)??(distance<45?0:distance<120?1:2);
   // Hysteresis prevents rapid oscillation at LOD boundaries. Hero outline is retained in all levels.
   if(level===0&&distance>50)level=1;else if(level===1&&distance<40)level=0;else if(level===1&&distance>130)level=2;else if(level===2&&distance<110)level=1;
   state.levels.set(i,level);if(level!==lod||distance>650)return;
   state.dummy.position.set(...p.position);state.dummy.rotation.set(0,p.heading,0);state.dummy.scale.set(...p.scale);state.dummy.updateMatrix();state.sphere.copy(geometry.boundingSphere!).applyMatrix4(state.dummy.matrix);
   if(!state.frustum.intersectsSphere(state.sphere))return;ref.current!.setMatrixAt(count++,state.dummy.matrix);
  });ref.current.count=count;ref.current.visible=count>0;ref.current.instanceMatrix.needsUpdate=true;
 });
 return <instancedMesh name={'max-'+mesh.name} ref={ref} args={[geometry,material,items.length]} castShadow={nightPresets[quality].shadow>0&&lod===0} receiveShadow count={0} frustumCulled={false} dispose={null}/>;
}
export function KyotoMaxAssets({placements}:{placements:KyotoPlacement[]}){
 const gltf=useLoader(GLTFLoader,[base+'library.glb',import.meta.env.BASE_URL+'assets/environment/machiya-street/library.glb',import.meta.env.BASE_URL+'assets/environment/organic-street/library.glb',import.meta.env.BASE_URL+'assets/environment/whole-track/library.glb']);const textures=useLoader(THREE.TextureLoader,['base','normal','orm'].map(k=>base+'atlas-'+k+'.png'));
 const materials=useMemo(()=>{const[map,normalMap,orm]=textures;for(const t of textures){t.flipY=false;t.anisotropy=8;t.needsUpdate=true;}map.colorSpace=THREE.SRGBColorSpace;const solid=new THREE.MeshStandardMaterial({name:'max-atlas-solid',map,normalMap,normalScale:new THREE.Vector2(.5,.5),roughnessMap:orm,aoMap:orm,aoMapIntensity:.65,metalnessMap:orm,metalness:1,roughness:1});const foliage=solid.clone();foliage.name='max-atlas-cutout';foliage.alphaTest=.45;foliage.side=THREE.DoubleSide;foliage.forceSinglePass=true;return {solid,foliage};},[textures]);
 const night=useMemo(()=>({modern:nightMaterial(materials.solid,'modern'),residential:nightMaterial(materials.solid,'residential'),traditional:nightMaterial(materials.solid,'traditional'),pagoda:nightMaterial(materials.solid,'pagoda'),arena:nightMaterial(materials.solid,'arena'),sakura:nightMaterial(materials.foliage,'sakura'),green:nightMaterial(materials.foliage,'green')}),[materials]);
 useEffect(()=>()=>{materials.solid.dispose();materials.foliage.dispose();Object.values(night).forEach(m=>m.dispose());},[materials,night]);
 const batches=useMemo(()=>{gltf.forEach(g=>g.scene.updateMatrixWorld(true));return [...new Set(placements.map(p=>p.asset))].flatMap(asset=>[0,1,2].map(lod=>{const mesh=gltf.map(g=>g.scene.getObjectByName(`${asset}_lod${lod}`)).find(Boolean) as THREE.Mesh;if(!mesh?.isMesh)throw Error('Missing maximum-quality asset '+asset);const kind=asset.startsWith('Sakura')?'sakura':asset==='Green_Street_Tree'?'green':asset.includes('Pagoda')?'pagoda':asset.includes('Arena')?'arena':/Machiya|Kyoto_Inn|Corner_Shop|Temple|Traditional/.test(asset)?'traditional':/Apartment|Hotel|Courtyard_MixedUse/.test(asset)?'residential':'modern';return {mesh,lod,items:placements.filter(p=>p.asset===asset),material:night[kind]};}));},[gltf,placements,night]);
 return <group name="kyoto-max-prototype" userData={{batch:1,placements:placements.length,status:'USER REVIEW REQUIRED'}}>{batches.map(b=><MaxBatch key={b.mesh.name} {...b}/>)}</group>;
}


