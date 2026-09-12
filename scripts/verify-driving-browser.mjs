// Local-only Edge CDP acceptance helper. Run only after explicit user authorization
// for the alternative browser-control method (authorized in the Phase 3 conversation). Uses Node built-ins, no downloads.
import fs from 'node:fs/promises';
import path from 'node:path';

const out=path.resolve('verification/driving-controls');
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

async function focusState(){return evaluate("({tag:document.activeElement?.tagName,race:document.activeElement?.dataset.raceControls,readOnly:document.activeElement?.readOnly,inputMode:document.activeElement?.inputMode,value:document.activeElement?.value})");}
async function carView(){return evaluate(`(async()=>{const url=performance.getEntriesByType('resource').map(x=>x.name).find(x=>x.includes('/@react-three_fiber.js'));const f=await import(url);const s=f._roots.get(document.querySelector('canvas')).store.getState();const car=s.scene.children.find(x=>Math.abs(x.scale.x-1.08)<.001);return {position:car.position.toArray(),camera:s.camera.position.toArray(),distance:s.camera.position.distanceTo(car.position),fov:s.camera.fov,ui:document.body.innerText}})()`);}
try{
 await command('Page.navigate',{url:base});await waitFor("document.querySelector('.playerNameField input')!==null");
 const name=await evaluate("(()=>{const i=document.querySelector('.playerNameField input');i.focus();return {readOnly:i.readOnly,inputMode:i.inputMode}})()");if(name.readOnly)throw Error('Name input disabled');
 await command('Input.insertText',{text:'測試車手'});if(!(await evaluate("document.querySelector('.playerNameField input').value")).includes('測試車手'))throw Error('Chinese name entry failed');report.checks.push({nameEntry:'PASS'});
 await click('Start Race');await waitFor("document.querySelector('[data-race-controls]')!==null");await quality('high');
 const focus=await focusState();if(focus.race!=='true'||!focus.readOnly||focus.inputMode!=='none')throw Error('Race focus not readonly');report.checks.push({focus});
 const stopped=await carView();await screenshot('stopped.png');
 try{await command('Input.imeSetComposition',{text:'ㄅ',selectionStart:0,selectionEnd:1});report.checks.push({chromiumComposition:'sent'});}catch(error){report.checks.push({chromiumComposition:'readonly target refused composition',detail:String(error)});}
 if((await focusState()).value!=='')throw Error('Composition entered driving target');
 await command('Input.insertText',{text:'ㄅ'});if((await focusState()).value!=='')throw Error('Text inserted into driving target');
 await key('w',6500);await delay(300);const moving=await carView();if(!/SPEED\s*[1-9]/.test(moving.ui))throw Error('W did not accelerate');if(moving.distance>15)throw Error('Camera trails too far');await screenshot('driving.png');
 await key('a',700);await key('d',700);await key(' ',500);await key('s',1200);await key('r',300);await delay(500);const reset=await carView();if(!/SPEED\s*0\s*KM/.test(reset.ui))throw Error('Reset failed');
 const defaultPrevented=await evaluate("(()=>{const e=new KeyboardEvent('keydown',{code:'KeyW',key:'Process',keyCode:229,isComposing:true,bubbles:true,cancelable:true});document.activeElement.dispatchEvent(e);document.activeElement.dispatchEvent(new KeyboardEvent('keyup',{code:'KeyW',bubbles:true}));return e.defaultPrevented})()");if(!defaultPrevented)throw Error('Composition key not intercepted');
 report.checks.push({stopped,moving,reset,compositionKeyPrevented:defaultPrevented});
 await quality('gpu');if((await focusState()).race!=='true')throw Error('Quality click lost game focus');await screenshot('gpu-camera.png');
 await command('Emulation.setDeviceMetricsOverride',{width:640,height:360,deviceScaleFactor:1,mobile:false});await quality('perf');await screenshot('compact.png');
 await command('Page.reload');await waitFor("document.querySelector('.playerNameField input')!==null");if(await evaluate("document.querySelector('.playerNameField input').readOnly"))throw Error('Name input locked after reload');
 report.nativeWindowsIME='Not exercised in headless browser; readonly target and Chromium composition pipeline tested';
 if(logs.some(l=>l.level==='error'||l.type==='error'||l.type==='exception')||requests.length)throw Error('Runtime errors');report.status='PASS';
}catch(error){report.status='FAIL';report.error=String(error);process.exitCode=1;await screenshot('failure.png').catch(()=>{});console.error(error);}
finally{report.ended=new Date().toISOString();await fs.writeFile(path.join(out,'runtime.json'),JSON.stringify(report,null,2));console.log(report.status,report.error??'',report.checks);await command('Page.navigate',{url:'about:blank'}).catch(()=>{});ws.close();}
