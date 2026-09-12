import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import ts from 'typescript';
import * as THREE from 'three';
const read=async p=>(await fs.readFile(p,'utf8')).replaceAll('\r\n','\n');
const compile=s=>ts.transpileModule(s,{compilerOptions:{target:9,module:99}}).outputText;
function cameraTest(source,speed,dt){
 const body=source.slice(source.indexOf('function updateCamera('),source.indexOf('function trimPool'));
 const f=Function('THREE',compile('const reusableForward=new THREE.Vector3(),desiredCamera=new THREE.Vector3(),cameraTarget=new THREE.Vector3(),cameraMotion=new THREE.Vector3();const cameraPositions=new WeakMap();'+body)+';return updateCamera;')(THREE);
 const camera=new THREE.PerspectiveCamera(58,16/9,.1,500);camera.position.set(0,3,-9);
 const player={position:new THREE.Vector3(),heading:0,speed};
 for(let i=0;i<Math.ceil(8/dt);i++){player.position.z+=speed*dt;f(camera,player,dt);}
 camera.updateMatrixWorld();
 const left=player.position.clone().add(new THREE.Vector3(-1,1,0)).project(camera),right=player.position.clone().add(new THREE.Vector3(1,1,0)).project(camera);
 assert(Number.isFinite(camera.fov));assert.equal(player.speed,speed);assert.equal(player.heading,0);
 return {distance:camera.position.distanceTo(player.position),fov:camera.fov,screenWidth:Math.abs(right.x-left.x)};
}
const source=await read('src/RaceScene.tsx'),before=await read('verification/driving-controls/src__RaceScene.tsx.before.txt');
const stopped=cameraTest(source,0,1/60),fast=cameraTest(source,68,1/60),slowFrames=cameraTest(source,68,1/15),old=cameraTest(before,68,1/60);
assert(fast.distance<12);assert(fast.screenWidth>old.screenWidth*1.7);assert(fast.screenWidth/stopped.screenWidth>.65);assert(Math.abs(fast.distance-slowFrames.distance)<.05);
class Element{isContentEditable=false;dataset={};}class Input extends Element{}class Textarea extends Element{}class Select extends Element{}
const handlers=new Map();const document={activeElement:null,addEventListener:(n,f)=>handlers.set(n,f),removeEventListener:()=>{}};const window={addEventListener:(n,f)=>handlers.set('window:'+n,f),removeEventListener:()=>{}};
const keyboard=(await read('src/game/useKeyboard.ts')).replace(/^import .*$/gm,'');
const hook=Function('useEffect','useRef','document','window','HTMLElement','HTMLInputElement','HTMLTextAreaElement','HTMLSelectElement',compile(keyboard).replace('export function','function')+';return useKeyboard;')(f=>f(),v=>({current:v}),document,window,Element,Input,Textarea,Select);
const input=hook(),sink=new Input();sink.dataset.raceControls='true';document.activeElement=sink;
function event(code,down,extra={}){let prevented=false;handlers.get(down?'keydown':'keyup')({target:document.activeElement,code,keyCode:0,repeat:false,preventDefault(){prevented=true;},...extra});return prevented;}
assert(event('KeyW',true,{key:'Process',keyCode:229,isComposing:true}));assert(input.current.accelerate);event('KeyW',false);assert(!input.current.accelerate);
event('KeyA',true);event('KeyD',true);event('KeyA',false);assert(!input.current.left&&input.current.right);handlers.get('window:blur')();assert(!input.current.right);
assert(event('ArrowUp',true));assert(input.current.accelerate);handlers.get('visibilitychange')();assert(!input.current.accelerate);
document.activeElement=new Input();assert(!event('KeyW',true));assert(!input.current.accelerate);
document.activeElement=sink;event('',true,{keyCode:87});assert(input.current.accelerate);event('',false,{keyCode:87});assert(!input.current.accelerate);
const report={status:'PASS',camera:{stopped,fast,slowFrames,old},input:['composition Process with physical code','independent simultaneous keys','keyup','blur','visibility','arrow suppression','name input preserved','legacy physical key fallback']};await fs.writeFile('verification/driving-controls/unit.json',JSON.stringify(report,null,2));console.log(report);
