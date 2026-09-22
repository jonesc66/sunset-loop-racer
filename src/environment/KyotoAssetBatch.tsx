import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { KyotoPlacement } from './kyotoArtData';
export function AssetBatch({mesh,items,lod,detailDistance=170,cullInstances=false}:{mesh:THREE.Mesh;items:KyotoPlacement[];lod:number;detailDistance?:number;cullInstances?:boolean}){
 const ref=useRef<THREE.InstancedMesh>(null);
 const geometry=useMemo(()=>mesh.geometry.clone().applyMatrix4(mesh.matrixWorld),[mesh]);
 useEffect(()=>()=>geometry.dispose(),[geometry]);
 const culling=useMemo(()=>({frustum:new THREE.Frustum(),matrix:new THREE.Matrix4(),sphere:new THREE.Sphere()}),[]);
 const dummy=useMemo(()=>new THREE.Object3D(),[]);
 useLayoutEffect(()=>{if(ref.current)ref.current.count=0;},[]);
 useFrame(({camera})=>{if(!ref.current)return;let count=0;if(cullInstances){culling.frustum.setFromProjectionMatrix(culling.matrix.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));if(!geometry.boundingSphere)geometry.computeBoundingSphere();}for(const p of items){const distance=Math.hypot(camera.position.x-p.position[0],camera.position.z-p.position[2]);if(distance>650||(distance<detailDistance?0:1)!==lod)continue;dummy.position.set(...p.position);dummy.rotation.set(0,p.heading,0);dummy.scale.set(...p.scale);dummy.updateMatrix();if(cullInstances&&!culling.frustum.intersectsSphere(culling.sphere.copy(geometry.boundingSphere!).applyMatrix4(dummy.matrix)))continue;ref.current.setMatrixAt(count++,dummy.matrix);}ref.current.count=count;ref.current.instanceMatrix.needsUpdate=true;});
 return <instancedMesh name={'kyoto-'+mesh.name} ref={ref} args={[geometry,mesh.material,items.length]} frustumCulled={false} dispose={null}/>;
}



