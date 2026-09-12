// Local-only Edge CDP acceptance helper. Run only after explicit user authorization
// for the alternative browser-control method (authorized in the Phase 3 conversation). Uses Node built-ins, no downloads.
import fs from 'node:fs/promises';
import path from 'node:path';

const out=path.resolve('verification/minimap');
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

async function mapState(){return evaluate(`(()=>({player:document.querySelector('[data-map-player]')?.getAttribute('transform'),rivals:document.querySelectorAll('[data-map-car]').length}))()`);}
async function layout(){return evaluate(`(()=>{const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height}};return {map:rect('.trackMinimap'),hud:rect('.hudTop'),buttons:rect('.graphicsControls'),width:innerWidth,height:innerHeight}})()`);}
function intersects(a,b){return a.x<b.right&&a.right>b.x&&a.y<b.bottom&&a.bottom>b.y;}
try{
 await navigate(base);await quality('perf');
 await waitFor("document.querySelector('[data-map-player]')!==null");
 const first=await mapState();if(first.rivals!==5)throw Error('Expected five rival markers');
 await key('w',3500);await delay(500);const moved=await mapState();if(first.player===moved.player)throw Error('Player marker did not move');
 await key('a',700);const steered=await mapState();
 await key('r',300);await delay(400);const reset=await mapState();if(reset.player===steered.player)throw Error('Reset did not update marker');
 report.checks.push({first,moved,steered,reset});
 for(const [width,height] of [[1280,720],[960,540],[640,360],[390,844]]){
  await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await delay(1200);
  const r=await layout();if(intersects(r.map,r.hud)||intersects(r.hud,r.buttons)||intersects(r.map,r.buttons))throw Error('HUD overlap '+JSON.stringify(r));
  if(r.map.x<0||r.map.right>width||r.buttons.right>width||r.buttons.bottom>height)throw Error('HUD outside viewport');
  report.checks.push({layout:r});await screenshot('minimap-'+width+'x'+height+'.png');
 }
 await command('Emulation.setDeviceMetricsOverride',{width:1280,height:720,deviceScaleFactor:1,mobile:false});
 for(const preset of ['high','gpu','perf']){await quality(preset);const m=await mapState();if(!m.player||m.rivals!==5)throw Error('Map lost on quality switch');report.checks.push({quality:preset,map:m});}
 await screenshot('minimap-desktop.png');
 await command('Page.reload');await waitFor("document.body?.innerText.includes('Start Race')");await click('Start Race');await waitFor("document.querySelectorAll('[data-map-car]').length===5");report.checks.push({reload:'PASS'});
 if(logs.some(l=>l.level==='error'||l.type==='error'||l.type==='exception')||requests.length)throw Error('Runtime errors');report.status='PASS';
}catch(error){report.status='FAIL';report.error=String(error);process.exitCode=1;await screenshot('failure.png').catch(()=>{});console.error(error);}
finally{report.ended=new Date().toISOString();await fs.writeFile(path.join(out,'runtime.json'),JSON.stringify(report,null,2));console.log(report.status,report.error??'',report.checks);await command('Page.navigate',{url:'about:blank'}).catch(()=>{});ws.close();}
