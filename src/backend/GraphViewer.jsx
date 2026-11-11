import React,{useEffect,useMemo,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {mountStnViewer} from '../viewer/stn-viewer.js';
import {graphAtReplayProgress,replayOrder} from './graph-replay.js';
import '../viewer/stn-viewer.css';

export default function GraphViewer({graph,runId,canReplay=false,maximising,mountViewer=mountStnViewer}) {
  const host=useRef(null),viewer=useRef(null),replaySlot=useRef(null);
  const [slotReady,setSlotReady]=useState(false);
  const [replay,setReplay]=useState(false),[playing,setPlaying]=useState(false);
  const [progress,setProgress]=useState(1),[speed,setSpeed]=useState(1);
  const order=useMemo(()=>replayOrder(graph),[graph]);
  const shown=useMemo(()=>replay?graphAtReplayProgress(graph,order,progress):graph,[graph,order,progress,replay]);
  const hasNodes=shown.nodes.size>0;
  useEffect(()=>{
    setReplay(false);setPlaying(false);setProgress(1);
    setSlotReady(false);
    if(!host.current||!hasNodes)return;
    viewer.current=mountViewer(host.current,{backend:true});
    const foot=host.current.querySelector('.rail-foot');
    if(foot){
      replaySlot.current??=document.createElement('div');
      replaySlot.current.className='run-replay-slot';
      foot.insertBefore(replaySlot.current,foot.querySelector('.hint'));
      setSlotReady(true);
    }
    return()=>{viewer.current?.destroy();viewer.current=null;};
  },[runId,hasNodes,mountViewer]);
  useEffect(()=>{viewer.current?.setBackendGraph(shown,runId,{maximising});},[shown,runId,maximising]);
  useEffect(()=>{
    if(!playing||!replay)return;
    const timer=setInterval(()=>setProgress(value=>Math.min(1,value+speed/150)),200);
    return()=>clearInterval(timer);
  },[playing,replay,speed]);
  useEffect(()=>{if(progress>=1&&playing)setPlaying(false);},[progress,playing]);
  useEffect(()=>{if(!canReplay){setReplay(false);setPlaying(false);setProgress(1);}},[canReplay]);
  const startReplay=()=>{
    setReplay(true);setPlaying(false);setProgress(0);
    const root=host.current;
    const set=(id,on)=>{const button=root?.querySelector(`#${id}`);if(button&&(button.getAttribute('aria-pressed')==='true')!==on)button.click();};
    set('b-group',true);set('t-edges',true);set('mig-all',true);set('include-hidden-migrations',true);
  };
  return <div className="backend-viz-wrap">
    {canReplay&&slotReady&&replaySlot.current&&createPortal(<div className={`run-replay${replay?' active':' idle'}`} aria-label="Run replay controls">
      {!replay?<button className="secondary" type="button" onClick={startReplay} disabled={!graph.nodes.size}>Replay run</button>:<>
        <button className="secondary" type="button" onClick={()=>{if(progress>=1)setProgress(0);setPlaying(!playing);}}>{playing?'Pause':'Play'}</button>
        <button className="secondary" type="button" onClick={()=>{setProgress(0);setPlaying(false);}}>Restart</button>
        <label className="replay-position">Progress <input name="replay-progress" aria-label="Replay progress" type="range" min="0" max="100" value={Math.round(progress*100)} onChange={event=>{setPlaying(false);setProgress(Number(event.target.value)/100);}}/> <output>{Math.round(progress*100)}%</output></label>
        <label>Speed <select name="replay-speed" aria-label="Replay speed" value={speed} onChange={event=>setSpeed(Number(event.target.value))}><option value="0.25">0.25×</option><option value="0.5">0.5×</option><option value="1">1×</option><option value="2">2×</option><option value="4">4×</option></select></label>
        <button className="secondary replay-full" type="button" onClick={()=>{setPlaying(false);setReplay(false);setProgress(1);}}>Show full graph</button>
        <span className="replay-note">Illustrative order by first evaluation; migration timing is unavailable.</span>
      </>}
      </div>,replaySlot.current)}
    <div className="backend-viz-stage">
      <div className="viewer-host backend-stn-host" ref={host} aria-label="Archipelago backend graph"/>
      {!hasNodes&&<p className="notice" role="status">No graph nodes available yet.</p>}
    </div>
  </div>;
}
