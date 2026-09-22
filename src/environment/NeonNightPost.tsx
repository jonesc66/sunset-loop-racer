import {useEffect,useMemo} from 'react';
import {useFrame,useThree} from '@react-three/fiber';
import * as THREE from 'three';
import {FullScreenQuad} from 'three/examples/jsm/postprocessing/Pass.js';
import {nightPresets,useNeonNightQuality} from './neonNightSettings';
const vertex=`varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`;
export function NeonNightPost(){
 const quality=useNeonNightQuality(),preset=nightPresets[quality],{gl,size}=useThree();
 const fx=useMemo(()=>{
  const target=()=>new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType,depthBuffer:false});
  const sceneTarget=target();sceneTarget.depthBuffer=true;
  const a=target(),b=target();
  const blur=new THREE.ShaderMaterial({vertexShader:vertex,depthTest:false,depthWrite:false,uniforms:{source:{value:null},stepUV:{value:new THREE.Vector2()},threshold:{value:1}},fragmentShader:`varying vec2 vUv;uniform sampler2D source;uniform vec2 stepUV;uniform float threshold;
   vec3 tap(vec2 p){vec3 c=texture2D(source,p).rgb;float l=max(c.r,max(c.g,c.b));return c*(threshold>.5?smoothstep(1.1,2.3,l):1.);}
   void main(){vec3 c=tap(vUv)*.227027;c+=(tap(vUv+stepUV*1.384615)+tap(vUv-stepUV*1.384615))*.316216;c+=(tap(vUv+stepUV*3.230769)+tap(vUv-stepUV*3.230769))*.070270;gl_FragColor=vec4(c,1.);}`});
  const composite=new THREE.ShaderMaterial({vertexShader:vertex,depthTest:false,depthWrite:false,uniforms:{sceneMap:{value:sceneTarget.texture},bloomMap:{value:b.texture},strength:{value:0}},fragmentShader:`varying vec2 vUv;uniform sampler2D sceneMap;uniform sampler2D bloomMap;uniform float strength;
   void main(){gl_FragColor=vec4(texture2D(sceneMap,vUv).rgb+texture2D(bloomMap,vUv).rgb*strength,1.);
   #include <tonemapping_fragment>
   #include <colorspace_fragment>
   }`});
  return {sceneTarget,a,b,blur,composite,quad:new FullScreenQuad(blur)};
 },[]);
 useEffect(()=>{const dpr=gl.getPixelRatio(),w=Math.round(size.width*dpr),h=Math.round(size.height*dpr);fx.sceneTarget.setSize(w,h);fx.a.setSize(Math.max(1,Math.round(w*preset.bloomScale)),Math.max(1,Math.round(h*preset.bloomScale)));fx.b.setSize(fx.a.width,fx.a.height);},[fx,gl,size,preset]);
 useEffect(()=>()=>{fx.sceneTarget.dispose();fx.a.dispose();fx.b.dispose();fx.blur.dispose();fx.composite.dispose();fx.quad.dispose();},[fx]);
 useFrame(({scene,camera})=>{
  if(!preset.bloom){gl.render(scene,camera);return;}
  const old=gl.getRenderTarget(),reset=gl.info.autoReset;gl.info.autoReset=false;gl.info.reset();
  try{
   gl.setRenderTarget(fx.sceneTarget);gl.clear();gl.render(scene,camera);
   fx.quad.material=fx.blur;fx.blur.uniforms.source.value=fx.sceneTarget.texture;fx.blur.uniforms.threshold.value=1;fx.blur.uniforms.stepUV.value.set(1/fx.a.width,0);gl.setRenderTarget(fx.a);gl.clear();fx.quad.render(gl);
   fx.blur.uniforms.source.value=fx.a.texture;fx.blur.uniforms.threshold.value=0;fx.blur.uniforms.stepUV.value.set(0,1/fx.b.height);gl.setRenderTarget(fx.b);gl.clear();fx.quad.render(gl);
   fx.quad.material=fx.composite;fx.composite.uniforms.strength.value=preset.bloom;gl.setRenderTarget(old);gl.clear();fx.quad.render(gl);
  }finally{gl.setRenderTarget(old);gl.info.autoReset=reset;}
 },1);
 return null;
}
