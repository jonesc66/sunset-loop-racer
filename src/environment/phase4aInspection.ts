import type { Camera } from 'three';
import { sampleTrack, type TrackInfo } from '../game/track';

// Called only inside the existing DEV environmentInspect branch. Does not touch race state or clocks.
export function applyArtDetailView(camera:Camera,track:TrackInfo,hash:string){
  const views:Record<string,[number,number,number,number,number]>={
    'F-detail':[.545,16,4,40,4],
    'C-detail':[.25,15,7,35,17],
    'D-detail':[.34,18,3,65,-7],
    'E-detail':[.445,-37,-5.8,0,-4],
  };
  const view=views[hash];if(!view)return;
  const [progress,offset,height,lookOffset,lookHeight]=view;
  const pose=sampleTrack(track,progress);
  camera.position.copy(pose.center).addScaledVector(pose.normal,offset).addScaledVector(pose.tangent,-14);
  camera.position.y+=height;
  const target=pose.center.clone().addScaledVector(pose.normal,lookOffset);target.y+=lookHeight;
  camera.lookAt(target);
}
