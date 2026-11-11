// Fit selected points in the current camera orientation, using 80% of the canvas.
export function regionCameraTarget(points,aspect,camera,focus=null){
  if(!points.length)return null;
  const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
  for(const p of points)for(let i=0;i<3;i++){lo[i]=Math.min(lo[i],p[i]);hi[i]=Math.max(hi[i],p[i]);}
  const center=focus??lo.map((v,i)=>(v+hi[i])/2);
  const back=[Math.sin(camera.az)*Math.cos(camera.el),Math.sin(camera.el),Math.cos(camera.az)*Math.cos(camera.el)];
  const right=[Math.cos(camera.az),0,-Math.sin(camera.az)];
  const up=[-Math.sin(camera.az)*Math.sin(camera.el),Math.cos(camera.el),-Math.cos(camera.az)*Math.sin(camera.el)];
  const tanY=Math.tan(Math.PI/8)*.8,tanX=tanY*aspect;
  const dot=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0);
  let distance=.0004;
  for(const point of points){
    const delta=point.map((v,i)=>v-center[i]),depth=dot(delta,back);
    distance=Math.max(distance,depth+Math.abs(dot(delta,right))/tanX,depth+Math.abs(dot(delta,up))/tanY,depth+.0001);
  }
  return {...camera,tx:center[0],ty:center[1],tz:center[2],dist:distance};
}
