// Local Edge CDP fallback: actual browser inputs, no state/progress/time mutation.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const out='verification/multitrack-phase1/resumed-runtime/';
await fs.mkdir(out,{recursive:true});
const target=await (await fetch('http://127.0.0.1:9226/json/new?about:blank',{method:'PUT'})).json();
const ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.addEventListener('open',r,{once:true});ws.addEventListener('error',j,{once:true});});
let id=0;const pending=new Map(),errors=[],network=[];
ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p?.reject(Error(JSON.stringify(m.error))):p?.resolve(m.result);}if(m.method==='Runtime.exceptionThrown')errors.push(m.params);if(m.method==='Log.entryAdded'&&m.params.entry.level==='error')errors.push(m.params);if(m.method==='Network.loadingFailed')network.push(m.params);});
function cmd(method,params={}){return new Promise((resolve,reject)=>{const key=++id;pending.set(key,{resolve,reject});ws.send(JSON.stringify({id:key,method,params}));});}
async function evaluate(expression){const r=await cmd('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;}
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function wait(expression,ms=60000){const start=Date.now();while(Date.now()-start<ms){if(await evaluate("!!("+expression+")"))return;await delay(300);}throw Error('Timeout '+expression);}
async function click(label){const p=await evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim().toLowerCase()===${JSON.stringify(label.toLowerCase())});if(!b)throw Error('Missing button');const r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);await cmd('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...p});await cmd('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...p});}
async function shot(name){const r=await cmd('Page.captureScreenshot',{format:'png'});await fs.writeFile(out+name+'.png',Buffer.from(r.data,'base64'));}
const pressed=new Set();
async function keys(wanted){for(const key of new Set([...pressed,...wanted])){const down=wanted.includes(key);if(down===pressed.has(key))continue;await cmd('Input.dispatchKeyEvent',{type:down?'keyDown':'keyUp',key:key==='Space'?' ':key.toLowerCase(),code:key==='Space'?'Space':'Key'+key,windowsVirtualKeyCode:key==='Space'?32:key.charCodeAt(0)});down?pressed.add(key):pressed.delete(key);}}
process.once('SIGINT',()=>{keys([]).catch(()=>{}).then(()=>cmd('Page.navigate',{url:'about:blank'})).catch(()=>{}).finally(()=>{ws.close();process.exit(130);});});
const report={started:new Date().toISOString(),checks:{},trace:[],errors,network};
const base='http://127.0.0.1:5173/sunset-loop-racer/';
const storageKey='bern-circuit-time-leaderboard-v2-expanded-1525m-3laps';
try{
 await Promise.all([cmd('Page.enable'),cmd('Runtime.enable'),cmd('Log.enable'),cmd('Network.enable')]);
 await cmd('Emulation.setDeviceMetricsOverride',{width:640,height:360,deviceScaleFactor:1,mobile:false});
 await cmd('Page.navigate',{url:base});await wait("document.querySelector('.playerNameField input')");
 report.storageBefore=await evaluate('({...localStorage})');report.checks.load='PASS';
 await evaluate("document.querySelector('.playerNameField input').focus()");await cmd('Input.insertText',{text:'架構驗證'});assert((await evaluate("document.querySelector('.playerNameField input').value")).includes('架構驗證'));report.checks.chineseName='PASS';
 await click('Start Race');await wait("document.querySelectorAll('[data-map-car]').length===5");
 await click('perf');await delay(2000);await shot('perf-start');report.checks.startFlow='PASS';
 await evaluate(`(async()=>{const u=performance.getEntriesByType('resource').map(x=>x.name).find(x=>x.includes('/@react-three_fiber.js'));window.__qaFiber=await import(u);window.__qaTrackAPI=await import('${base}src/game/track.ts');window.__qaTrack=(await import('${base}src/game/trackRegistry.ts')).sunsetLoop.route;})()`);
 const sensor=`(()=>{const s=window.__qaFiber._roots.get(document.querySelector('canvas')).store.getState();const car=s.scene.children.find(x=>Math.abs(x.scale.x-1.08)<.001);const t=window.__qaTrackAPI,track=window.__qaTrack,n=t.nearestTrackSample(track,car.position),target=t.sampleTrack(track,n.progress+16/track.length).center;const forward=car.position.clone().set(0,0,1).applyQuaternion(car.quaternion),heading=Math.atan2(forward.x,forward.z);const angle=Math.atan2(target.x-car.position.x,target.z-car.position.z)-heading;return {progress:n.progress,lateral:n.lateral,error:Math.atan2(Math.sin(angle),Math.cos(angle)),position:car.position.toArray(),heading,speed:Number(document.querySelector('.hudTile strong').textContent)/3.6,lap:document.querySelectorAll('.hudTile strong')[1].textContent.trim(),cp:document.querySelectorAll('.hudTile small')[1].textContent.trim(),distance:s.camera.position.distanceTo(car.position),fov:s.camera.fov,finished:!!document.querySelector('.resultsPanel'),ai:[...document.querySelectorAll('[data-map-car]')].map(c=>[c.getAttribute('cx'),c.getAttribute('cy')]),environment:!!s.scene.getObjectByName('phase3-environment'),shaderErrors:s.gl.info.programs?.filter(p=>p.diagnostics&&!p.diagnostics.runnable).length}})()`;
 const initial=await evaluate(sensor);report.initial=initial;assert(initial.environment);assert.equal(initial.ai.length,5);report.checks.environmentAndSixCars='PASS';
 report.layouts=[];
 for(const [width,height] of [[640,360]]){await cmd('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await delay(300);const layout=await evaluate(`(()=>{const rect=s=>{const r=s.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom}};return {best:rect(document.querySelectorAll('.hudTile')[3]),map:rect(document.querySelector('.trackMinimap')),quality:rect(document.querySelector('.graphicsControls'))}})()`);const overlap=(a,b)=>a.x<b.right&&a.right>b.x&&a.y<b.bottom&&a.bottom>b.y;assert(!overlap(layout.best,layout.map)&&!overlap(layout.best,layout.quality)&&!overlap(layout.map,layout.quality));report.layouts.push({width,height,...layout});await shot('layout-'+width);}
 report.checks.hudOverlap='PASS';await cmd('Emulation.setDeviceMetricsOverride',{width:640,height:360,deviceScaleFactor:1,mobile:false});
 await click('perf');await delay(1000);
 report.checks.basicControls='PASS in previous browser run; this run focuses on complete driving';
 const begin=Date.now();let lastLog=0,maxSpeed=0,maxDistance=0;
 while(Date.now()-begin<1800000){
  const s=await evaluate(sensor);maxSpeed=Math.max(maxSpeed,s.speed);maxDistance=Math.max(maxDistance,s.distance);
  if(Date.now()-lastLog>5000){report.trace.push(s);console.log('DRIVE',s.lap,s.cp,'progress',s.progress.toFixed(3),'speed',s.speed.toFixed(1),'elapsed',Math.round((Date.now()-begin)/1000));lastLog=Date.now();await fs.writeFile(out+'runtime-progress.json',JSON.stringify(report,null,2));}
  if(s.finished){report.finish=s;break;}
  const wanted=[];if(s.speed<28)wanted.push('W');if(s.speed>32)wanted.push('S');if(s.error>.045)wanted.push('A');if(s.error<-.045)wanted.push('D');await keys(wanted);await delay(100);
 }
 await keys([]);assert(report.finish,'Keyboard-driven three-lap race did not finish');report.checks.keyboardDrivenThreeLaps='PASS';report.maxSpeed=maxSpeed;report.maxDistance=maxDistance;
 await delay(500);await shot('result');report.resultText=await evaluate('document.body.innerText');report.storageAfter=await evaluate('({...localStorage})');
 const saved=JSON.parse(report.storageAfter[storageKey]);assert(saved.race.length>0&&saved.lap.length>0);assert(report.resultText.includes('Personal Top 5'));report.checks.resultAndSave='PASS';
 for(const [k,v] of Object.entries(report.storageBefore))if(k!==storageKey)assert.equal(report.storageAfter[k],v,'Unrelated storage changed');
 const before=JSON.parse(report.storageBefore[storageKey]??'{"race":[],"lap":[]}');
 for(const kind of ['race','lap'])for(const row of before[kind])assert(saved[kind].some(r=>r.time===row.time&&r.recordedAt===row.recordedAt)||saved[kind].length===5&&saved[kind][4].time<=row.time,'Existing record lost outside normal Top 5 ranking');
 report.checks.existingRecordsCompatibility=before.race.length||before.lap.length?'PASS':'NOT RUN: no existing records in this test profile';
 await click('Race Again');await wait("document.querySelector('.countdown')");await shot('race-again');const again=await evaluate(sensor);assert.equal(again.lap.replace(/\s/g,''),'1/3');assert.equal(again.ai.length,5);report.checks.raceAgain='PASS';
 await cmd('Page.reload');await wait("document.querySelector('.playerNameField input')");assert.deepEqual(await evaluate('({...localStorage})'),report.storageAfter);report.checks.reloadPersistence='PASS';
 assert.equal(errors.length,0);assert.equal(network.length,0);report.checks.runtimeAndNetwork='PASS';report.status='PASS';
}catch(e){report.status='FAIL';report.error=String(e);console.error(e);await keys([]).catch(()=>{});await shot('failure').catch(()=>{});process.exitCode=1;}
finally{report.ended=new Date().toISOString();report.nativeZhuyin='NOT RUN';await fs.writeFile(out+'browser.json',JSON.stringify(report,null,2));console.log(report.status,report.error??report.checks);await cmd('Page.navigate',{url:'about:blank'}).catch(()=>{});ws.close();}