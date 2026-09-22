
import { nearestTrackSample, sampleTrack, tangentHeading, type TrackInfo } from '../game/track';
import { metroLandmarks, type MetroBuilding } from './neonMetroArtData';
export type KyotoPlacement={asset:string;position:[number,number,number];heading:number;scale:[number,number,number];district:number};
export const isKyotoNear=(b:MetroBuilding)=>b.clearance+Math.hypot(b.width,b.depth)/2<96;
export function kyotoPlacements(track:TrackInfo,buildings:MetroBuilding[]){
 const items:KyotoPlacement[]=[];
 for(const b of buildings.filter(isKyotoNear)){
  const traditional=b.district===2||b.district===3||b.district===6;
  const asset=traditional?(b.variant%2?'machiya_b':'machiya_a'):(b.district===1||b.district===5||b.variant===1?'modern_apartment':'modern_office');
  const scale=Math.min(b.width/(traditional?15.8:22),b.depth/(traditional?12.4:18),1.2);
  items.push({asset,position:[b.x,0,b.z],heading:b.heading,scale:[scale,traditional?1:asset==='modern_apartment'?1:1+b.variant*.08,scale],district:b.district});
 }
 items.push({asset:'pagoda',position:[metroLandmarks.plaza.x,0,metroLandmarks.plaza.z],heading:0,scale:[1,1.18,1],district:2});
 for(const [start,end,step]of [[.74,.835,.009],[.3,.375,.023]] as const){
  for(let p=start;p<end;p+=step)for(const side of [-1,1]){
   const s=sampleTrack(track,p),q=s.center.clone().addScaledVector(s.normal,side*25.5);
   if(nearestTrackSample(track,q).distance<24)continue;
   items.push({asset:items.length%2?'sakura_a':'sakura_b',position:[q.x,0,q.z],heading:p*20,scale:[1,1+(items.length%3)*.08,1],district:p<.4?2:5});
  }
 }
 const gate=sampleTrack(track,.915);
 items.push({asset:'temple_gate',position:[gate.center.x,0,gate.center.z],heading:tangentHeading(gate.tangent),scale:[1,1,1],district:6});
 items.push({asset:'kyoto_arena',position:[metroLandmarks.stadium.x,0,metroLandmarks.stadium.z],heading:0,scale:[1,1,1],district:4});
 for(const b of buildings.filter(b=>isKyotoNear(b)&&(b.district===3||b.district===1)).filter((_,i)=>i%2===0)){
  const offset=-(Math.min(b.depth,14)/2+1.8);
  items.push({asset:'street_set',position:[b.x+Math.sin(b.heading)*offset,0,b.z+Math.cos(b.heading)*offset],heading:b.heading,scale:[1,1,1],district:b.district});
 }
 return items;
}
