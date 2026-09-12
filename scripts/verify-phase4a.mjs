import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import ts from 'typescript';
import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as trackAPI from '../verification/environment-phase3/track.mjs';
import {BRIDGE} from '../verification/environment-phase3/trackZones.mjs';
const out='verification/environment-phase4a/';
const drivingPatches=JSON.parse(await fs.readFile('verification/driving-controls/authorized-patches.json','utf8'));
function beforeDrivingFix(file,source){const patch=drivingPatches.find(p=>p.file===file);if(!patch)return source;assert.equal(source.split(patch.after).length,2,file+' authorized driving patch');return source.replace(patch.after,patch.before);}
const hashes=JSON.parse(await fs.readFile(out+'baseline-hashes.json','utf8'));
// User-authorized reset for the expanded track: allow exactly the storage-key change.
// Preserve the original baseline hashes and verify every other App byte unchanged.
for(const file of ['src/game/track.ts','src/game/trackZones.ts','src/App.tsx','src/game/audio.ts','src/qualityPresets.ts']){
  let bytes=await fs.readFile(file);
  if(file==='src/App.tsx'){
    const source=beforeDrivingFix(file,bytes.toString('utf8'));
    const current='"bern-circuit-time-leaderboard-v2-expanded-1525m-3laps"';
    assert.equal(source.split(current).length,2,'Expanded track storage key occurs exactly once');
    bytes=Buffer.from(source.replace(current,'"bern-circuit-time-leaderboard-v1"').replace('import TrackMinimap from "./TrackMinimap";\r\n','').replace('\r\n      <TrackMinimap cars={hud.mapCars} />',''));
  }
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),hashes[file],file+' frozen except authorized record key');
}
let race=beforeDrivingFix('src/RaceScene.tsx',await fs.readFile('src/RaceScene.tsx','utf8'));
// User-requested read-only minimap telemetry; core gameplay remains frozen below.
race=race.replace('import { withMinimap } from "./game/minimap";\r\n','').replace('withMinimap(makeHud(game, clock.getElapsedTime()), game.cars)','makeHud(game, clock.getElapsedTime())').replace('withMinimap(makeHud(game, now), game.cars)','makeHud(game, now)');race=race.replaceAll('\r','');const before=(await fs.readFile(out+'src__RaceScene.tsx.before.txt','utf8')).replaceAll('\r','');
// Explicitly reverse only the whole-scene visual substitutions; gameplay remains byte-frozen below.
if(race.includes('FullSceneGround')){
 race=race.replace('import { FullSceneGround, NaturalForest } from "./environment/FullSceneArt";', 'import { GpuGround } from "./environment/GpuEnvironment";');
 race=race.replace('import { GLTFLoader }', 'import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";\nimport { GLTFLoader }');
 const a=race.indexOf('function InstancedForest('),b=race.indexOf('\nfunction Trees(',a);
 const ba=before.indexOf('function InstancedForest('),bb=before.indexOf('\nfunction Trees(',ba);
 assert.equal(race.slice(a,b).trim(),'function InstancedForest({ trees, castShadow }: { trees: TreeInstance[]; castShadow: boolean }) {\n  return <NaturalForest trees={trees} castShadow={castShadow} />;\n}');
 race=race.slice(0,a)+before.slice(ba,bb)+race.slice(b);
 const ga=before.indexOf('      {preset.enhancedEnvironment ? <GpuGround />'),gb=before.indexOf('      <BenchmarkLandscape',ga);
 race=race.replace('      <FullSceneGround />\n',before.slice(ga,gb));
 race=race.replace('{!preset.enhancedEnvironment && <Suspense fallback={null}><Trees','{!preset.enhancedEnvironment && <Trees').replace('        track={track}\n      /></Suspense>}','        track={track}\n      />}');
}
const inspectImport='import { applyArtDetailView } from "./environment/phase4aInspection";\n';
const inspectCall='    if (import.meta.env.DEV && new URLSearchParams(window.location.search).has("environmentInspect")) applyArtDetailView(camera, track, window.location.hash.slice(1));\n\n';
assert.equal(race.replace(inspectImport,'').replace(inspectCall,'').replace('import { Phase4AEnvironment } from "./environment/Phase4AEnvironment";\n','').replace('      <Suspense fallback={null}><Phase4AEnvironment track={track} quality={quality} /></Suspense>\n','').replaceAll('\r',''),before.replaceAll('\r',''),'RaceScene changes limited to environment mount and DEV camera');
const compile=s=>ts.transpileModule(s,{compilerOptions:{module:99,target:9,jsx:4}}).outputText;
const source=await fs.readFile('src/environment/Phase4AEnvironment.tsx','utf8');
const placementCode=source.slice(source.indexOf('export function phase4aPlacements'),source.indexOf('function Batch')).replace('export function','function');
const place=Function('THREE','sampleTrack','nearestTrackSample','tangentHeading','BRIDGE',compile(placementCode)+';return phase4aPlacements;')(THREE,trackAPI.sampleTrack,trackAPI.nearestTrackSample,trackAPI.tangentHeading,BRIDGE);
const terrainCode=source.slice(source.indexOf('export function artTerrain'),source.indexOf('function basin')).replace('export function','function');
const terrain=Function('THREE','BRIDGE','sampleTrack',compile(terrainCode)+';return artTerrain;')(THREE,BRIDGE,trackAPI.sampleTrack);
const track=trackAPI.createTrack(),placements=place(track);
const bytes=await fs.readFile('public/assets/environment/phase4a/environment.glb');
const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');gltf.scene.updateMatrixWorld(true);
const meshes=[],materialNames=new Set();
for(const p of placements){
 if(p.asset.startsWith('cliff')){const towardRoad=trackAPI.nearestTrackSample(track,p.position).sample.center.clone().sub(p.position).normalize();const face=new THREE.Vector3(-1,0,0).applyAxisAngle(new THREE.Vector3(0,1,0),p.heading);assert(face.dot(towardRoad)>.85,'Authored cliff face must face road');}

 for(let lod=0;lod<3;lod++)assert(gltf.scene.getObjectByName(p.asset+'_lod'+lod)?.isMesh);
 const a=gltf.scene.getObjectByName(p.asset+'_lod0');assert(a.userData.materialKey);materialNames.add(a.userData.materialKey);
 const mesh=new THREE.Mesh(a.geometry.clone().applyMatrix4(a.matrixWorld),new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));mesh.position.copy(p.position);mesh.rotation.set(p.pitch,p.heading,0,'YXZ');mesh.scale.copy(p.scale);mesh.updateMatrixWorld();mesh.name=p.asset;meshes.push(mesh);
}
const land=new THREE.Mesh(terrain(track),new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));land.updateMatrixWorld();
for(const m of [...meshes,land])for(const a of Object.values(m.geometry.attributes))for(const n of a.array)assert(Number.isFinite(n));
for(const index of land.geometry.index.array)assert(index>=0&&index<land.geometry.attributes.position.count,'Terrain index must reference a valid vertex');
const lake=trackAPI.sampleTrack(track,.35),lakeCenter=lake.center.clone().addScaledVector(lake.normal,90);
const landPos=land.geometry.attributes.position;
for(let i=0;i<landPos.count;i++){const p=new THREE.Vector3().fromBufferAttribute(landPos,i),n=trackAPI.nearestTrackSample(track,p);const d=p.clone().sub(lakeCenter),x=d.dot(lake.normal)/65,z=d.dot(lake.tangent)/94,a=Math.atan2(z,x),edge=1+.065*Math.sin(a*5)+.035*Math.cos(a*9);if(Math.abs(n.lateral)>24&&Math.hypot(x,z)<edge)assert(p.y<.18,'Lake terrain must remain below water');}
const ray=new THREE.Raycaster();
for(let i=200;i<500;i++)for(const lateral of [-10,0,10]){
 const s=trackAPI.sampleTrack(track,i/1000),p=s.center.clone().addScaledVector(s.normal,lateral);
 ray.set(p.clone().add(new THREE.Vector3(0,.25,0)),new THREE.Vector3(0,1,0));ray.far=2.5;
 assert.equal(ray.intersectObjects(meshes,false).length,0,`Vehicle clearance ${i} ${lateral}`);
 ray.set(p.clone().add(new THREE.Vector3(0,10,0)),new THREE.Vector3(0,-1,0));ray.far=9.85;
 assert.equal(ray.intersectObject(land,false).length,0,`Terrain covers road ${i}`);
}
const basinCode=source.slice(source.indexOf('function basin'),source.indexOf('function Water'));
const basin=Function('THREE','sampleTrack',compile(basinCode)+';return basin;')(THREE,trackAPI.sampleTrack);
const waterMeshes=[false,true].map(shore=>new THREE.Mesh(basin(track,.445,0,100,85,shore),new THREE.MeshBasicMaterial({side:THREE.DoubleSide})));
const waterPositions=waterMeshes[0].geometry.attributes.position;
// Conservative upper envelope of the two vertex waves (.065 + .035 m).
for(let i=0;i<waterPositions.count;i++)waterPositions.setY(i,waterPositions.getY(i)+.1);
assert(waterPositions.count>4000,'River requires a surface grid, not an edge-only ribbon');
for(const m of waterMeshes)m.updateMatrixWorld();
for(let i=0;i<600;i++)for(const lateral of [-10,0,10]){
 const s=trackAPI.sampleTrack(track,i/600),p=s.center.clone().addScaledVector(s.normal,lateral);
 ray.set(p.clone().add(new THREE.Vector3(0,.03,0)),new THREE.Vector3(0,1,0));ray.far=3;
 assert.equal(ray.intersectObjects(waterMeshes,false).length,0,`River surface covers road ${i} ${lateral}`);
}
const textures=await fs.readdir('public/assets/environment/phase4a/textures');assert.equal(textures.length,12);
for(const name of textures){const b=await fs.readFile('public/assets/environment/phase4a/textures/'+name);assert.equal(b.readUInt32BE(16),1024);assert.equal(b.readUInt32BE(20),1024);}
const result={status:'PASS',timestamp:new Date().toISOString(),length:track.length,checkpoints:track.checkpointTargets.length,placements:placements.length,glbBytes:bytes.length,materials:[...materialNames],textureImages:12,textureSize:1024,textureGpuMiB:64,checks:['frozen track / gameplay / HUD / audio / presets','30 GLB LOD meshes','authored cliff faces point toward road','lake terrain below water','finite geometry attributes','terrain indices in bounds','river and banks do not cover road','900 local vehicle and terrain rays','12 shared 1K PNG maps']};
await fs.writeFile(out+'automated-results.json',JSON.stringify(result,null,2));console.log(result);
