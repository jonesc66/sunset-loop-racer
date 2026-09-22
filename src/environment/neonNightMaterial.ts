import * as THREE from 'three';
// Atlas categories are preserved: no Phase 4 geometry or textures are rebuilt.
export function nightMaterial(source:THREE.MeshStandardMaterial,kind:'modern'|'residential'|'traditional'|'pagoda'|'arena'|'sakura'|'green'){
 const mat=source.clone();mat.name='night-'+kind;mat.userData.nightKind=kind;
 mat.onBeforeCompile=shader=>{
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 nightLocal; varying vec3 nightSeed; varying vec3 nightNormal;');
  shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
   nightLocal=position;nightNormal=normal;
   #ifdef USE_INSTANCING
   nightSeed=instanceMatrix[3].xyz;
   #else
   nightSeed=modelMatrix[3].xyz;
   #endif`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
   varying vec3 nightLocal;varying vec3 nightSeed;varying vec3 nightNormal;
   float nightHash(vec3 p){p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}`);
  const windows=kind==='modern'||kind==='residential'||kind==='traditional';
  shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
   float tile=floor(vMapUv.x*4.0)+4.0*floor(vMapUv.y*4.0);
   float glass=step(7.5,tile)*step(tile,10.5);
   vec2 uvCell=fract(vMapUv*4.0);
   vec3 cell=floor(nightLocal/vec3(2.8,3.4,2.8));
   vec3 stableSeed=floor(nightSeed+.5);
   float seed=nightHash(cell+stableSeed*.173);
   float floorSeed=nightHash(vec3(floor(nightLocal.y/3.4),stableSeed.x,stableSeed.z));
   ${windows?`float windowOn=step(${kind==='traditional'?'.37':'.49'},seed)*step(.16,floorSeed);
    float colorSeed=nightHash(cell+stableSeed*.173+vec3(19.7,43.1,7.3));
    vec3 windowColor=mix(vec3(.62,.79,1.0),vec3(1.,.60,.26),${kind==='traditional'?'1.0':kind==='residential'?'step(.25,colorSeed)':'step(.78,colorSeed)'});
    vec2 pane=fract(vec2(abs(nightNormal.z)>.5?nightLocal.x:nightLocal.z,nightLocal.y)/vec2(2.8,3.4));
    float frame=smoothstep(.06,.12,pane.x)*(1.-smoothstep(.88,.94,pane.x))*smoothstep(.07,.13,pane.y)*(1.-smoothstep(.84,.94,pane.y));
    totalEmissiveRadiance+=windowColor*glass*windowOn*frame*${kind==='traditional'?'1.5':'2.0'};
    diffuseColor.rgb*=mix(1.,.43,glass*(1.-windowOn));`:''}
   ${kind==='traditional'?`float wood=1.-step(.5,tile);float facade=max(0.,-nightNormal.z);totalEmissiveRadiance+=diffuseColor.rgb*vec3(.56,.28,.10)*exp(-abs(nightLocal.y-2.3)*.20)*facade*(.35+.65*wood);`:''}
   ${kind==='pagoda'?`float warmSurface=step(.5,tile)*(1.-step(1.5,tile))+step(3.5,tile)*step(tile,6.5);float upward=.45+.55*max(0.,-nightNormal.y);float roof=step(1.5,tile)*step(tile,2.5);totalEmissiveRadiance+=diffuseColor.rgb*vec3(1.5,.70,.24)*upward*(.3+.70*warmSurface);totalEmissiveRadiance+=vec3(.28,.12,.03)*roof*max(0.,-nightNormal.y);`:''}
   ${kind==='arena'?`float rim=step(4.5,tile)*step(tile,6.5);totalEmissiveRadiance+=vec3(.34,.52,.70)*rim*.8;totalEmissiveRadiance+=diffuseColor.rgb*vec3(.12,.21,.32)*(1.-rim)*(.3+.7*exp(-abs(nightLocal.y-5.)*.08));`:''}
   ${kind==='sakura'||kind==='green'?`float leaves=step(12.5,tile)*step(tile,13.5);float volume=.18+.82*max(0.,dot(normalize(nightNormal),normalize(vec3(.3,-.7,.4))));float variation=.68+.32*nightHash(floor(nightLocal*1.7)+nightSeed);totalEmissiveRadiance+=diffuseColor.rgb*${kind==='sakura'?'vec3(.70,.36,.28)':'vec3(.16,.23,.17)'}*leaves*volume*variation;`:''}
  `);
 };
 mat.customProgramCacheKey=()=>`neon-night-v1-${kind}`;
 return mat;
}
