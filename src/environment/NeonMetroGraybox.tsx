import {KyotoMaxAssets} from './KyotoMaxAssets';
import type {GraphicsQuality} from '../game/types';
import {NeonNightQuality,nightPresets} from './neonNightSettings';
import {NeonNightLighting} from './NeonNightLighting';
import { NeonKyotoAssets } from './NeonKyotoAssets';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { sampleTrack, tangentHeading, type TrackInfo } from '../game/track';
import { neonMetro } from '../game/neonMetro';
import { boxAt, buildMetroArt, buildingParts, districtIndex, metroDistricts, type ArtBox } from './neonMetroArtData';

function ribbon(track:TrackInfo,a:number,b:number,y:number){
  const positions:number[]=[],uv:number[]=[],indices:number[]=[];
  for(let i=0;i<=track.samples.length;i++){
    const s=track.samples[i%track.samples.length];
    for(const [j,offset]of [a,b].entries()){const p=s.center.clone().addScaledVector(s.normal,offset);positions.push(p.x,y,p.z);uv.push(j*(b-a)/12,i/track.samples.length*track.length/12);}
    if(i<track.samples.length){const n=i*2;indices.push(n,n+3,n+1,n,n+2,n+3);}
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();return g;
}
// Adjacent quads share endpoints; no overlapping coplanar box tops at bends.
function colorBand(track:TrackInfo,a:number,b:number,y:number,period:number){
  const g=ribbon(track,a,b,y).toNonIndexed(),colors:number[]=[],color=new THREE.Color();
  for(let i=0;i<track.samples.length;i++){
    color.set(Math.floor(i/period)%2?metroDistricts[districtIndex(track.samples[i].progress)].color:'#e3ded0');
    for(let j=0;j<6;j++)colors.push(color.r,color.g,color.b);
  }
  g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));return g;
}
function Boxes({items,material,name,geometry}:{items:ArtBox[];material:THREE.Material;name?:string;geometry?:THREE.BufferGeometry}){
  const ref=useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(()=>{const dummy=new THREE.Object3D(),color=new THREE.Color();items.forEach((b,i)=>{dummy.position.set(...b.position);dummy.scale.set(...b.scale);dummy.rotation.set(0,b.heading,0);dummy.updateMatrix();ref.current!.setMatrixAt(i,dummy.matrix);ref.current!.setColorAt(i,color.set(b.color??'#ffffff'));});if(ref.current){ref.current.instanceMatrix.needsUpdate=true;if(ref.current.instanceColor)ref.current.instanceColor.needsUpdate=true;ref.current.computeBoundingSphere();}},[items]);
  if(!items.length)return null;
  return <instancedMesh name={name} ref={ref} args={[geometry,undefined,items.length]} material={material}>{!geometry&&<boxGeometry/>}</instancedMesh>;
}
function pattern(kind:'facade'|'asphalt'|'paving'){
  const size=kind==='facade'?256:128,canvas=document.createElement('canvas');canvas.width=size;canvas.height=size;const c=canvas.getContext('2d')!;
  c.fillStyle=kind==='facade'?'#bec4c4':kind==='asphalt'?'#63696c':'#a6aaa4';c.fillRect(0,0,size,size);
  if(kind==='facade'){
    for(let y=0;y<8;y++)for(let x=0;x<5;x++){
      const px=x*51+6,py=y*32+5;c.fillStyle='#657b83';c.fillRect(px-2,py-2,41,26);c.fillStyle=(x+y)%4===0?'#537982':'#345462';c.fillRect(px,py,37,22);
      c.fillStyle='#91a4aa';c.fillRect(px,py,3,22);c.fillStyle='#789499';c.fillRect(px+4,py+2,30,3);c.fillStyle='#273f49';c.fillRect(px+18,py,2,22);
    }
    c.fillStyle='#e0e0d7';for(let y=0;y<8;y++)c.fillRect(0,y*32,256,2);
  }else if(kind==='asphalt'){
    for(let i=0;i<6000;i++){const n=(i*73+19)%255;c.fillStyle=`rgba(${n},${n},${n},.13)`;c.fillRect((i*37)%size,(i*61+Math.floor(i/size)*7)%size,1,1);}
  }else{c.strokeStyle='#7d8583';c.lineWidth=2;for(let i=0;i<=size;i+=32){c.beginPath();c.moveTo(i,0);c.lineTo(i,size);c.moveTo(0,i);c.lineTo(size,i);c.stroke();}}
  const t=new THREE.CanvasTexture(canvas);t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=2;return t;
}
function signAtlas(){
  const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=1024;const c=canvas.getContext('2d')!;
  metroDistricts.forEach((d,i)=>{const x=(i%2)*512,y=Math.floor(i/2)*128;c.fillStyle='#182b38';c.fillRect(x,y,512,128);c.fillStyle=d.color;c.fillRect(x,y,12,128);c.font='bold 17px sans-serif';c.fillText('SUNSET LOOP RACING / METRO',x+28,y+29);c.fillStyle='#f4efe1';c.font='bold 34px sans-serif';c.fillText(d.name,x+28,y+76);c.font='16px sans-serif';c.fillText('0'+(i+1)+'  /  CITY CIRCUIT     >>>',x+28,y+106);});
  c.fillStyle='#e0c478';c.fillRect(512,384,512,128);c.fillStyle='#172b38';c.font='bold 48px sans-serif';c.fillText('NEON METRO',550,450);c.font='bold 18px sans-serif';c.fillText('START / FINISH    •    CITY CIRCUIT',550,486);
  ['NOODLE','ARCADE','MONO','VINYL','KIOSK','COFFEE','MOTEL','WORKSHOP'].forEach((name,i)=>{const x=i%2*512,y=(4+Math.floor(i/2))*128;c.fillStyle=['#a4533e','#306571','#b39852','#524863'][i%4];c.fillRect(x,y,512,128);c.fillStyle='#f5ebce';c.font='bold 50px sans-serif';c.fillText(name,x+32,y+78);c.fillRect(x+30,y+102,445,4);});
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;return texture;
}
function signGeometry(index:number){const g=new THREE.PlaneGeometry(1,1),uv=g.getAttribute('uv');for(let i=0;i<uv.count;i++)uv.setXY(i,(index%2+uv.getX(i))/2,1-(Math.floor(index/2)+1-uv.getY(i))/8);return g;}
export default function NeonMetroGraybox({track,quality='high'}:{track:TrackInfo;quality?:GraphicsQuality}){
  const width=neonMetro.roadWidth,limit=width/2+4.8;
  const art=useMemo(()=>buildMetroArt(track),[track]);
  const parts=useMemo(()=>buildingParts([]),[art]);
  const resources=useMemo(()=>{
    const facade=pattern('facade'),asphalt=pattern('asphalt'),paving=pattern('paving'),atlas=signAtlas();
    const material=(color:string,map?:THREE.Texture)=>new THREE.MeshStandardMaterial({color,map:map??null,roughness:.86,metalness:0,side:THREE.DoubleSide});
    const mats={road:material('#92938b',asphalt),paving:material('#aab0ac',paving),edge:material('#eee4cc'),wall:material('#bdb9aa',paving),glass:material('#344f60'),trim:material('#d7d3bf'),roof:material('#667b80'),accent:material('#ffffff'),sign:material('#ffffff',atlas),band:new THREE.MeshStandardMaterial({vertexColors:true,roughness:.86,side:THREE.DoubleSide}),body:metroDistricts.map(d=>material(d.color,facade))};
    mats.road.color.set('#777f90');mats.road.roughness=.78;mats.road.metalness=.04;mats.road.bumpMap=asphalt;mats.road.bumpScale=.06;
    mats.sign.emissive.set('#fff0dc');mats.sign.emissiveMap=atlas;mats.sign.emissiveIntensity=1.2;
    mats.edge.emissive.set('#788fa8');mats.edge.emissiveIntensity=.16;
    mats.accent.emissive.set('#9eafc7');mats.accent.emissiveIntensity=.13;
    return {textures:[facade,asphalt,paving,atlas],mats,signs:Array.from({length:16},(_,i)=>signGeometry(i))};
  },[]);
  useEffect(()=>()=>{resources.textures.forEach(t=>t.dispose());Object.values(resources.mats).flat().forEach(m=>m.dispose());resources.signs.forEach(g=>g.dispose());},[resources]);
  const strips=useMemo(()=>[ribbon(track,-width/2,width/2,.05),ribbon(track,-limit,-width/2,.08),ribbon(track,width/2,limit,.08),ribbon(track,-width/2,-width/2+.22,.11),ribbon(track,width/2-.22,width/2,.11)],[track,width,limit]);
  useEffect(()=>()=>strips.forEach(g=>g.dispose()),[strips]);
  const bands=useMemo(()=>[-1,1].flatMap(side=>[
    colorBand(track,side*(limit-.01),side*(limit+1.01),1.67,6),
    colorBand(track,side*(width/2+.03),side*(width/2+1.33),.24,4),
  ]),[track,width,limit]);
  useEffect(()=>()=>bands.forEach(g=>g.dispose()),[bands]);
  const street=useMemo(()=>{
    const walls:ArtBox[]=[],markings:ArtBox[]=[],props:ArtBox[]=[],canopies:ArtBox[]=[],trees:ArtBox[]=[];
    // Collision-facing wall dimensions and offset endpoints are unchanged from the verified graybox.
    track.samples.filter((_,i)=>i%2===0).forEach((s,j)=>[-1,1].forEach(side=>{
      const next=track.samples[(j*2+2)%track.samples.length],a=s.center.clone().addScaledVector(s.normal,side*(limit+.5)),b=next.center.clone().addScaledVector(next.normal,side*(limit+.5)),p=a.clone().lerp(b,.5),heading=tangentHeading(b.clone().sub(a).normalize()),length=a.distanceTo(b)+.7;
      walls.push(boxAt(p.x,.8,p.z,1,1.6,length,heading));
    }));
    for(let i=0;i<145;i++){
      const p=i/145,s=sampleTrack(track,p),heading=tangentHeading(s.tangent),d=districtIndex(p);
      if(d===0||d===5)for(const offset of [-4.25,4.25]){const q=s.center.clone().addScaledVector(s.normal,offset);markings.push(boxAt(q.x,.13,q.z,.18,.015,5,heading));}
      if(i%3===0){const q=s.center.clone().addScaledVector(s.normal,-21);props.push(boxAt(q.x,3.8,q.z,.16,7.6,.16,heading));canopies.push(boxAt(q.x,7.65,q.z,1.2,.22,2,heading,'#cbd0c4'));}
      if(i%7===0&&(d===2||d===4)){const q=s.center.clone().addScaledVector(s.normal,-23.5);props.push(boxAt(q.x,.55,q.z,3,1.1,3,heading));trees.push(boxAt(q.x,2.6,q.z,2.8,3,2.8,heading,'#6e947a'));}
    }
    for(const p of [.19,.285,.33,.425,.48,.855,.888]){
      const s=sampleTrack(track,p),heading=tangentHeading(s.tangent);
      for(const side of [-1,1]){const q=s.center.clone().addScaledVector(s.normal,side*9);markings.push(boxAt(q.x,.135,q.z,.3,.02,7,heading));for(const sign of [-1,1]){const tip=q.clone().addScaledVector(s.tangent,3).addScaledVector(s.normal,sign*.85);markings.push(boxAt(tip.x,.14,tip.z,.3,.02,2.4,heading+sign*.72));}}
    }
    const start=sampleTrack(track,0);for(let x=-6;x<6;x++)for(let z=0;z<2;z++){const p=start.center.clone().addScaledVector(start.normal,(x+.5)*2).addScaledVector(start.tangent,(z-.5)*1.2);markings.push(boxAt(p.x,.15,p.z,2,.025,1.2,tangentHeading(start.tangent),(x+z)%2?'#f1ead8':'#17232c'));}
    for(const slot of [neonMetro.spawns.player,...neonMetro.spawns.ai]){const s=sampleTrack(track,slot.progress),p=s.center.clone().addScaledVector(s.normal,slot.laneOffset);markings.push(boxAt(p.x,.14,p.z,3,.02,.22,tangentHeading(s.tangent)));}
    return {walls,markings,props,canopies,trees};
  },[track,width,limit]);
  const {mats}=resources,start=sampleTrack(track,0);
  return <NeonNightQuality.Provider value={quality}>
    <color attach="background" args={['#101b30']} />
    <fog attach="fog" args={['#142136',165,nightPresets[quality].fogFar]} />
    <group name="neon-metro-graybox" userData={{artPhase:5,districts:metroDistricts.map(d=>d.id),buildingCount:art.buildings.length}}>
      <NeonKyotoAssets track={track} buildings={art.buildings}/>
      <NeonNightLighting track={track}/>
      <mesh rotation={[-Math.PI/2,0,0]} position={[0,-.1,0]}><planeGeometry args={[1800,1800]}/><meshStandardMaterial color="#8b927c" roughness={1}/></mesh>
      {strips.map((geometry,i)=><mesh key={i} receiveShadow geometry={geometry} material={i===0?mats.road:i<3?mats.paving:mats.edge}/>)}
      <Boxes name="metro-barriers" material={mats.wall} items={street.walls}/>{bands.map((geometry,i)=><mesh key={i} name={i%2?"metro-curb-band":"metro-barrier-cap"} geometry={geometry} material={mats.band}/>)}
      <Boxes name="metro-road-markings" material={mats.accent} items={street.markings}/>
      {parts.bodies.map((items,i)=><group name={'metro-district-'+metroDistricts[i].id} key={i}><Boxes material={mats.body[i]} items={items}/></group>)}
      <Boxes material={mats.glass} items={parts.glass}/><Boxes material={mats.trim} items={parts.trim}/><Boxes material={mats.roof} items={parts.roofs}/><Boxes material={mats.accent} items={parts.awnings}/><Boxes material={mats.trim} items={parts.fins}/>
      <Boxes material={mats.roof} items={street.props}/><Boxes material={mats.accent} items={street.canopies}/><KyotoMaxAssets placements={street.trees.map(t=>({asset:"Green_Street_Tree",position:[t.position[0],.8,t.position[2]],heading:t.heading,scale:[1,1,1],district:2}))}/>{parts.shopSigns.map((items,i)=><Boxes key={i} name={'metro-shop-signs-'+i} material={mats.sign} items={items} geometry={resources.signs[i+8]}/>)}
      {art.signs.map((s,i)=><group key={i} position={[s.x,0,s.z]} rotation={[0,s.heading+Math.PI,0]}><mesh position={[0,2.3,0]} material={mats.roof}><boxGeometry args={[.35,4.6,.35]}/></mesh><mesh position={[0,s.y,0]} scale={[s.width,2.5,1]} geometry={resources.signs[s.district]} material={mats.sign}/></group>)}
      <group name="metro-plaza-landmark" userData={{asset:"pagoda"}}/>
      <group name="metro-stadium-landmark" userData={{asset:"kyoto_arena"}}/>
      <group name="metro-start-gantry" position={[start.center.x,0,start.center.z]} rotation={[0,tangentHeading(start.tangent),0]}>
        {[-1,1].map(side=><mesh key={side} position={[side*20,5,0]} material={mats.trim}><boxGeometry args={[1.4,10,1.4]}/></mesh>)}
        <mesh position={[0,10,0]} material={mats.roof}><boxGeometry args={[42,2.4,1.2]}/></mesh>
        <mesh position={[0,10,-.63]} rotation={[0,Math.PI,0]} scale={[22,2.2,1]} geometry={resources.signs[7]} material={mats.sign}/>
      </group>
    </group>
  </NeonNightQuality.Provider>;
}
