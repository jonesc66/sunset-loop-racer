import * as THREE from 'three';

export const MATERIAL_LIBRARY = {
  rock: ['rock','#ffffff',.8], 'weathered-rock':['rock','#d0d8ce',.86],
  'lakeshore-stone':['rock','#a9b8b5',.72], concrete:['concrete','#ffffff',.83],
  'aged-concrete':['concrete','#ced1c4',.9], gravel:['ground','#d9d2bf',.96],
  dirt:['ground','#b5a185',1], grass:['ground','#9bb26f',1],
  'painted-metal':['metal','#ffffff',.6], 'dark-metal':['metal','#737d7d',.7],
} as const;
export const TEXTURE_URLS=['rock','concrete','ground','metal'].flatMap(f=>['base','normal','orm'].map(k=>`${import.meta.env.BASE_URL}assets/environment/phase4a/textures/${f}-${k}.png`));

export function createMaterialLibrary(source: THREE.Texture[], gpu:boolean) {
  const maps=source.map((t,i)=>{const c=t.clone();c.wrapS=c.wrapT=THREE.RepeatWrapping;c.colorSpace=i%3===0?THREE.SRGBColorSpace:THREE.NoColorSpace;c.anisotropy=gpu?16:8;c.needsUpdate=true;return c;});
  const materials=Object.fromEntries(Object.entries(MATERIAL_LIBRARY).map(([name,[family,color,roughness]])=>{
    const i=['rock','concrete','ground','metal'].indexOf(family)*3;
    const m=new THREE.MeshStandardMaterial({name,color,map:maps[i],normalMap:maps[i+1],roughnessMap:maps[i+2],metalnessMap:maps[i+2],roughness,metalness:family==='metal'?.8:0,normalScale:new THREE.Vector2(.7,.7)});
    if(name==='gravel')m.side=THREE.DoubleSide;
    return [name,m];
  }));
  return {materials,dispose(){Object.values(materials).forEach(m=>m.dispose());maps.forEach(t=>t.dispose());}};
}

export function terrainMaterial(base:THREE.MeshStandardMaterial) {
  const m=base.clone();m.side=THREE.DoubleSide;
  m.onBeforeCompile=s=>{
    s.vertexShader='varying vec3 landPoint; varying vec3 landNormal;\n'+s.vertexShader;
    s.vertexShader=s.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nlandPoint=position;landNormal=normal;');
    s.fragmentShader='varying vec3 landPoint; varying vec3 landNormal;\n'+s.fragmentShader;
    s.fragmentShader=s.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      float slope=1.0-abs(normalize(landNormal).y);
      float macro=sin(landPoint.x*.049+sin(landPoint.z*.07))*sin(landPoint.z*.035);
      vec3 grass=vec3(.95,1.25,.65), soil=vec3(1.05,.96,.78), stone=vec3(1.1,1.1,1.02);
      vec3 tint=mix(grass,soil,smoothstep(.12,.48,slope));
      tint=mix(tint,stone,smoothstep(.48,.85,slope));
      float wet=1.0-smoothstep(.15,3.2,landPoint.y);
      tint=mix(tint,vec3(.67,.69,.61),wet*.95);
      diffuseColor.rgb *= tint*(1.0+.13*macro);`);
  };m.customProgramCacheKey=()=> 'phase4a-slope-soil-v2';return m;
}
