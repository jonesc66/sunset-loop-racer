import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import ts from 'typescript';
import * as THREE from 'three';
import {foundation} from './multitrack-test-support.mjs';
import * as trackAPI from '../verification/environment-phase3/track.mjs';
const out='verification/multitrack-phase2/';
const {getTrackDefinition,createRaceTrack,leaderboardStorageKey}=foundation;
const track=createRaceTrack(getTrackDefinition('neon-metro'));
const source=await fs.readFile('src/RaceScene.tsx','utf8');
const compile=s=>ts.transpileModule(s,{compilerOptions:{target:9,module:99}}).outputText;
const constants=source.slice(source.indexOf('const COUNTDOWN_SECONDS'),source.indexOf('type CarRuntime'));
const core=source.slice(source.indexOf('function createCar('),source.indexOf('function updateCamera('));
const engine=Function('THREE',...Object.keys(trackAPI),compile(constants+'const reusableForward=new THREE.Vector3(),reusableRight=new THREE.Vector3();'+core)+';return {createGame,updateAi,updatePlayer,resolveCarCollisions,updateCheckpoint,resetPlayerToTrack,makeHud};')(THREE,...Object.values(trackAPI));
const report={status:'RUNNING',length:track.length,checkpoints:track.checkpointTargets.length,checks:[],failures:[]};
function check(name,fn){try{fn();report.checks.push(name);}catch(e){report.failures.push({name,error:String(e)});}}
check('length, laps, checkpoints and independent route',()=>{assert(track.length>=1650&&track.length<=1800);assert.equal(track.lapCount,3);assert.equal(track.checkpointTargets.length,24);assert.notDeepEqual(track.samples,getTrackDefinition('sunset-loop').route.samples);});
let minClearance=Infinity,minRadius=Infinity,crossings=0;
const samples=track.samples,n=samples.length;
const cross=(a,b,c)=>(b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);
for(let i=0;i<n;i++){
 const a=samples[i],b=samples[(i+1)%n];
 const angle=Math.acos(THREE.MathUtils.clamp(a.tangent.dot(b.tangent),-1,1));if(angle>1e-8)minRadius=Math.min(minRadius,a.center.distanceTo(b.center)/angle);
 for(let j=i+2;j<n;j++){
  const gap=Math.min(j-i,n-(j-i));if(gap<2)continue;
  const c=samples[j].center,d=samples[(j+1)%n].center;
  if(cross(a.center,b.center,c)*cross(a.center,b.center,d)<0&&cross(c,d,a.center)*cross(c,d,b.center)<0)crossings++;
  if(gap*track.length/n>80)minClearance=Math.min(minClearance,a.center.distanceTo(c));
 }
}
report.geometry={minClearance,minRadius,crossings};
check('non-crossing road with separated blocks',()=>{assert.equal(crossings,0);assert(minClearance>2*(track.definition.roadWidth/2+4.8)+5);assert(minRadius>track.definition.roadWidth/2+4.8+1);});
const ai=engine.createGame(track,0,true);
check('six separated grid positions',()=>{assert.equal(ai.cars.length,6);for(let i=0;i<6;i++)for(let j=i+1;j<6;j++)assert(ai.cars[i].position.distanceTo(ai.cars[j].position)>7);});
check('grid lies on one straight',()=>{
 const headings=ai.cars.map(c=>trackAPI.sampleTrack(track,c.progress).tangent);for(const h of headings)assert(h.dot(headings[0])>.9999);
});
let maxAiLateral=0;
for(let i=0;i<16000&&!ai.cars.every(c=>c.finished);i++){
 for(const c of ai.cars)engine.updateAi(track,c,ai.cars,1/60,i/60);
 engine.resolveCarCollisions(track,ai.cars);
 for(const c of ai.cars)maxAiLateral=Math.max(maxAiLateral,Math.abs(trackAPI.nearestTrackSample(track,c.position).lateral));
}
report.ai=ai.cars.map(c=>({name:c.name,laps:c.completedLaps,finish:c.finishTime}));report.maxAiLateral=maxAiLateral;
check('six AI cars complete three laps within boundary',()=>{assert(ai.cars.every(c=>c.finished&&c.completedLaps===3));assert(maxAiLateral<track.definition.roadWidth/2+4.8);});
const game=engine.createGame(track,0,false),player=game.cars[0];let maxLateral=0,barrierFrames=0;
for(let i=0;i<35000&&!player.finished;i++){
 const near=trackAPI.nearestTrackSample(track,player.position),look=trackAPI.sampleTrack(track,near.progress+12/track.length),ahead=trackAPI.sampleTrack(track,near.progress+28/track.length);
 const angle=Math.atan2(look.center.x-player.position.x,look.center.z-player.position.z)-player.heading,error=Math.atan2(Math.sin(angle),Math.cos(angle));
 const turn=Math.acos(THREE.MathUtils.clamp(near.sample.tangent.dot(ahead.tangent),-1,1));const speed=turn>.55?17:turn>.25?22:30;
 const input={accelerate:player.speed<speed,brake:player.speed>speed+3,left:error>.04,right:error<-.04,handbrake:false,resetRequested:i===60};
 engine.updatePlayer(track,player,input,1/60,i/60);for(const c of game.cars.slice(1))engine.updateAi(track,c,game.cars,1/60,i/60);engine.resolveCarCollisions(track,game.cars);
 player.position.y=trackAPI.nearestTrackSample(track,player.position).surfaceHeight;
 maxLateral=Math.max(maxLateral,Math.abs(near.lateral));if(Math.abs(near.lateral)>track.definition.roadWidth/2+4.3)barrierFrames++;
}
report.player={laps:player.completedLaps,finish:player.finishTime,progress:player.progress,checkpoint:player.nextCheckpointIndex,maxLateral,barrierFrames};
check('player input completes three laps',()=>assert(player.finished&&player.completedLaps===3));
check('per-track reset and key isolation',()=>{engine.resetPlayerToTrack(track,player);assert(trackAPI.nearestTrackSample(track,player.position).distance<18);assert.equal(leaderboardStorageKey(track.definition,3),'sunset-loop-racer:top5:neon-metro:v2:laps3');assert.notEqual(leaderboardStorageKey(track.definition,3),leaderboardStorageKey(getTrackDefinition('sunset-loop'),3));});
check('minimap bounds and separate outline',()=>{const p=track.definition.minimap.projection;for(const s of samples){const point=p.project(s.center.x,s.center.z);assert(Number.isFinite(point.x)&&Number.isFinite(point.y));}});
check('outward driving blocked and missing checkpoints cannot be skipped',()=>{
 for(const progress of [.06,.22,.36,.51,.68,.84,.95]){
   const c=engine.createGame(track,0,false).cars[0],pose=trackAPI.sampleTrack(track,progress);
   c.position.copy(pose.center);c.progress=progress;c.lastProgress=progress;c.heading=trackAPI.tangentHeading(pose.normal);c.speed=0;c.velocity.set(0,0,0);
   for(let i=0;i<220;i++)engine.updatePlayer(track,c,{accelerate:true,brake:false,left:false,right:false,handbrake:false,resetRequested:false},1/60,i/60);
   assert(trackAPI.nearestTrackSample(track,c.position).distance<track.definition.roadWidth/2+5.1);
   assert.equal(c.completedLaps,0);
 }
 const skipped=engine.createGame(track,0,false).cars[0];skipped.lastProgress=.12;skipped.progress=.2;skipped.nextCheckpointIndex=0;engine.updateCheckpoint(track,skipped,10,0,.08);assert.equal(skipped.nextCheckpointIndex,0);
});
report.status=report.failures.length?'FAIL':'PASS';await fs.writeFile(out+'automated.json',JSON.stringify(report,null,2));console.log(report);if(report.failures.length)process.exitCode=1;
