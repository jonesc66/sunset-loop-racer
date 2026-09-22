import * as THREE from 'three';
import {nearestTrackSample,sampleTrack,type TrackInfo} from '../game/track';
import type { KyotoPlacement } from './kyotoArtData';
const frontageSlot=(p:KyotoPlacement)=>p.district===3&&p.position[0]>40&&p.position[0]<180&&p.position[2]>-170;
export const maxReplacesOriginal=(p:KyotoPlacement)=>(p.district===2&&p.asset.startsWith('sakura_'))||(frontageSlot(p)&&p.asset==='street_set');
export const maxReplacesQuality=(p:KyotoPlacement)=>['Machiya_A','Pagoda_Hero','Traditional_Wall'].includes(p.asset)||frontageSlot(p);
export function maxPlacements(original:KyotoPlacement[],quality:KyotoPlacement[],track:TrackInfo):KyotoPlacement[]{
 const result=quality.filter(p=>maxReplacesQuality(p)&&!frontageSlot(p)).map(p=>{if(p.asset!=='Machiya_A')return {...p};const q=new THREE.Vector3(...p.position),near=nearestTrackSample(track,q),delta=q.clone().sub(near.sample.center).normalize();q.addScaledVector(delta,-Math.max(0,near.distance-34));return {...p,position:[q.x,0,q.z] as [number,number,number]};});
 for(const p of original.filter(p=>p.asset.startsWith('sakura_')&&maxReplacesOriginal(p)))result.push({...p,asset:'Sakura_A',scale:[.95,p.scale[1],.95],heading:p.heading});
 result.push({asset:'Modern_Tower_A',position:[145,0,95],heading:Math.PI-.5,scale:[1,1,1],district:2},{asset:'Modern_Tower_B',position:[125,0,125],heading:Math.PI-.2,scale:[1,1,1],district:2});
 result.push({asset:'Temple_Gate',position:[193,0,-27],heading:0,scale:[1,1,1],district:2});
 result.push({asset:'Temple_Hall',position:[179,0,-42],heading:0,scale:[1,1,1],district:2});
 // A short, continuous market frontage. Sample spacing along each offset row, not the centreline.
 const families=['Corner_Shop','Machiya_Tea','Kyoto_Inn','Machiya_Workshop','Corner_Shop'];
 for(const side of [-1,1]){
  let progress=.414;let previous:THREE.Vector3|undefined;
  for(let i=0;i<families.length;i++){
   let sample=sampleTrack(track,progress);let point=sample.center.clone().addScaledVector(sample.normal,side*(26.2+(i===2?.8:0)));
   while(previous&&point.distanceTo(previous)<16.5){progress+=.00025;sample=sampleTrack(track,progress);point=sample.center.clone().addScaledVector(sample.normal,side*(26.2+(i===2?.8:0)));}
   const facing=sample.normal.clone().multiplyScalar(-side);
   result.push({asset:families[side===1?i:families.length-1-i],position:[point.x,0,point.z],heading:Math.atan2(facing.x,facing.z),scale:[1,1,1],district:3});previous=point;progress+=.00025;
  }
 }
 return result;
}





