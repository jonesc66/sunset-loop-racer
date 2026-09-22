import * as THREE from 'three';
import { sampleTrack, wrapProgress, type TrackInfo } from './track';
import { createMinimapProjection } from './minimap';
import type { TrackDefinition } from './trackDefinition';

// Independently authored city blocks: avenue, grid, plaza hairpin, market S,
// stadium sweep, back straight, and final chicane. No Sunset control points.
export const metroControlPoints = [
  [-100,180],[40,180],[165,180],[220,150],[220,90],
  [205,65],[150,65],[150,0],[210,0],[240,-30],
  [225,-65],[180,-80],[100,-80],[65,-110],[25,-80],
  [-15,-110],[-65,-115],[-120,-170],[-195,-180],
  [-255,-140],[-275,-60],[-275,40],[-260,95],
  [-220,110],[-195,125],[-180,180]
] as const;

export function createNeonMetroRoute(): TrackInfo {
  const points = metroControlPoints.map(([x,z]) => new THREE.Vector3(x,0,z));
  const corners = points.map((p,i)=>{
    const prev=points[(i+points.length-1)%points.length],next=points[(i+1)%points.length];
    const cut=Math.min(45,p.distanceTo(prev)*.45,p.distanceTo(next)*.45);
    return {entry:p.clone().lerp(prev,cut/p.distanceTo(prev)),exit:p.clone().lerp(next,cut/p.distanceTo(next)),control:p};
  });
  const curve=new THREE.CurvePath<THREE.Vector3>();
  for(let i=0;i<corners.length;i++){
    const c=corners[i],next=corners[(i+1)%corners.length];
    curve.add(new THREE.QuadraticBezierCurve3(c.entry,c.control,c.exit));
    curve.add(new THREE.LineCurve3(c.exit,next.entry));
  }
  // Size this new design by its sampled closed-polyline length, using the same
  // segment-distance calculation as createTrack. Never substitute a display value.
  const centers = Array.from({length:900},(_,i)=>curve.getPointAt(i/900));
  const rawLength = centers.reduce((sum,p,i)=>sum+p.distanceTo(centers[(i+1)%centers.length]),0);
  centers.forEach(p=>p.multiplyScalar(1735/rawLength));
  // Place the timing origin on Grand Avenue, with the entire six-car grid
  // behind it on the same straight, clear of the final chicane.
  centers.push(...centers.splice(0,60));
  const samples = centers.map((center,i)=>{
    const tangent=centers[(i+1)%centers.length].clone().sub(centers[(i+centers.length-1)%centers.length]).normalize();
    return {center,tangent,normal:new THREE.Vector3(-tangent.z,0,tangent.x),progress:i/centers.length};
  });
  const length=centers.reduce((sum,p,i)=>sum+p.distanceTo(centers[(i+1)%centers.length]),0);
  return {samples,length,checkpointTargets:[...Array.from({length:23},(_,i)=>(i+1)/24),0]};
}
const route=createNeonMetroRoute();
const slot=(row:number,column:0|1)=>({progress:wrapProgress(1-(12+row*17+column*6)/route.length),laneOffset:column===0?-5.5:5.5});
export const neonMetro:TrackDefinition={
  id:'neon-metro',timingVersion:'2',displayName:'Neon Metro',
  description:'City graybox · avenue straights, plaza hairpin and market S-bends',
  defaultLapCount:3,route,roadWidth:25.5,
  spawns:{player:slot(2,0),ai:[slot(0,0),slot(0,1),slot(1,0),slot(1,1),slot(2,1)]},
  aiRoute:route,respawn:p=>sampleTrack(route,p),startFinish:{progress:0},
  environment:{renderer:'neon-metro-graybox'},
  minimap:{route,projection:createMinimapProjection(route.samples.map(s=>s.center))}
};
