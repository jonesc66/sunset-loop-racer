// Local-only Edge CDP acceptance helper. Run only after explicit user authorization
// for the alternative browser-control method (authorized in the Phase 3 conversation). Uses Node built-ins, no downloads.
import fs from 'node:fs/promises';
import path from 'node:path';

const out=path.resolve('verification/environment-phase4a');
const transcript=[];const print=console.log;
console.log=(...args)=>{transcript.push(args.map(x=>typeof x==='string'?x:JSON.stringify(x)).join(' '));print(...args);};
const target=await (await fetch('http://127.0.0.1:9225/json/new?about:blank',{method:'PUT'})).json();
const ws=new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
let id=0;const pending=new Map(),logs=[],requests=[];
ws.addEventListener('message',event=>{
  const m=JSON.parse(event.data);
  if(m.id){const p=pending.get(m.id);pending.delete(m.id);if(m.error)p?.reject(new Error(JSON.stringify(m.error)));else p?.resolve(m.result);}
  if(m.method==='Runtime.exceptionThrown')logs.push({type:'exception',...m.params});
  if(m.method==='Runtime.consoleAPICalled'&&['error','warning','warn'].includes(m.params.type))logs.push({type:'console',...m.params});
  if(m.method==='Log.entryAdded'&&['error','warning'].includes(m.params.entry.level))logs.push(m.params.entry);
  if(m.method==='Network.loadingFailed')requests.push(m.params);
});
function command(method,params={}){return new Promise((resolve,reject)=>{const key=++id;const timer=setTimeout(()=>{pending.delete(key);reject(new Error('CDP timeout: '+method));},60000);timer.unref();pending.set(key,{resolve:r=>{clearTimeout(timer);resolve(r);},reject:e=>{clearTimeout(timer);reject(e);}});ws.send(JSON.stringify({id:key,method,params}));});}
async function evaluate(expression){const r=await command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));return r.result.value;}
process.once('SIGINT',()=>{command('Page.navigate',{url:'about:blank'}).catch(()=>{}).finally(()=>{ws.close();process.exit(130);});});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function waitFor(expression,timeout=45000){const start=Date.now();while(Date.now()-start<timeout){if(await evaluate(expression))return;await delay(500);}throw new Error('UI condition timed out: '+expression);}
async function click(label){
  const p=await evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim().toLowerCase()===${JSON.stringify(label.toLowerCase())});if(!b)throw new Error('Missing button');b.scrollIntoView({block:'center'});const r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
  await command('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...p});
  await command('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...p});
}
async function state(){return await evaluate('document.body.innerText');}
async function screenshot(name){const r=await command('Page.captureScreenshot',{format:'png'});await fs.writeFile(path.join(out,name),Buffer.from(r.data,'base64'));}
async function navigate(url){await command('Page.navigate',{url:'about:blank'});await command('Page.navigate',{url});await waitFor("[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Start Race')",90000);await click('Start Race');await waitFor("document.querySelector('[aria-label=\"Graphics quality\"]')!==null");await delay(5000);}
async function quality(name){await click(name);await waitFor(`[...document.querySelectorAll('.activeQuality')].some(b=>b.textContent.trim().toLowerCase()===${JSON.stringify(name.toLowerCase())})`);
  if(name==='gpu')await waitFor(`(async()=>{const url=performance.getEntriesByType('resource').map(x=>x.name).find(x=>x.includes('/@react-three_fiber.js'));if(!url)return false;const f=await import(url);const r=f._roots.get(document.querySelector('canvas'));const forest=r?.store.getState().scene.getObjectByName('gpu-forest');return !!forest&&forest.children.some(m=>m.count>0)})()`,120000);
  await delay(4000);
}
async function key(key,ms){const code=key===' '?'Space':'Key'+key.toUpperCase();await command('Input.dispatchKeyEvent',{type:'keyDown',key,code,windowsVirtualKeyCode:key.toUpperCase().charCodeAt(0)});await delay(ms);await command('Input.dispatchKeyEvent',{type:'keyUp',key,code,windowsVirtualKeyCode:key.toUpperCase().charCodeAt(0)});}
await command('Emulation.setDeviceMetricsOverride',{width:1280,height:720,deviceScaleFactor:1,mobile:false});
await command('Page.setWebLifecycleState',{state:'active'});
await Promise.all([command('Page.enable'),command('Runtime.enable'),command('Log.enable'),command('Network.enable')]);
await command('Log.clear');logs.length=0;requests.length=0;
const base='http://127.0.0.1:5173/sunset-loop-racer/';
const mode=process.argv[2]??'after';
if(mode==='regression')await command('Emulation.setDeviceMetricsOverride',{width:640,height:360,deviceScaleFactor:1,mobile:false});
const report={mode,started:new Date().toISOString(),views:[],checks:[],logs,requests};
async function sceneState(){return evaluate(`(async()=>{const u=performance.getEntriesByType('resource').map(x=>x.name).find(x=>x.includes('/@react-three_fiber.js'));if(!u)return null;const f=await import(u);const s=f._roots.get(document.querySelector('canvas'))?.store.getState();if(!s)return null;return {stats:s.gl.info.render,resources:s.gl.info.memory,phase3:!!s.scene.getObjectByName('phase3-environment'),phase4a:!!s.scene.getObjectByName('phase4a-environment'),render:{colorSpace:s.gl.outputColorSpace,toneMapping:s.gl.toneMapping,exposure:s.gl.toneMappingExposure,antialias:s.gl.getContext().getContextAttributes().antialias},shaderErrors:s.gl.info.programs?.filter(p=>p.diagnostics && !p.diagnostics.runnable).length,batches:s.scene.getObjectByName('phase3-environment')?.children.filter(x=>x.isInstancedMesh).length}})()`);}
async function view(zone,preset){
  await evaluate('location.hash='+JSON.stringify(zone));await delay(2400);
  const readyStart=Date.now();
  while(!(await sceneState())?.phase3 || (mode!=='before' && !(await sceneState())?.phase4a)){if(Date.now()-readyStart>90000)throw new Error('Environment asset loading timed out');await delay(500);}
  await delay(1500);
  if((await sceneState())?.shaderErrors)throw new Error('Shader compilation failed');
  await screenshot(mode+'-'+zone+'-'+preset+'.png');
  const snapshot={zone,preset,text:await state(),scene:await sceneState()};report.views.push(snapshot);console.log('VIEW',zone,preset,snapshot.scene);
}
try{
  await navigate(base+(['manual','controls'].includes(mode)?'':'?autoRace&environmentInspect#A'));
  await waitFor(`document.body.innerText.includes('SOFTWARE')||document.body.innerText.includes('GPU')`);
  console.log('LOADED',await sceneState());
  if(['manual','controls'].includes(mode)){
    await quality('perf');await key('w',4000);await screenshot('manual-accelerate.png');report.checks.push({accelerate:await state()});
    if(mode==='manual'){
    const held=new Set();
    const setKey=async(k,on)=>{if(held.has(k)===on)return;await command('Input.dispatchKeyEvent',{type:on?'keyDown':'keyUp',key:k,code:'Key'+k.toUpperCase(),windowsVirtualKeyCode:k.toUpperCase().charCodeAt(0)});if(on)held.add(k);else held.delete(k);};
    const driverStart=Date.now();let lastZone=-1;
    try{
      while(Date.now()-driverStart<900000){
        const pose=await evaluate(`(async()=>{const url=performance.getEntriesByType('resource').map(x=>x.name).find(x=>x.includes('/@react-three_fiber.js'));const f=await import(url);const s=f._roots.get(document.querySelector('canvas')).store.getState();const car=s.scene.children.find(x=>Math.abs(x.scale.x-1.08)<.001);const t=await import('${base}src/game/track.ts');const track=t.createTrack();const nearest=t.nearestTrackSample(track,car.position);const ahead=t.sampleTrack(track,nearest.progress+16/track.length);const desired=Math.atan2(ahead.center.x-car.position.x,ahead.center.z-car.position.z);const delta=desired-car.rotation.y;return {progress:nearest.progress,lateral:nearest.lateral,error:Math.atan2(Math.sin(delta),Math.cos(delta)),text:document.body.innerText}})()`);
        if(/LAP\s*2\s*\//.test(pose.text)){report.playerLap={status:'PASS',text:pose.text};break;}
        const speed=Number(pose.text.match(/SPEED\s*(\d+)/)?.[1]??0)/3.6;
        await setKey('a',pose.error>.05);await setKey('d',pose.error<-.05);await setKey('w',speed<32);await setKey('s',speed>36);
        const zone=Math.floor(pose.progress*10);if(zone!==lastZone){console.log('PLAYER_KEYBOARD_ZONE',zone,pose.progress,pose.lateral);lastZone=zone;}
        await delay(180);
      }
    }finally{for(const k of [...held])await setKey(k,false);}
    if(!report.playerLap)throw new Error('Keyboard-controlled player did not complete a valid lap');
    await screenshot('manual-full-lap.png');
    }
    await key('a',500);await key('d',500);await key(' ',800);await screenshot('manual-handbrake.png');
    await key('s',2500);await key('r',700);
    await waitFor(`/SPEED\\s*0\\s*KM/.test(document.body.innerText)`,10000);
    report.resetConfirmed=true;await screenshot('manual-reset.png');report.checks.push({reset:await state()});
  }else if(mode==='before'||mode==='after'){
    for(const preset of ['high','gpu']){await quality(preset);for(const zone of ['0.205','0.25','0.303','0.355','0.401','E-overview','0.486'])await view(zone,preset);}
    for(const preset of ['high','gpu','high']){await quality(preset);report.checks.push({switch:preset,scene:await sceneState()});}
  }else if(mode==='full-before'||mode==='full-after'){
    for(const preset of (mode==='full-before'?['high']:['high','gpu'])){
      await quality(preset);for(const zone of ['A','B','C','D','E','F','G','H','I','J','I-entrance','I-exit'])await view(zone,preset);
    }
  }else if(mode==='river-video'){
    await quality('high');await view('E-detail','high');
    const recording=await evaluate(`(async()=>{
      const canvas=document.querySelector('canvas'),stream=canvas.captureStream(8);
      const recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp8',videoBitsPerSecond:1800000}),chunks=[];
      recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};
      const stopped=new Promise(r=>recorder.onstop=r);recorder.start();await new Promise(r=>setTimeout(r,12000));recorder.stop();await stopped;stream.getTracks().forEach(t=>t.stop());
      const blob=new Blob(chunks,{type:'video/webm'}),bytes=new Uint8Array(await blob.arrayBuffer());let binary='';
      for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
      return {base64:btoa(binary),size:blob.size,width:canvas.width,height:canvas.height};
    })()`);
    await fs.writeFile(path.join(out,'river-flow.webm'),Buffer.from(recording.base64,'base64'));
    report.checks.push({video:{bytes:recording.size,width:recording.width,height:recording.height}});
    if(recording.size<10000)throw new Error('River recording unexpectedly empty');
  }else if(mode==='river'){
    for(const preset of ['high','gpu']){
      await quality(preset);
      for(const zone of ['E-detail','E-overview','D-detail'])await view(zone,preset);
      await view('E-detail',preset);await delay(1800);await screenshot('river-motion-'+preset+'.png');
    }
  }else if(mode==='c-probe'){
    await view('C-detail','high');
  }else if(mode==='closeups'){
    for(const preset of ['high','gpu']){
      await quality(preset);
      for(const [label,hash] of [['cliff-closeup','C-detail'],['shoreline-closeup','D-detail'],['bridge-closeup','E-detail'],['house-closeup','F-detail']]){
        await view(hash,preset);await screenshot(label+'-'+preset+'.png');
      }
    }
  }else if(mode==='resources'){
    await view('0.25','high');
    for(const preset of ['gpu','high','gpu','high']){
      await evaluate(`(async()=>{const u=performance.getEntriesByType('resource').map(x=>x.name).find(x=>x.includes('/@react-three_fiber.js'));const f=await import(u);const root=f._roots.get(document.querySelector('canvas')).store.getState().scene.getObjectByName('phase4a-environment');const owned=new Set();root.traverse(m=>{if(m.material&&['rock','weathered-rock','lakeshore-stone','concrete','aged-concrete','painted-metal','dark-metal','gravel'].includes(m.material.name))owned.add(m.material)});window.__artDisposals={expected:owned.size,disposed:0};for(const m of owned)m.addEventListener('dispose',()=>window.__artDisposals.disposed++);})()`);
      await quality(preset);const disposal=await evaluate('window.__artDisposals');
      if(disposal.expected===0||disposal.disposed<disposal.expected)throw new Error('Owned materials not disposed on preset replacement');
      report.checks.push({preset,disposal,scene:await sceneState()});
    }
    report.loadedAssets=await evaluate(`performance.getEntriesByType('resource').map(x=>x.name).filter(x=>x.includes('/phase4a/'))`);
  }else if(mode==='overviews'){
    for(const zone of ['D-overview','E-overview'])await view(zone,'high');
    await quality('gpu');
    for(const zone of ['D-overview','E-overview'])await view(zone,'gpu');
  }else{
    await waitFor(`!!window.__raceTestState`,60000);
    if(mode!=='regression'){
    for(const zone of ['A','B','C','D','E','F','G','H','I-entrance','I-interior','I-exit','J'])await view(zone,'high');
    await quality('gpu');
    for(const zone of ['A','C','E','F','H','I-interior','J'])await view(zone,'gpu');
    for(const preset of ['high','gpu','high','low','medium','perf']){await quality(preset);report.checks.push({switch:preset,scene:await sceneState()});}
    }else{await quality('perf');}
    if(mode==='visual'){
      await evaluate("location.hash='NaN'");
      const contactExpression=`(async()=>{const u=performance.getEntriesByType('resource').map(x=>x.name).find(x=>x.includes('/@react-three_fiber.js'));const f=await import(u);const s=f._roots.get(document.querySelector('canvas')).store.getState();const car=s.scene.children.find(x=>Math.abs(x.scale.x-1.08)<.001);const t=await import('${base}src/game/track.ts');const track=t.createTrack(),n=t.nearestTrackSample(track,car.position);const a=t.sampleTrack(track,n.progress-1/track.samples.length).center,b=t.sampleTrack(track,n.progress+1/track.samples.length).center;const grade=(b.y-a.y)/Math.hypot(b.x-a.x,b.z-a.z);const d=car.position.clone().set(0,0,1).applyQuaternion(car.quaternion);const h=Math.hypot(d.x,d.z);const expected=Math.atan(grade*(d.x*n.sample.tangent.x+d.z*n.sample.tangent.z)/h);return {progress:n.progress,grade,expected,actual:Math.atan2(d.y,h)}})()`;
      await waitFor(`(async()=>Math.abs((await ${contactExpression}).grade)>.025)()`,90000);
      const contact=await evaluate(contactExpression);
      if(Math.abs(contact.actual-contact.expected)>.03)throw new Error('Rendered car pitch does not match grade');
      report.checks.push({slopeContact:contact});await screenshot('final-grade-driving.png');
    }
    if(mode!=='visual'){
    await evaluate("location.hash='NaN'"); // existing inspection mode falls back to the normal chase camera
    const start=Date.now();let last='';
    while(Date.now()-start<1200000){
      const race=await evaluate('window.__raceTestState');
      const text=await state();const progress=text.match(/LAP[\s\S]{0,45}/)?.[0]??text.slice(0,70);
      if(progress!==last){console.log('RACE',progress,race?.finishedCount);last=progress;}
      if(race?.phase==='finished')break;
      await delay(10000);
    }
    const race=await evaluate('window.__raceTestState');
    if(race?.phase!=='finished'||race.finishedCount!==race.totalCars)throw new Error('All-car three-lap race did not finish');
    if(mode==='regression'){await command('Emulation.setDeviceMetricsOverride',{width:1280,height:720,deviceScaleFactor:1,mobile:false});await delay(2000);}
    report.race=race;await screenshot('final-race-complete.png');await fs.writeFile(path.join(out,'final-race-complete.txt'),await state());
    await click('Race Again');await waitFor(`window.__raceTestState?.phase==='countdown'`);await screenshot('final-race-again.png');
    report.checks.push({raceAgain:await state()});
    await command('Page.navigate',{url:base});await waitFor(`document.body?.innerText.includes('Start Race')`);
    const stored=await evaluate('JSON.stringify({...localStorage})');await command('Page.reload');await waitFor(`document.body?.innerText.includes('Start Race')`);
    if(stored!==await evaluate('JSON.stringify({...localStorage})'))throw new Error('Persistence changed across reload');
    report.checks.push({persistence:'PASS'});
    }
  }
  if(logs.some(l=>l.level==='error'||l.type==='error'||l.type==='exception')||requests.length)throw new Error('Runtime errors or failed requests');
  report.status='PASS';
}catch(error){report.status='FAIL';report.error=String(error);console.error(error);process.exitCode=1;await screenshot('failure-'+mode+'.png').catch(()=>{});report.failedState=await state().catch(()=>null);}
finally{
  report.ended=new Date().toISOString();await fs.writeFile(path.join(out,'cdp-'+mode+'.json'),JSON.stringify(report,null,2));
  await fs.writeFile(path.join(out,'final-console.json'),JSON.stringify({logs,requests},null,2));
  await fs.writeFile(path.join(out,'console-'+mode+'.json'),JSON.stringify({logs,requests},null,2));
  await fs.writeFile(path.join(out,'transcript-'+mode+'.txt'),transcript.join('\n'));
  await command('Page.navigate',{url:'about:blank'}).catch(()=>{});ws.close();
}
