import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import ts from 'typescript';
import * as THREE from 'three';
import { foundation, beforeMultiTrack } from './multitrack-test-support.mjs';
import * as trackAPI from '../verification/environment-phase3/track.mjs';
const {sunsetLoop,getTrackDefinition,leaderboardStorageKey,createRaceTrack,trackRegistry}=foundation;
const read=p=>fs.readFile(p,'utf8');
const compile=s=>ts.transpileModule(s,{compilerOptions:{target:9,module:99}}).outputText;
const actual=await read('src/RaceScene.tsx'), original=beforeMultiTrack('src/RaceScene.tsx',actual);
function engine(source,constantStart){
 const constants=source.slice(source.indexOf(constantStart),source.indexOf('type CarRuntime'));
 const core=source.slice(source.indexOf('function createCar('),source.indexOf('function updateCamera('));
 return Function('THREE',...Object.keys(trackAPI),compile(constants+'const reusableForward=new THREE.Vector3(),reusableRight=new THREE.Vector3();'+core)+';return {createGame,updateAi,updatePlayer,resolveCarCollisions,updateCheckpoint,resetPlayerToTrack,makeHud};')(THREE,...Object.values(trackAPI));
}
const next=engine(actual,'const COUNTDOWN_SECONDS'),old=engine(original,'const TOTAL_LAPS');
const race=createRaceTrack(sunsetLoop),oldTrack=trackAPI.createTrack();
assert.equal(trackRegistry.size,2);assert.equal(getTrackDefinition('sunset-loop'),sunsetLoop);assert.throws(()=>getTrackDefinition('absent'));
assert.deepEqual(race.samples,oldTrack.samples);assert.deepEqual(race.checkpointTargets,oldTrack.checkpointTargets);
const a=next.createGame(race,0,true),b=old.createGame(oldTrack,0,true);
assert.deepEqual(a.cars,b.cars);
for(let i=0;i<7000;i++){
 const time=i/60;
 for(let j=0;j<6;j++){next.updateAi(race,a.cars[j],a.cars,1/60,time);old.updateAi(oldTrack,b.cars[j],b.cars,1/60,time);}
 next.resolveCarCollisions(race,a.cars);old.resolveCarCollisions(oldTrack,b.cars);
 assert.deepEqual(a.cars,b.cars,`AI differential frame ${i}`);
}
assert(a.cars.every(c=>c.finished&&c.completedLaps===3));
assert.deepEqual(next.makeHud(a,120),old.makeHud(b,120));
const pa=next.createGame(race,0,false).cars[0],pb=old.createGame(oldTrack,0,false).cars[0];
for(let i=0;i<13000&&!pa.finished;i++){
 const n=trackAPI.nearestTrackSample(race,pa.position),target=trackAPI.sampleTrack(race,n.progress+16/race.length).center;
 const angle=Math.atan2(target.x-pa.position.x,target.z-pa.position.z)-pa.heading,error=Math.atan2(Math.sin(angle),Math.cos(angle));
 const input={accelerate:pa.speed<32,brake:pa.speed>36,left:error>.05,right:error<-.05,handbrake:false,resetRequested:i===60};
 next.updatePlayer(race,pa,{...input},1/60,i/60);old.updatePlayer(oldTrack,pb,{...input},1/60,i/60);
 pa.position.y=trackAPI.nearestTrackSample(race,pa.position).surfaceHeight;pb.position.y=trackAPI.nearestTrackSample(oldTrack,pb.position).surfaceHeight;
 assert.deepEqual(pa,pb,`Player differential frame ${i}`);
}
assert(pa.finished&&pa.completedLaps===3);
// Translated synthetic fixture proves route/spawn/reset/AI/checkpoints/laps are
// supplied by configuration. This is test data, not a second playable track.
const shifted={...oldTrack,samples:oldTrack.samples.map(s=>({...s,center:s.center.clone().add(new THREE.Vector3(2000,0,-2000))})),checkpointTargets:[.25,.5,.75,0]};
const alternate={...sunsetLoop,id:'fixture-only',timingVersion:'test',defaultLapCount:1,route:shifted,aiRoute:shifted,respawn:p=>trackAPI.sampleTrack(shifted,p),spawns:{player:{progress:.9,laneOffset:2},ai:sunsetLoop.spawns.ai}};
const other=createRaceTrack(alternate),game=next.createGame(other,0,true);
assert(game.cars.every(c=>c.position.x>1500));assert(Math.abs(game.cars[0].progress-.9)<1e-12);
next.resetPlayerToTrack(other,game.cars[0]);assert(game.cars[0].position.x>1500);
for(let i=0;i<4000&&!game.cars.every(c=>c.finished);i++)for(const c of game.cars)next.updateAi(other,c,game.cars,1/60,i/60);
assert(game.cars.every(c=>c.finished&&c.completedLaps===1));
assert.equal(next.makeHud(game,100).checkpointTotal,4);assert.equal(next.makeHud(game,100).totalLaps,1);
assert.throws(()=>createRaceTrack(sunsetLoop,0));
const key=leaderboardStorageKey(sunsetLoop,3);
assert.equal(key,'bern-circuit-time-leaderboard-v2-expanded-1525m-3laps');
const keys=[key,leaderboardStorageKey(sunsetLoop,5),leaderboardStorageKey({...sunsetLoop,timingVersion:'future'},3),leaderboardStorageKey(alternate,3)];assert.equal(new Set(keys).size,4);
// A registry version bump must not silently rebind the old key to new geometry.
const existingTimingVersion=sunsetLoop.timingVersion;
try {
 sunsetLoop.timingVersion='future-registry-version';
 assert.notEqual(leaderboardStorageKey(sunsetLoop,3),key,'Registry version bump cannot inherit an incompatible legacy key');
} finally { sunsetLoop.timingVersion=existingTimingVersion; }
const record={time:123.4,vehicle:'sportcar2',playerName:'Existing',recordedAt:1};
const storage=new Map([[key,JSON.stringify({race:[record],lap:[{...record,time:40}]})],['bern-circuit-time-leaderboard-v1',JSON.stringify({race:[{...record,time:1}]})]]);
const bytes=[...storage];const app=await read('src/App.tsx');
const loader=app.slice(app.indexOf('const emptyTimeLeaderboard'),app.indexOf('function addTopTime'));
const load=Function('window',compile(loader)+';return loadTimeLeaderboard;')({localStorage:{getItem:k=>storage.get(k)??null}});
assert.deepEqual(load(key).race,[record]);for(const otherKey of keys.slice(1))assert.deepEqual(load(otherKey),{race:[],lap:[]});assert.deepEqual([...storage],bytes);
const projectionFactory=Function(compile(await read('src/game/minimap.ts')).replaceAll('export ','')+';return createMinimapProjection;')();
function minimapFactory(source){
 const start=source.indexOf('const map = useMemo(() => {')+'const map = useMemo(() => {'.length;
 const end=source.indexOf('  }, [',start);
 return Function('definition','sampleTrack','createTrack','createMinimapProjection',compile(source.slice(start,end)));
}
const currentMap=minimapFactory(await read('src/TrackMinimap.tsx'));
const oldMap=minimapFactory(await read('verification/multitrack-phase1/src__TrackMinimap.tsx.before.txt'));
const m=currentMap(sunsetLoop,trackAPI.sampleTrack),om=oldMap(null,null,trackAPI.createTrack,projectionFactory);
assert.equal(m.path,om.path);assert.deepEqual(m.start,om.start);assert.equal(m.startAngle,om.startAngle);assert.equal(m.scale,om.scale);
const altMapDefinition={...alternate,startFinish:{progress:.5},minimap:{route:shifted,projection:projectionFactory(shifted.samples.map(s=>s.center),220,160,20)}};
const am=currentMap(altMapDefinition,trackAPI.sampleTrack),startPoint=trackAPI.sampleTrack(shifted,.5).center;
assert.deepEqual(am.start,am.project(startPoint.x,startPoint.z));
for(const sample of shifted.samples){const p=am.project(sample.center.x,sample.center.z);assert(p.x>=19.999&&p.x<=200.001&&p.y>=19.999&&p.y<=140.001);}

const result={status:'PASS',checks:['exact Sunset route/checkpoints','six-car AI frame-by-frame differential','player physics including reset frame-by-frame differential: 3 laps','synthetic per-track spawn/AI/reset/checkpoints/lap fixture','unknown id rejected','track/version/laps key isolation including registry version bump','legacy records preserved without writes','old short-track records excluded','unchanged Sunset minimap path/scale/start/rotation','alternate minimap bounds and start marker'],browser:'Separate runtime evidence required'};
await fs.writeFile('verification/multitrack-phase1/automated.json',JSON.stringify(result,null,2));console.log(result);