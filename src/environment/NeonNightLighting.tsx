import {useEffect,useLayoutEffect,useMemo,useRef} from 'react';
import {useFrame} from '@react-three/fiber';
import * as THREE from 'three';
import {sampleTrack,type TrackInfo} from '../game/track';
import {buildMetroArt,districtIndex,metroLandmarks} from './neonMetroArtData';
import {wholeTrackPlacements} from './wholeTrackData';
import {nightPresets,useNeonNightQuality} from './neonNightSettings';
import {NeonNightPost} from './NeonNightPost';
const colors=['#b8d8ff','#ffe0b0','#ffc071','#ffb75d','#cce4ff','#ffd0c5','#ffc078'];
export function NeonNightLighting({track}:{track:TrackInfo}){
 const quality=useNeonNightQuality(),preset=nightPresets[quality];
 const sky=useRef<THREE.Mesh>(null),moon=useRef<THREE.DirectionalLight>(null),pools=useRef<THREE.InstancedMesh>(null),fixtures=useRef<THREE.InstancedMesh>(null);
 const lights=useRef<(THREE.PointLight|null)[]>([]);
 const data=useMemo(()=>{
  const lamps=Array.from({length:98},(_,i)=>{const t=i/98,s=sampleTrack(track,t),side=i%2?1:-1,p=s.center.clone().addScaledVector(s.normal,side*14);return {p,color:new THREE.Color(colors[districtIndex(t)]),scale:14,hero:false};});
  const assets=wholeTrackPlacements(track,buildMetroArt(track).buildings);
  const accents=assets.filter(p=>/Sakura|Machiya|Kyoto_Inn|Corner_Shop|Pagoda|Temple|Arena/.test(p.asset)).map(p=>({p:new THREE.Vector3(...p.position),color:new THREE.Color(colors[p.district]),scale:p.asset.includes('Arena')?32:p.asset.includes('Pagoda')?18:7,hero:/Pagoda|Arena/.test(p.asset)}));
  const strips:{p:THREE.Vector3;s:THREE.Vector3;a:number;c:THREE.Color}[]=[];
  for(let i=0;i<145;i+=3){const t=i/145,s=sampleTrack(track,t),p=s.center.clone().addScaledVector(s.normal,-21);p.y=7.53;strips.push({p,s:new THREE.Vector3(1.1,.06,1.9),a:Math.atan2(s.tangent.x,s.tangent.z),c:new THREE.Color(colors[districtIndex(t)])});}
  for(const asset of assets){
   if(/Machiya|Kyoto_Inn|Corner_Shop/.test(asset.asset)){const p=new THREE.Vector3(0,3.15,-6.35).multiply(new THREE.Vector3(...asset.scale)).applyAxisAngle(new THREE.Vector3(0,1,0),asset.heading).add(new THREE.Vector3(...asset.position));strips.push({p,s:new THREE.Vector3(5*asset.scale[0],.075,.15),a:asset.heading,c:new THREE.Color('#ffb65e')});}
   if(asset.asset==='Pagoda_Hero')for(let tier=0;tier<5;tier++)for(let edge=0;edge<4;edge++){const w=11.8-tier*1.55,a=asset.heading+edge*Math.PI/2;const p=new THREE.Vector3(0,4.0+tier*5.15,w*.5).multiply(new THREE.Vector3(...asset.scale)).applyAxisAngle(new THREE.Vector3(0,1,0),a).add(new THREE.Vector3(...asset.position));strips.push({p,s:new THREE.Vector3(w*asset.scale[0],.055,.10),a,c:new THREE.Color('#ffc984')});}
  }
  return {lamps,accents,strips,all:[...lamps,...accents],dummy:new THREE.Object3D(),target:new THREE.Object3D()};
 },[track]);
 const skyMaterial=useMemo(()=>new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,fog:false,vertexShader:'varying vec3 direction;void main(){direction=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:`varying vec3 direction;void main(){vec3 d=normalize(direction);float h=pow(max(d.y,0.),.55);vec3 color=mix(vec3(.045,.067,.115),vec3(.004,.009,.029),h);float city=exp(-abs(d.y)*16.)*(.65+.35*sin(atan(d.x,d.z)*3.));color+=vec3(.025,.020,.018)*city;gl_FragColor=vec4(color,1.);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
 }`}),[]);
 const poolMaterial=useMemo(()=>new THREE.ShaderMaterial({transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,vertexColors:true,vertexShader:`varying vec2 vUv;varying vec3 vColor;void main(){vUv=uv;vColor=instanceColor;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}`,fragmentShader:`varying vec2 vUv;varying vec3 vColor;void main(){float radius=length((vUv-.5)*2.);float falloff=pow(max(0.,1.-radius),2.7);gl_FragColor=vec4(vColor*.24,falloff*.55);}`}),[]);
 useEffect(()=>()=>{skyMaterial.dispose();poolMaterial.dispose();},[skyMaterial,poolMaterial]);
 useLayoutEffect(()=>{if(moon.current)moon.current.target=data.target;if(fixtures.current){data.strips.forEach((s,i)=>{data.dummy.position.copy(s.p);data.dummy.scale.copy(s.s);data.dummy.rotation.set(0,s.a,0);data.dummy.updateMatrix();fixtures.current!.setMatrixAt(i,data.dummy.matrix);fixtures.current!.setColorAt(i,s.c);});fixtures.current.instanceMatrix.needsUpdate=true;if(fixtures.current.instanceColor)fixtures.current.instanceColor.needsUpdate=true;fixtures.current.computeBoundingSphere();}},[data]);
 // Three.js allocates a shadow target once; mapSize changes need a new target.
 useLayoutEffect(()=>{
  const shadow=moon.current?.shadow;if(!shadow)return;
  if(shadow.map&&(shadow.map.width!==preset.shadow||shadow.map.height!==preset.shadow)){
   shadow.dispose();shadow.map=null;shadow.mapPass=null;
  }
  shadow.camera.updateProjectionMatrix();shadow.needsUpdate=true;
 },[preset.shadow,preset.shadowExtent]);
 useFrame(({camera})=>{
  sky.current?.position.copy(camera.position);
  data.target.position.set(camera.position.x,0,camera.position.z);data.target.updateMatrixWorld();
  moon.current?.position.set(camera.position.x-45,80,camera.position.z+25);
  if(pools.current){let count=0;for(const item of data.all){if(item.p.distanceToSquared(camera.position)>preset.spillDistance**2)continue;data.dummy.position.set(item.p.x,.165,item.p.z);data.dummy.rotation.set(-Math.PI/2,0,0);data.dummy.scale.set(item.scale*2,item.scale*2,1);data.dummy.updateMatrix();pools.current.setMatrixAt(count,data.dummy.matrix);pools.current.setColorAt(count++,item.color);}pools.current.count=count;pools.current.instanceMatrix.needsUpdate=true;if(pools.current.instanceColor)pools.current.instanceColor.needsUpdate=true;}
  const nearby=data.all.map(item=>({item,d:item.p.distanceToSquared(camera.position)})).sort((a,b)=>(a.d-(a.item.hero?1800:0))-(b.d-(b.item.hero?1800:0))).slice(0,preset.lights);
  lights.current.forEach((light,i)=>{if(!light)return;const entry=nearby[i];if(!entry||entry.d>140**2){light.intensity=0;return;}const {item}=entry;const offset=item.hero?item.scale*.75:0;light.position.set(item.p.x-offset,item.hero?10:7,item.p.z+offset);light.color.copy(item.color);light.intensity=(item.hero?1500:360)*Math.max(0,1-entry.d/140**2);light.distance=item.hero?65:42;});
 });
 return <group name="neon-night-lighting" userData={{quality,phase:5,dynamicLightBudget:preset.lights,shadowLightBudget:preset.shadow?1:0,bloom:preset.bloom,bloomResolution:preset.bloomScale}}>
  <mesh ref={sky} frustumCulled={false} renderOrder={-100} material={skyMaterial}><sphereGeometry args={[450,24,12]}/></mesh>
  <instancedMesh name="night-existing-fixture-highlights" ref={fixtures} args={[undefined,undefined,data.strips.length]}><boxGeometry/><meshBasicMaterial color={[2.4,2.4,2.4]}/></instancedMesh>
  <ambientLight color="#c5d3ed" intensity={.38}/><hemisphereLight color="#99b9f0" groundColor="#695846" intensity={.8}/>
  <primitive object={data.target}/>
  <directionalLight ref={moon} color="#bbcfff" intensity={1.15} castShadow={preset.shadow>0} shadow-mapSize-width={preset.shadow||512} shadow-mapSize-height={preset.shadow||512} shadow-camera-left={-preset.shadowExtent} shadow-camera-right={preset.shadowExtent} shadow-camera-top={preset.shadowExtent} shadow-camera-bottom={-preset.shadowExtent} shadow-camera-near={1} shadow-camera-far={180} shadow-bias={-.0005} shadow-normalBias={.12}/>
  {Array.from({length:preset.lights},(_,i)=><pointLight key={i} ref={r=>{lights.current[i]=r;}} decay={2} intensity={0} castShadow={false}/>)}
  <instancedMesh name="night-light-pools" ref={pools} args={[undefined,poolMaterial,data.all.length]} frustumCulled={false}><planeGeometry/></instancedMesh>
  <group name="night-arena-entrance" position={[metroLandmarks.stadium.x,0,metroLandmarks.stadium.z-49.8]}>
   <mesh position={[0,10.8,0]}><boxGeometry args={[23,.15,.12]}/><meshStandardMaterial color="#c4e4ff" emissive="#b1d8ff" emissiveIntensity={2.2}/></mesh>
  </group>
  <NeonNightPost/>
 </group>;
}
