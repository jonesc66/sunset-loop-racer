// Local-only Edge CDP acceptance helper. Run only after explicit user authorization
// for the alternative browser-control method. Uses Node built-ins, no downloads.
import fs from 'node:fs/promises';
import path from 'node:path';

const out=path.resolve('verification/environment-phase2');
const transcript=[];const print=console.log;
console.log=(...args)=>{transcript.push(args.map(x=>typeof x==='string'?x:JSON.stringify(x)).join(' '));print(...args);};
const target=await (await fetch('http://127.0.0.1:9224/json/new?about:blank',{method:'PUT'})).json();
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
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function waitFor(expression,timeout=45000){const start=Date.now();while(Date.now()-start<timeout){if(await evaluate(expression))return;await delay(500);}throw new Error('UI condition timed out: '+expression);}
async function click(label){
  const p=await evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim().toLowerCase()===${JSON.stringify(label.toLowerCase())});if(!b)throw new Error('Missing button');const r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
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
await command('Page.setWebLifecycleState',{state:'active'});
await Promise.all([command('Page.enable'),command('Runtime.enable'),command('Log.enable'),command('Network.enable')]);
await command('Log.clear');logs.length=0;requests.length=0;
const mode=process.argv[2]??'observe';
try{
  if(mode==='gallery'){
    await command('Page.navigate',{url:'http://127.0.0.1:5173/verification/environment-phase2/index.html'});
    await waitFor("document.querySelectorAll('img').length===32");
    await evaluate("document.querySelectorAll('img').forEach(i=>i.loading='eager')");
    await waitFor("[...document.images].every(i=>i.complete&&i.naturalWidth>0)");
    console.log('GALLERY_IMAGES',await evaluate('document.images.length'));await screenshot('gallery-preview.png');
  }else if(mode==='baseline'){
    await command('Page.navigate',{url:'http://127.0.0.1:5174/'});
    await waitFor("document.body.innerText.includes('Start Race')",90000);await delay(3000);
    console.log('BASELINE_GARAGE',await state());await screenshot('baseline-audio-garage.png');
  }else if(mode==='persistence'){
    await command('Page.navigate',{url:'http://127.0.0.1:5173/'});
    await waitFor("document.body.innerText.includes('Start Race')",90000);
    const before=await evaluate('JSON.stringify({...localStorage})');console.log('STORED_BEFORE_RELOAD',before);
    await command('Page.reload');await waitFor("document.body.innerText.includes('Start Race')",90000);
    const after=await evaluate('JSON.stringify({...localStorage})');if(before!==after)throw new Error('Leaderboard persistence changed on reload');
    console.log('STORED_AFTER_RELOAD',after);await screenshot('persistence-garage.png');
    await click('Start Race');await waitFor("document.querySelector('[aria-label=\"Graphics quality\"]')!==null");
    console.log('DEFAULT_QUALITY',await evaluate("[...document.querySelectorAll('[aria-label=\"Graphics quality\"] .activeQuality')].map(x=>x.textContent)"));
    await quality('low');console.log('LOW',await state());await quality('medium');console.log('MEDIUM',await state());
    await quality('high');await screenshot('all-presets-return-high.png');
  }else if(mode==='pair'){
    const p=process.argv[3]??'0.07',tag=p.replace('.','').padEnd(3,'0');
    await navigate('http://127.0.0.1:5173/?environmentInspect#'+p);
    await screenshot('high-'+tag+'.png');console.log('HIGH',await state());
    await quality('gpu');await delay(4000);
    await screenshot('gpu-'+tag+'.png');console.log('GPU',await state());
    await quality('high');await screenshot('return-high-'+tag+'.png');console.log('RETURN_HIGH',await state());
  }else if(mode==='tour'){
    await navigate('http://127.0.0.1:5173/?environmentInspect#0.00');await quality('gpu');
    for(const p of ['0.00','0.07','0.14','0.21','0.28','0.31','0.335','0.36','0.43','0.50','0.57','0.62','0.64','0.67','0.71','0.78','0.85','0.92','0.97']){
      await evaluate('location.hash='+JSON.stringify(p));await delay(3500);await screenshot('tour-gpu-'+p+'.png');console.log('TOUR',p,(await state()).replaceAll('\n',' '));
    }
    await quality('high');
  }else if(mode==='diagnose'){
    await quality('gpu');await delay(8000);
    console.log(await evaluate(`(async()=>{const url=performance.getEntriesByType('resource').map(x=>x.name).find(x=>x.includes('/@react-three_fiber.js'));const fiber=await import(url);const root=fiber._roots.get(document.querySelector('canvas'));const s=root.store.getState();const items=[];s.scene.traverse(o=>{if(o.isInstancedMesh)items.push({name:o.name,count:o.count,visible:o.visible,vertices:o.geometry.attributes.position.count,sphere:o.boundingSphere?.center.toArray(),radius:o.boundingSphere?.radius,first:[...o.instanceMatrix.array.slice(0,16)],material:o.material.type})});return JSON.stringify({items,stats:s.gl.info,resources:performance.getEntriesByType('resource').filter(x=>x.name.includes('forest')).map(x=>({url:x.name,size:x.transferSize,duration:x.duration}))})})()`));
    await screenshot('gpu-diagnostic.png');
  }else if(mode==='cycles'){
    await navigate('http://127.0.0.1:5173/?environmentInspect#0.14');
    for(let cycle=1;cycle<=3;cycle++){
      await quality('gpu');
      console.log('GPU_RESOURCES',cycle,await evaluate(`(async()=>{const u=performance.getEntriesByType('resource').map(x=>x.name).find(x=>x.includes('/@react-three_fiber.js'));const f=await import(u);const s=f._roots.get(document.querySelector('canvas')).store.getState();window.__disposedForest=0;s.scene.getObjectByName('gpu-forest').children.forEach(m=>m.addEventListener('dispose',()=>window.__disposedForest++));return s.gl.info.memory})()`));
      await quality('high');await delay(3000);
      const disposed=await evaluate('window.__disposedForest');console.log('DISPOSED_FOREST_BATCHES',cycle,disposed);
      if(disposed!==12)throw new Error('Expected all 12 forest instance buffers to dispose');
    }
    await screenshot('cycles-final-high.png');
  }else if(mode==='controls'){
    await navigate('http://127.0.0.1:5173/');await quality('perf');
    await evaluate("window.__acceptanceKeys=[];document.addEventListener('keydown',e=>window.__acceptanceKeys.push({code:e.code,trusted:e.isTrusted}),{capture:true})");
    const pose=()=>evaluate(`(async()=>{const url=performance.getEntriesByType('resource').map(x=>x.name).find(x=>x.includes('/@react-three_fiber.js'));const f=await import(url);const s=f._roots.get(document.querySelector('canvas')).store.getState();const car=s.scene.children.find(x=>Math.abs(x.scale.x-1.08)<.001);return {position:car.position.toArray(),rotation:car.rotation.toArray()}})()`);
    await key('w',3500);console.log('BEFORE_LEFT',await pose(),await state());
    await key('a',700);console.log('AFTER_LEFT',await pose());
    await key('d',1000);console.log('AFTER_RIGHT',await pose());
    await key('r',500);await key('w',3500);console.log('BEFORE_HANDBRAKE',await state());
    await key(' ',1800);console.log('AFTER_HANDBRAKE',await state());await screenshot('controls-moving-handbrake.png');
    console.log('KEY_EVENTS',await evaluate('window.__acceptanceKeys'));
  }else if(mode==='manual'){
    await navigate('http://127.0.0.1:5173/');await quality('perf');
    await command('Input.dispatchMouseEvent',{type:'mousePressed',x:640,y:420,button:'left',clickCount:1});
    await command('Input.dispatchMouseEvent',{type:'mouseReleased',x:640,y:420,button:'left',clickCount:1});
    await key('w',8000);console.log('ACCELERATE',await state());await screenshot('manual-accelerate.png');
    await key('s',2500);console.log('BRAKE',await state());
    await key('w',4000);await key('a',1200);await screenshot('manual-left.png');
    await key('d',1500);await screenshot('manual-right.png');
    await key(' ',1200);console.log('HANDBRAKE',await state());await screenshot('manual-handbrake.png');
    await key('r',500);await delay(500);console.log('RESET',await state());await screenshot('manual-reset.png');
    await click('Sound');console.log('SOUND_OFF',await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Sound').className"));
    await click('Sound');console.log('SOUND_ON',await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Sound').className"));
  }else if(mode==='race'){
    await navigate('http://127.0.0.1:5173/?autoRace');await quality('perf');
    const start=Date.now();let done=false;
    while(Date.now()-start<900000){const text=await state();console.log(new Date().toISOString(),text.replaceAll('\n',' '));if(text.includes('Race Complete')){done=true;break;}await delay(15000);}
    if(!done)throw new Error('Race did not complete within 15 minutes');
    await screenshot('phase2-race-complete.png');await fs.writeFile(path.join(out,'phase2-race-state.txt'),await state());
    await click('Race Again');await delay(500);console.log('RACE_AGAIN',await state());await screenshot('phase2-race-again.png');
  }else {console.log(await state());console.log(await evaluate('JSON.stringify({url:location.href,ready:document.readyState,html:document.documentElement.outerHTML.slice(0,2000)})'));await screenshot('diagnostic-current.png');}
}finally{
  await fs.writeFile(path.join(out,`transcript-${mode}-${process.argv[3]??'latest'}.txt`),transcript.join('\n'));
  await fs.writeFile(path.join(out,`cdp-${mode}-${process.argv[3]??'latest'}.json`),JSON.stringify({capturedAt:new Date().toISOString(),mode,logs,failedRequests:requests},null,2));
  console.log('LOGS',JSON.stringify({entries:logs.length,failedRequests:requests.length}));
  ws.close();await fetch('http://127.0.0.1:9224/json/close/'+target.id);
}
