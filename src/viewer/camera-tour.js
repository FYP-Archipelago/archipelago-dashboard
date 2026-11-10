import {regionCameraTarget} from './region-focus.js';
// Smooth camera interpolation in seconds, independent of display refresh rate.
export function tourCameraPose(from,target,elapsed,duration=1800){
  const t=Math.max(0,Math.min(1,elapsed/duration));
  const k=t*t*(3-2*t);
  return Object.fromEntries(Object.keys(from).map(key=>[key,from[key]+(target[key]-from[key])*k]));
}

export function bestTourTarget(origin,position,index,distance=1.8){
  return {...origin,tx:position[0],ty:position[1],tz:position[2],
    az:origin.az+(index+1)*.42,el:origin.el,dist:distance};
}


export function groupedTourTarget(origin,position,index,points,aspect){
  const orientation=bestTourTarget(origin,position,index);
  // Frame a local neighborhood rather than letting distant island outliers
  // force every best-node stop back into an overview.
  const distinct=[...new Map(points.map(point=>[point.join(','),point])).values()];
  const distance=point=>point.reduce((sum,v,i)=>sum+(v-position[i])**2,0);
  distinct.sort((a,b)=>distance(a)-distance(b));
  const count=Math.min(24,Math.max(3,Math.ceil(Math.sqrt(distinct.length))));
  return regionCameraTarget([position,...distinct.slice(0,count)],aspect,orientation,position)??orientation;
}
