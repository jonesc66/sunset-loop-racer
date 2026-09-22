import {Vector3} from 'three';
import {nearestTrackSample,sampleTrack,type TrackInfo} from '../game/track';
import {kyotoPlacements,isKyotoNear,type KyotoPlacement} from './kyotoArtData';
import {qualityPlacements} from './kyotoQualityData';
import {maxPlacements} from './kyotoMaxData';
import {organicStreetPlacements} from './organicStreetData';
import {metroLandmarks,type MetroBuilding} from './neonMetroArtData';
const modern=[
 ['Bronze_Office','Silver_Fin_Tower','Modern_Tower_A','Terrace_Hotel','Green_Glass_Office'],
 ['Brick_Corner','Courtyard_MixedUse','Green_Glass_Office','Terrace_Hotel','Design_Gallery'],
 ['Design_Gallery','Brick_Corner','Courtyard_MixedUse'],
 ['Brick_Corner','Design_Gallery','Courtyard_MixedUse'],
 ['Design_Gallery','Green_Glass_Office','Silver_Fin_Tower','Brick_Corner'],
 ['Avenue_Apartment','Courtyard_MixedUse','Terrace_Hotel','Brick_Corner'],
 ['Design_Gallery','Brick_Corner','Bronze_Office'],
];
const traditional=['Machiya_Tea','Kyoto_Inn','Corner_Shop','Machiya_Workshop','Machiya_Bakery','Machiya_Udon'];
export function wholeTrackPlacements(track:TrackInfo,buildings:MetroBuilding[]):KyotoPlacement[]{
 const original=kyotoPlacements(track,buildings),quality=qualityPlacements(original);
 const retained=maxPlacements(original,quality,track);
 const result:KyotoPlacement[]=[...retained,...organicStreetPlacements(original).filter(p=>p.asset.startsWith('Sakura'))];
 const slots=new Array(7).fill(0);
 for(const b of buildings){
  const n=slots[b.district]++,near=isKyotoNear(b);
  const closest=nearestTrackSample(track,new Vector3(b.x,0,b.z));
  const position=new Vector3(b.x,0,b.z);const toward=closest.sample.center.clone().sub(position);
  const heading=Math.atan2(toward.x,toward.z);
  if(near)position.addScaledVector(toward.normalize(),Math.max(0,closest.distance-37));
  if(near&&[2,3].includes(b.district))continue;
  if(near&&b.district===6){
   const scale=Math.min(b.width/15.8,b.depth/12.4,1.2);
   result.push({asset:traditional[n%traditional.length],position:[position.x,0,position.z],heading,scale:[scale,1,scale],district:b.district});continue;
  }
  const family=modern[b.district],asset=family[n%family.length];
  // Modest uniform footprint adaptation preserves the authored proportions.
  const scale=Math.min(b.width/26,b.depth/23,near?1.12:1.3);
  result.push({asset,position:[position.x,0,position.z],heading,scale:[scale,scale,scale],district:b.district});
 }
 for(const p of quality.filter(p=>p.district===2&&!['Pagoda_Hero','Traditional_Wall','Machiya_A'].includes(p.asset)))
  result.push({...p,asset:traditional[result.length%traditional.length]});
 result.push({asset:'Kyoto_Arena_Hero',position:[metroLandmarks.stadium.x,0,metroLandmarks.stadium.z],heading:0,scale:[1,1,1],district:4});
 // Continue the market bend, rejecting overlap with the accepted frontage.
 for(const side of [-1,1])for(let p=.459,i=0;p<.555;p+=.011,i++){
  const s=sampleTrack(track,p),q=s.center.clone().addScaledVector(s.normal,side*27);
  if(nearestTrackSample(track,q).distance<26||result.some(o=>Math.hypot(o.position[0]-q.x,o.position[2]-q.z)<16.5))continue;
  const face=s.normal.clone().multiplyScalar(-side);
  result.push({asset:traditional[(i+(side===1?2:0))%traditional.length],position:[q.x,0,q.z],heading:Math.atan2(face.x,face.z),scale:[1,1,1],district:3});
 }
 for(const [start,end,district]of [[.02,.145,0],[.155,.245,1],[.57,.72,4],[.845,.93,6]] as const){
  for(let p=start,i=0;p<end;p+=.022,i++)for(const side of [-1,1]){
   const s=sampleTrack(track,p),q=s.center.clone().addScaledVector(s.normal,side*25.8);
   if(nearestTrackSample(track,q).distance<25||result.some(o=>Math.hypot(o.position[0]-q.x,o.position[2]-q.z)<8))continue;
   const heading=Math.atan2(-side*s.normal.x,-side*s.normal.z);
   result.push({asset:'Garden_Bench',position:[q.x,0,q.z],heading,scale:[1,1,1],district});
   if(i%2===0)result.push({asset:'Green_Street_Tree',position:[q.x,0,q.z+0.1],heading,scale:[1.1,1.3,1.1],district});
   if(district===6&&i%2===1)result.push({asset:'Garden_Wall',position:[q.x,0,q.z],heading,scale:[1,1,1],district});
  }
 }
 const temple=sampleTrack(track,.892),q=temple.center.clone().addScaledVector(temple.normal,41);
 if(nearestTrackSample(track,q).distance>32){
  const heading=Math.atan2(-temple.normal.x,-temple.normal.z);
  result.push({asset:'Temple_Hall',position:[q.x,0,q.z],heading,scale:[1.3,1.3,1.3],district:6});
  const gate=q.clone().addScaledVector(temple.normal,-9);
  result.push({asset:'Temple_Gate',position:[gate.x,0,gate.z],heading,scale:[1.2,1.2,1.2],district:6});
 }
 return result;
}
