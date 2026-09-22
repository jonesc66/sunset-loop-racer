import * as THREE from 'three';
import { nearestTrackSample, sampleTrack, tangentHeading, type TrackInfo } from '../game/track';

export const metroDistricts = [
  { id:'avenue', name:'GRAND AVENUE', end:.15, color:'#b9b9a5', height:64 },
  { id:'downtown', name:'DOWNTOWN', end:.29, color:'#d0bc9b', height:36 },
  { id:'plaza', name:'CENTRAL PLAZA', end:.40, color:'#e1c394', height:27 },
  { id:'market', name:'MARKET QUARTER', end:.56, color:'#a77958', height:17 },
  { id:'stadium', name:'METRO ARENA', end:.73, color:'#c2c5ad', height:24 },
  { id:'backstraight', name:'SAKURA BOULEVARD', end:.84, color:'#dab6c1', height:19 },
  { id:'chicane', name:'FINAL CHICANE', end:.94, color:'#b77657', height:30 }
] as const;
export function districtIndex(progress:number){return metroDistricts.findIndex(d=>progress<d.end)===-1?0:metroDistricts.findIndex(d=>progress<d.end);}
export type ArtBox={position:[number,number,number];scale:[number,number,number];heading:number;color?:string};
export type MetroBuilding={x:number;z:number;width:number;depth:number;height:number;heading:number;district:number;variant:number;clearance:number};
export type ArtSign={x:number;z:number;y:number;heading:number;district:number;width:number};
export const metroLandmarks={plaza:{x:205,z:-40,radius:9},stadium:{x:-177,z:-83,radius:72}};
export function buildMetroArt(track:TrackInfo){
  const buildings:MetroBuilding[]=[],signs:ArtSign[]=[];const occupied:{x:number;z:number;r:number}[]=[];
  function add(x:number,z:number,width:number,depth:number,height:number,heading:number,district:number,variant:number){
    const r=Math.hypot(width,depth)/2,clearance=nearestTrackSample(track,new THREE.Vector3(x,0,z)).distance-r;
    if(clearance<26||occupied.some(b=>Math.hypot(b.x-x,b.z-z)<b.r+r+5))return;
    if(Object.values(metroLandmarks).some(b=>Math.hypot(b.x-x,b.z-z)<b.radius+r+8))return;
    buildings.push({x,z,width,depth,height,heading,district,variant,clearance});occupied.push({x,z,r});
  }
  // Street-facing modules follow the route; corner clearance is checked against ALL segments.
  for(let i=0;i<52;i++){
    const p=i/52,s=sampleTrack(track,p),d=districtIndex(p),district=metroDistricts[d];
    for(const side of [-1,1]){
      if(d===4&&side===1)continue;
      const width=d===3?17:d===5?42:22+(i%3)*4,depth=d===3?14:d===5?18:20+(i%2)*6;
      const distance=29+Math.hypot(width,depth)/2;
      const position=s.center.clone().addScaledVector(s.normal,side*distance);
      add(position.x,position.z,width,depth,district.height*(.72+(i%4)*.17),tangentHeading(s.tangent)+Math.PI/2,d,i%4);
    }
  }
  // Sparse second layer gives a skyline rather than an unbroken wall of towers.
  for(let x=-360;x<=340;x+=78)for(let z=-260;z<=300;z+=80){
    const n=nearestTrackSample(track,new THREE.Vector3(x,0,z));if(n.distance<76||n.distance>155)continue;
    const d=districtIndex(n.progress),v=Math.abs(Math.round(x*7+z*11))%4;
    add(x,z,27+v*2,24+v*3,34+v*19,0,d,v);
  }
  for(const [i,p]of [.015,.18,.315,.44,.625,.775,.87].entries()){
    const s=sampleTrack(track,p),position=s.center.clone().addScaledVector(s.normal,-29);
    if(nearestTrackSample(track,position).distance>27)signs.push({x:position.x,z:position.z,y:4.6,heading:tangentHeading(s.tangent),district:i,width:10});
  }
  return {buildings,signs};
}
export function boxAt(x:number,y:number,z:number,w:number,h:number,d:number,heading=0,color?:string):ArtBox{return {position:[x,y,z],scale:[w,h,d],heading,color};}
export function buildingParts(buildings:MetroBuilding[]){
  const shopSigns:ArtBox[][]=Array.from({length:8},()=>[]);
  const bodies:ArtBox[][]=metroDistricts.map(()=>[]),glass:ArtBox[]=[],trim:ArtBox[]=[],awnings:ArtBox[]=[],roofs:ArtBox[]=[],fins:ArtBox[]=[];
  for(const b of buildings){
    const {x,z,width:w,depth:d,height:h,heading:a,district:k}=b;const color=metroDistricts[k].color;
    const local=(lx:number,y:number,lz:number,sx:number,sy:number,sz:number,c?:string)=>boxAt(x+Math.cos(a)*lx+Math.sin(a)*lz,y,z-Math.sin(a)*lx+Math.cos(a)*lz,sx,sy,sz,a,c);
    bodies[k].push(local(0,h/2,0,w,h,d));
    // Dark ground-floor podium and a narrower crown make each module a composed silhouette.
    glass.push(local(0,2.4,0,w+.4,4.8,d+.4));
    roofs.push(local(0,h+1,0,w+1.2,2,d+1.2));
    if(h>40){bodies[k].push(local(0,h+5,0,w*.65,10,d*.7));roofs.push(local(0,h+10.6,0,w*.68,1.2,d*.73));}
    for(const side of [-1,1]){
      for(const end of [-1,1])trim.push(local(side*(w/2+.12),h/2,end*(d/2),.45,h,.5));
      trim.push(local(0,5,side*(d/2+.16),w+.6,.5,.4));
      if(k===3||k===1){const panel=local(0,6.2,side*(d/2+.32),w*.72,1.8,1);panel.heading+=side<0?Math.PI:0;shopSigns[b.variant+(k===1?4:0)].push(panel);awnings.push(local(0,4.2,side*(d/2+1.1),w*.88,.55,2.4,color));trim.push(local(0,8.5,side*(d/2+.65),w*.88,.3,1.2));}
      if(k===0)for(const offset of [-.25,0,.25])fins.push(local(offset*w,h/2,side*(d/2+.4),.4,h,.8));
    }
    if(k===5){for(const offset of [-.3,0,.3])glass.push(local(offset*w,2.5,d/2+.15,w*.21,4,.25));}
    if(b.variant%2===0)roofs.push(local(w*.18,h+3,-d*.2,w*.25,3,d*.22));
  }
  return {bodies,glass,trim,awnings,roofs,fins,shopSigns};
}
