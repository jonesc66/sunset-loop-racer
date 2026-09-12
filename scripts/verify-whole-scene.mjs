import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import ts from 'typescript';
import * as THREE from 'three';
import * as trackAPI from '../verification/environment-phase3/track.mjs';
import {TRACK_ZONES,TUNNEL,BRIDGE} from '../verification/environment-phase3/trackZones.mjs';
import {roadDistance,randomSequence} from '../verification/environment-phase3/benchmarkGeometry.mjs';
const compile=s=>ts.transpileModule(s,{compilerOptions:{target:9,module:99,jsx:4}}).outputText;
const track=trackAPI.createTrack(),phase3=await fs.readFile('src/environment/Phase3Environment.tsx','utf8');
const placementsCode=phase3.slice(phase3.indexOf('export function environmentPlacements'),phase3.indexOf('function AssetBatch')).replace('export function','function');
const placements=Function('THREE','sampleTrack','tangentHeading','roadDistance','TRACK_ZONES','TUNNEL','BRIDGE',compile(placementsCode)+';return environmentPlacements;')(THREE,trackAPI.sampleTrack,trackAPI.tangentHeading,roadDistance,TRACK_ZONES,TUNNEL,BRIDGE)(track);
const source=await fs.readFile('src/environment/FullSceneArt.tsx','utf8');
const code=source.slice(source.indexOf('export function landscapeHeight'),source.indexOf('export function FullSceneDetails')).replaceAll('export function','function');
const {scenePlanting,settlementPaths}=Function('THREE','nearestTrackSample','sampleTrack','randomSequence',compile(code)+';return {scenePlanting,settlementPaths};')(THREE,trackAPI.nearestTrackSample,trackAPI.sampleTrack,randomSequence);
const trees=scenePlanting(track,placements),paths=settlementPaths(track,placements);
for(const tree of trees){assert(Number.isFinite(tree.position.y));assert(Math.abs(trackAPI.nearestTrackSample(track,tree.position).lateral)-tree.scale*4>18,'Plant canopy enters road');}
const art=await fs.readFile('src/environment/Phase4AEnvironment.tsx','utf8');
const basin=Function('THREE','sampleTrack',compile(art.slice(art.indexOf('function basin'),art.indexOf('const WATER_SURFACE_GLSL')))+';return basin;')(THREE,trackAPI.sampleTrack);
const surfaces=[paths];for(const [p,offset,rx,rz] of [[.445,0,100,85],[.76,-54,22,58],[.35,90,65,94]])for(const shore of [false,true]){
 const g=basin(track,p,offset,rx,rz,shore);if(!shore){const a=g.attributes.position;for(let i=0;i<a.count;i++)a.setY(i,a.getY(i)+.1);}surfaces.push(g);
}
const material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide}),meshes=surfaces.map(g=>new THREE.Mesh(g,material));
for(const g of surfaces){for(const a of Object.values(g.attributes))for(const value of a.array)assert(Number.isFinite(value));for(const index of g.index.array)assert(index>=0&&index<g.attributes.position.count);}
const ray=new THREE.Raycaster();for(let i=0;i<1200;i++)for(const offset of [-10,0,10]){const pose=trackAPI.sampleTrack(track,i/1200),p=pose.center.clone().addScaledVector(pose.normal,offset).add(new THREE.Vector3(0,.03,0));ray.set(p,new THREE.Vector3(0,1,0));ray.far=3;assert.equal(ray.intersectObjects(meshes,false).length,0,`Surface over road ${i} ${offset}`);}
const result={status:'PASS',date:new Date().toISOString(),trees:trees.length,pathVertices:paths.attributes.position.count,checks:['plant clearance','paths and three water bodies maximum-wave road clearance: 3600 rays','finite attributes and valid indices']};
await fs.writeFile('verification/environment-phase4a/whole-scene-tests.json',JSON.stringify(result,null,2));console.log(result);
