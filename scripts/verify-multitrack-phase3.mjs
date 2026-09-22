import {beforeNeonArt} from './neon-art-baseline.mjs';
import fs from 'node:fs/promises';import assert from 'node:assert/strict';import crypto from 'node:crypto';import ts from 'typescript';import {foundation} from './multitrack-test-support.mjs';
const out='verification/multitrack-phase3/';const hashes=JSON.parse(await fs.readFile(out+'protected-hashes.json','utf8'));for(const[p,h]of Object.entries(hashes))assert.equal(crypto.createHash('sha256').update(await beforeNeonArt(p)).digest('hex'),h,p+' unchanged');
const app=await fs.readFile('src/App.tsx','utf8'),compile=s=>ts.transpileModule(s,{compilerOptions:{target:9,module:99}}).outputText;
const handlers=app.slice(app.indexOf('  function startRace()'),app.indexOf('  return (',app.indexOf('  function startRace()')));
const {getTrackDefinition,createRaceTrack,leaderboardStorageKey}=foundation;
const loader=app.slice(app.indexOf('const emptyTimeLeaderboard'),app.indexOf('const garageVehicleAssets'));
const store=new Map(),window={localStorage:{getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v)}};
const load=Function('window',compile(loader)+';return loadTimeLeaderboard;')(window);
const sunset=getTrackDefinition('sunset-loop'),neon=getTrackDefinition('neon-metro');const sk=leaderboardStorageKey(sunset,3),nk=leaderboardStorageKey(neon,3);
const record={time:110,vehicle:'sedan',playerName:'Existing',recordedAt:1};store.set(sk,JSON.stringify({race:[record],lap:[{...record,time:35}]}));store.set(nk,JSON.stringify({race:[{...record,playerName:'Neon'}],lap:[]}));const storageBefore=[...store];
for(const definition of [sunset,neon,sunset,neon]){
 const activeTrack=createRaceTrack(definition),state={},handled={current:true};let seed=7;
 const names=['createRaceTrack','getTrackDefinition','leaderboardStorageKey','loadTimeLeaderboard','defaultHudState','selectedTrackId','activeTrack','finishedRaceHandledRef','setActiveTrack','setLeaderboard','setNewRecords','setPerformanceStats','setHud','setResetSeed','setSelectionScreen','setSelectedTrackId'];
 const h=Function(...names,compile(handlers)+';return {startRace,leaveRace};')(createRaceTrack,getTrackDefinition,leaderboardStorageKey,load,{phase:'countdown',lap:1,checkpoint:0,timer:0,bestLapTime:null,results:[]},definition.id,activeTrack,handled,...['activeTrack','leaderboard','newRecords','performance','hud'].map(k=>v=>state[k]=v),fn=>seed=fn(seed),v=>state.screen=v,v=>state.selectedTrackId=v);
 h.leaveRace('car');assert.equal(state.screen,'car');assert.equal(state.selectedTrackId,definition.id);assert.deepEqual(state.hud.results,[]);assert.equal(state.performance,null);h.startRace();assert.equal(state.activeTrack.definition.id,definition.id);assert.equal(state.screen,'race');assert.equal(state.hud.timer,0);assert.equal(state.hud.bestLapTime,null);assert.equal(state.hud.checkpointTotal,definition.route.checkpointTargets.length);assert.equal(seed,8);assert(!handled.current);assert.deepEqual(state.leaderboard,load(leaderboardStorageKey(definition,3)));h.leaveRace('track');assert.equal(state.screen,'track');
}
assert.deepEqual([...store],storageBefore,'Navigation never clears or rewrites records');
assert.deepEqual(load(leaderboardStorageKey({...neon,timingVersion:'empty-fixture'},3)),{race:[],lap:[]});assert.notEqual(leaderboardStorageKey({...sunset,timingVersion:'future-fixture'},3),sk);
// Execute the actual result commit against an intentionally stale in-memory list.
const commit=app.slice(app.indexOf('    const playerResult ='),app.indexOf('  }, [hud.phase',app.indexOf('    const playerResult =')));
let committed;const runtime={phase:'finished',results:[{isPlayer:true,finished:true,time:105,bestLapTime:33}]};
Function('window','hud','finishedRaceHandledRef','playerName','selectedCarId','storageKey','leaderboard','setLeaderboard','setNewRecords',compile(loader+commit))(window,runtime,{current:false},'New','sedan',sk,{race:[],lap:[]},v=>committed=v,()=>{});
assert(committed.race.some(r=>r.playerName==='Existing'));assert(committed.race.some(r=>r.playerName==='New'));assert.equal(store.get(nk),storageBefore.find(([k])=>k===nk)[1]);
const result={status:'PASS',checks:['protected source hashes unchanged','Sunset/Neon repeated navigation handlers','fresh race transient reset','navigation does not mutate storage','isolated empty state','historical timing protection','result commit re-reads current identity and preserves newly available records'],nativeZhuyin:'NOT RUN'};await fs.writeFile(out+'automated.json',JSON.stringify(result,null,2));console.log(result);
