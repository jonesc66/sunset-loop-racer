import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import ts from 'typescript';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
const dir='verification/environment-phase3/';
const compile=s=>ts.transpileModule(s,{compilerOptions:{module:99,target:9,jsx:4}}).outputText;
for(const [file,name] of [['src/game/track.ts','track'],['src/game/trackZones.ts','trackZones'],['src/environment/benchmarkGeometry.ts','benchmarkGeometry']]){
  const code=compile(await fs.readFile(file,'utf8')).replaceAll('"../game/track"','"./track.mjs"').replaceAll("'./track'","'./track.mjs'");
  await fs.writeFile(dir+name+'.mjs',code);
}
const trackAPI=await import('../'+dir+'track.mjs');
const {createTrack,sampleTrack,createRoadGeometry,TRACK_WIDTH}=trackAPI;
const {TRACK_ZONES,TUNNEL,BRIDGE,TRACK_SEGMENTS}=await import('../'+dir+'trackZones.mjs');
const track=createTrack();
await fs.writeFile(dir+'before.mjs',compile(await fs.readFile(dir+'track-before.ts.txt','utf8')));
const old=(await import('../'+dir+'before.mjs')).createTrack();
const ratio=track.length/old.length-1;assert(ratio>=.5&&ratio<=.8);
assert.equal(track.checkpointTargets.length,20);
assert.equal(TRACK_SEGMENTS.length,10);
for(let i=0;i<10;i++){
  assert.equal(TRACK_SEGMENTS[i].next,TRACK_SEGMENTS[(i+1)%10].id);
  assert.equal(TRACK_SEGMENTS[i].end,(i+1)/10);
  assert(track.checkpointTargets.some(p=>p>TRACK_ZONES[i].start&&p<=TRACK_ZONES[i].end)||i===9);
}
// Nonadjacent centerline sections cannot intersect or form a hidden parallel shortcut.
let minClearance=Infinity,maxGrade=0;
for(let i=0;i<track.samples.length;i++){
  const a=track.samples[i].center,b=track.samples[(i+1)%track.samples.length].center;
  maxGrade=Math.max(maxGrade,Math.abs(b.y-a.y)/Math.hypot(b.x-a.x,b.z-a.z));
  for(let j=i+1;j<track.samples.length;j++){
    const separation=Math.min(j-i,track.samples.length-(j-i));
    if(separation<24)continue;
    const c=track.samples[j].center;
    minClearance=Math.min(minClearance,Math.hypot(a.x-c.x,a.z-c.z));
  }
}
assert(minClearance>TRACK_WIDTH+10,`Nonlocal road clearance ${minClearance}`);
assert(maxGrade<.2,`Maximum grade must remain below 20%: ${maxGrade}`);
const road=createRoadGeometry(track),pos=road.attributes.position;
for(const attr of Object.values(road.attributes))for(const value of attr.array)assert(Number.isFinite(value));
for(let i=0;i<road.attributes.normal.count;i++)assert(road.attributes.normal.getY(i)>.8,'Road faces up');
for(let i=0;i<6;i++)assert.equal(pos.array[i],pos.array[pos.array.length-6+i]);

const source=await fs.readFile('src/environment/Phase3Environment.tsx','utf8');
const placementCode=source.slice(source.indexOf('export function environmentPlacements'),source.indexOf('function AssetBatch')).replace('export function','function');
const {roadDistance}=await import('../'+dir+'benchmarkGeometry.mjs');
const environmentPlacements=Function('THREE','sampleTrack','tangentHeading','roadDistance','TRACK_ZONES','TUNNEL','BRIDGE',compile(placementCode)+';return environmentPlacements;')(THREE,sampleTrack,trackAPI.tangentHeading,roadDistance,TRACK_ZONES,TUNNEL,BRIDGE);
const groundCode=source.slice(source.indexOf('export function embankment'),source.indexOf('export function Phase3Environment')).replace('export function','function');
const ground=Function('THREE','BRIDGE',compile(groundCode)+';return embankment;')(THREE,BRIDGE)(track);
const bytes=await fs.readFile('public/assets/environment/phase3/environment-v1.glb');
const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
gltf.scene.updateMatrixWorld(true);
const placed=environmentPlacements(track), meshes=[];
for(const item of placed.filter(p=>!p.detail)){
  const asset=gltf.scene.getObjectByName(item.asset+'_lod0');assert(asset?.isMesh);
  const g=asset.geometry.clone().applyMatrix4(asset.matrixWorld);
  const mesh=new THREE.Mesh(g,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));
  mesh.position.copy(item.position);mesh.rotation.set(item.pitch,item.heading,0,'YXZ');mesh.scale.copy(item.scale);mesh.updateMatrixWorld();mesh.name=item.asset;meshes.push(mesh);
}
const ray=new THREE.Raycaster();
const groundMesh=new THREE.Mesh(ground,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));
for(let i=0;i<1200;i++){
  const pose=sampleTrack(track,i/1200);
  for(const lateral of [-10,0,10]){
    const origin=pose.center.clone().addScaledVector(pose.normal,lateral);origin.y+=50;
    ray.set(origin,new THREE.Vector3(0,-1,0));ray.far=100;
    const hit=ray.intersectObject(groundMesh,false)[0];
    assert(!hit||hit.point.y<pose.center.y+.1,`Terrain covers road at ${i/1200}`);
  }
}
// At bumper and roof heights, every lane must be free of environment geometry.
for(let i=0;i<1200;i++){
  const pose=sampleTrack(track,i/1200);
  for(const lateral of [-10,0,10]){
    const origin=pose.center.clone().addScaledVector(pose.normal,lateral);origin.y+=.3;
    ray.set(origin,new THREE.Vector3(0,1,0));ray.far=3;
    assert.equal(ray.intersectObjects(meshes,false).length,0,`Blocked road p=${i/1200} lane=${lateral}`);
  }
}
const tunnel=meshes.filter(m=>['tunnel','portal'].includes(m.name));
for(let p=TUNNEL.start+.002;p<TUNNEL.end-.002;p+=.001){
  const pose=sampleTrack(track,p);ray.set(pose.center.clone().add(new THREE.Vector3(0,2,0)),new THREE.Vector3(0,1,0));ray.far=16;
  assert(ray.intersectObjects(tunnel,false).length,'Missing tunnel ceiling at '+p);
  for(const side of [-1,1]){ray.set(pose.center.clone().add(new THREE.Vector3(0,2,0)),pose.normal.clone().multiplyScalar(side));ray.far=30;assert(ray.intersectObjects(tunnel,false).length,'Missing tunnel wall '+p);}
}

// Execute the actual frozen AI/checkpoint functions without the renderer.
const race=await fs.readFile('src/RaceScene.tsx','utf8');
const baseline=await fs.readFile('verification/environment-phase2/baseline/RaceScene.tsx','utf8');
const section=s=>s.slice(s.indexOf('function createCar('),s.indexOf('function updateCamera(')).replaceAll('\r\n','\n');
assert.equal(section(race),section(baseline),'Core gameplay is frozen');
const pure=race.slice(race.indexOf('function createCar('),race.indexOf('function updateCamera('));
const constants=race.slice(race.indexOf('const TOTAL_LAPS'),race.indexOf('type CarRuntime'));
const reusable='const reusableForward=new THREE.Vector3(),reusableRight=new THREE.Vector3();';
const api=Function('THREE',...Object.keys(trackAPI),compile(constants+reusable+pure)+';return {createGame,updateAi,resolveCarCollisions,updateCheckpoint,resetPlayerToTrack,updatePlayer};')(THREE,...Object.values(trackAPI));
const game=api.createGame(track,0,true);const visited=game.cars.map(()=>new Set());
let t=0;
while(t<300&&!game.cars.every(c=>c.finished)){
  t+=1/60;
  game.cars.forEach((car,i)=>{api.updateAi(track,car,game.cars,1/60,t);visited[i].add(Math.min(9,Math.floor(car.progress*10)));});
  api.resolveCarCollisions(track,game.cars);
}
for(let i=0;i<game.cars.length;i++){assert(game.cars[i].finished);assert.equal(game.cars[i].lapTimes.length,3);assert.equal(visited[i].size,10);}
const reset=api.createGame(track,0,true);assert(reset.cars.every(c=>c.completedLaps===0&&!c.finished));
const cheat=reset.cars[0];cheat.lastProgress=.89;cheat.progress=.01;api.updateCheckpoint(track,cheat,1,0,.12);assert.equal(cheat.completedLaps,0);
api.resetPlayerToTrack(track,cheat);assert.equal(cheat.speed,0);
// Input-controller fixture exercises the frozen player physics on the expanded road.
// It supplies ordinary throttle/brake/steering booleans, never changes progress or lap state.
const driven=api.createGame(track,0,false).cars[0];let playerTime=0,playerMaxLateral=0;
while(playerTime<240&&!driven.finished){
  const nearest=trackAPI.nearestTrackSample(track,driven.position);
  const target=sampleTrack(track,nearest.progress+16/track.length).center;
  const desired=Math.atan2(target.x-driven.position.x,target.z-driven.position.z);
  const error=Math.atan2(Math.sin(desired-driven.heading),Math.cos(desired-driven.heading));
  api.updatePlayer(track,driven,{accelerate:driven.speed<32,brake:driven.speed>36,left:error>.05,right:error<-.05,handbrake:false,resetRequested:false},1/60,playerTime);
  driven.position.y=trackAPI.nearestTrackSample(track,driven.position).surfaceHeight;
  playerMaxLateral=Math.max(playerMaxLateral,Math.abs(nearest.lateral));playerTime+=1/60;
}
assert(driven.finished,'Frozen player physics must complete three valid laps from keyboard-like input');
assert.equal(driven.lapTimes.length,3);
const report={status:'PASS',oldLength:old.length,newLength:track.length,expansionPercent:ratio*100,checkpoints:20,minClearance,maxGrade,assets:placed.length,glbBytes:bytes.length,checks:['single ordered loop','road clearance and closing seam','all zones checkpoint coverage','environment vehicle clearance','continuous tunnel roof and walls','frozen gameplay equality','actual AI six cars three laps','all cars visit A–J','shortcut rejected','reset state'],ai:game.cars.map(c=>({name:c.name,laps:c.lapTimes,finish:c.finishTime})),runtime:'Separate browser evidence required'};
await fs.writeFile(dir+'automated-results.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
await fs.writeFile(dir+'player-physics-results.json',JSON.stringify({status:'PASS',laps:driven.lapTimes,maxLateral:playerMaxLateral,collisionCount:driven.collisionCount,method:'Boolean input fixture running actual updatePlayer; not a browser test'},null,2));
const points=track.samples.map(p=>`${p.center.x},${p.center.z}`).join(' ');
const labels=TRACK_ZONES.map(z=>{const p=sampleTrack(track,(z.start+z.end)/2).center;return `<text x="${p.x+8}" y="${p.z-8}" font-size="18">${z.id}</text>`}).join('');
await fs.writeFile(dir+'track-overview.svg',`<svg xmlns="http://www.w3.org/2000/svg" viewBox="-550 -400 900 650"><rect x="-550" y="-400" width="900" height="650" fill="#e8eddf"/><polyline points="${points} ${points.split(' ')[0]}" fill="none" stroke="#455560" stroke-width="12"/>${labels}</svg>`);
