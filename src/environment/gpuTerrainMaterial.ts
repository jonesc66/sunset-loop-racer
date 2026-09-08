import * as THREE from "three";

// GPU-only world-space material. The Phase 1 shader remains untouched for High.
export function makeGpuTerrainMaterial(ground = false) {
  const material = new THREE.MeshStandardMaterial({ color: "#ffffff", vertexColors: !ground, roughness: .97 });
  material.onBeforeCompile = shader => {
    shader.vertexShader = "varying vec3 gpuWorld; varying vec3 gpuSlope;\n" + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>
      gpuWorld = (modelMatrix * vec4(position, 1.0)).xyz;
      gpuSlope = mat3(modelMatrix) * normal;`);
    shader.fragmentShader = `varying vec3 gpuWorld; varying vec3 gpuSlope;
      float hash3(vec3 p) { p=fract(p*.1031); p+=dot(p,p.yzx+33.33); return fract((p.x+p.y)*p.z); }
      float noise3(vec3 p) {
        vec3 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(mix(hash3(i),hash3(i+vec3(1,0,0)),f.x),mix(hash3(i+vec3(0,1,0)),hash3(i+vec3(1,1,0)),f.x),f.y),
          mix(mix(hash3(i+vec3(0,0,1)),hash3(i+vec3(1,0,1)),f.x),mix(hash3(i+vec3(0,1,1)),hash3(i+vec3(1,1,1)),f.x),f.y),f.z);
      }
      float gpuRelief;
      ` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace("#include <color_fragment>", `#include <color_fragment>
      float broad=noise3(gpuWorld*.038);
      float patches=noise3(gpuWorld*.13 + vec3(7.0));
      float fine=noise3(gpuWorld*.85);
      float slope=1.0-abs(normalize(gpuSlope).y);
      float elevation=smoothstep(18.0,95.0,gpuWorld.y+(broad-.5)*35.0);
      float rock=smoothstep(.20,.66,slope+(patches-.5)*.32+elevation*.33);
      float soil=smoothstep(.47,.76,broad+patches*.16)*(1.0-rock);
      vec3 grass=mix(vec3(.052,.086,.025),vec3(.115,.147,.056),broad);
      vec3 earth=mix(vec3(.115,.087,.053),vec3(.20,.17,.115),patches);
      vec3 stone=mix(vec3(.155,.166,.155),vec3(.30,.285,.25),patches*.7+fine*.3);
      vec3 landscape=mix(mix(grass,earth,soil*.85),stone,rock);
      landscape*=.86+fine*.24;
      ${ground ? "diffuseColor.rgb=landscape;" : "diffuseColor.rgb=mix(diffuseColor.rgb,landscape,.82);"}
      float nearDetail=1.0-smoothstep(80.0,270.0,length(vViewPosition));
      gpuRelief=(fine*.065+noise3(gpuWorld*2.8)*.012)*nearDetail;`);
    shader.fragmentShader = shader.fragmentShader.replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
      vec3 dx=dFdx(-vViewPosition),dy=dFdy(-vViewPosition);
      vec3 rx=cross(dy,normal),ry=cross(normal,dx);
      float determinant=dot(dx,rx);
      normal=normalize(abs(determinant)*normal-sign(determinant)*(dFdx(gpuRelief)*rx+dFdy(gpuRelief)*ry));`);
  };
  material.customProgramCacheKey = () => `gpu-terrain-v1-${ground}`;
  return { material, dispose: () => material.dispose() };
}
