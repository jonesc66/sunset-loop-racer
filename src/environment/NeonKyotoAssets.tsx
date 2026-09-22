import {useMemo} from 'react';
import {useLoader} from '@react-three/fiber';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as THREE from 'three';
import type {TrackInfo} from '../game/track';
import type {MetroBuilding} from './neonMetroArtData';
import {kyotoPlacements} from './kyotoArtData';
import {AssetBatch} from './KyotoAssetBatch';
import {KyotoMaxAssets} from './KyotoMaxAssets';
import {wholeTrackPlacements} from './wholeTrackData';
export function NeonKyotoAssets({track,buildings}:{track:TrackInfo;buildings:MetroBuilding[]}){
 const gltf=useLoader(GLTFLoader,import.meta.env.BASE_URL+'assets/environment/kyoto/library.glb');
 const placements=useMemo(()=>wholeTrackPlacements(track,buildings),[track,buildings]);
 // Retain the already-positioned overhead torii; other old near/far architecture is replaced.
 const gate=useMemo(()=>kyotoPlacements(track,buildings).filter(p=>p.asset==='temple_gate'),[track,buildings]);
 const batches=useMemo(()=>{gltf.scene.updateMatrixWorld(true);return [0,1].map(lod=>({mesh:gltf.scene.getObjectByName('temple_gate_lod'+lod) as THREE.Mesh,lod,items:gate}));},[gltf,gate]);
 return <group name="neon-kyoto-assets" userData={{placements:placements.length,assetPipeline:'Blender GLB',revision:'Whole-track Revision C'}}>{batches.map(b=><AssetBatch key={b.mesh.name} {...b}/>)}<KyotoMaxAssets placements={placements}/></group>;
}
