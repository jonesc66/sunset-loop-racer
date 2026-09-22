import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import ts from 'typescript';
import * as THREE from 'three';
import {createMountain} from '../verification/environment-phase3/benchmarkGeometry.mjs';
const source=await fs.readFile('src/App.tsx','utf8');
const key=source.match(/const TIME_LEADERBOARD_STORAGE_KEY = "([^"]+)"/)[1];
const compiled=ts.transpileModule(source.slice(source.indexOf('const TIME_LEADERBOARD_STORAGE_KEY'),source.indexOf('const garageVehicleAssets')),{compilerOptions:{target:9,module:99}}).outputText;
const old='bern-circuit-time-leaderboard-v1',entry={time:17.4,recordedAt:1,vehicle:'sportcar2',playerName:'Legacy'};
const storage=new Map([[old,JSON.stringify({race:[entry],lap:[entry]})],['unrelated','keep']]);
const api=Function('window',compiled+';return {load:loadTimeLeaderboard,add:addTopTime}')({localStorage:{getItem:k=>storage.get(k)??null}});
assert.deepEqual(api.load(),{race:[],lap:[]});
const next=api.add([],103,'sportcar2','New');storage.set(key,JSON.stringify({race:next.records,lap:[]}));
assert.equal(api.load().race[0].time,103);assert.equal(api.load().lap.length,0);
assert.equal(storage.get('unrelated'),'keep');assert(storage.has(old));
storage.set(key,'broken');assert.deepEqual(api.load(),{race:[],lap:[]});
const counts=[];
for(let i=0;i<8;i++){
 const g=createMountain(13+i*4.7,120,100,100,18);
 for(const a of Object.values(g.attributes))for(const x of a.array)assert(Number.isFinite(x));
 for(const ix of g.index.array)assert(ix>=0&&ix<g.attributes.position.count);
 g.computeBoundingBox();assert(g.boundingBox.max.x<=120*1.23&&g.boundingBox.min.x>=-120*1.23);
 const n=g.attributes.normal;for(let j=0;j<n.count;j++)assert(Math.abs(new THREE.Vector3().fromBufferAttribute(n,j).length()-1)<.001);
 counts.push(g.attributes.position.count);g.dispose();
}
const report={status:'PASS',key,checks:['legacy excluded','new record reload','unrelated settings preserved','corrupt storage','8 mountains finite attributes, indices, bounds and unit normals'],mountainVertices:counts};
await fs.writeFile('verification/recovery-20260912/record-art-tests.json',JSON.stringify(report,null,2));console.log(report);
