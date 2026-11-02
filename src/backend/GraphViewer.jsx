import React,{useEffect,useRef,useState} from 'react';
import {mountStnViewer} from '../viewer/stn-viewer.js';
import '../viewer/stn-viewer.css';

export default function GraphViewer({graph,runId}) {
  const host=useRef(null),viewer=useRef(null);
  const [view,setView]=useState('overview');
  useEffect(()=>{
    if(!host.current)return;
    viewer.current=mountStnViewer(host.current,{backend:true});
    return()=>{viewer.current?.destroy();viewer.current=null;};
  },[]);
  useEffect(()=>{viewer.current?.setBackendGraph(graph,runId);},[graph,runId]);
  const pick=mode=>{
    const root=host.current;if(!root||!graph.nodes.size)return;
    const el=id=>root.querySelector(`#${id}`);
    const set=(id,on)=>{const button=el(id);if(button&&(button.getAttribute('aria-pressed')==='true')!==on)button.click();};
    set('b-group',mode==='islands'||mode==='migration');
    set('t-edges',mode!=='migration');
    set('include-hidden-migrations',mode==='migration');
    set('mig-all',mode!=='islands');
    set('contest',mode==='shared');
    if(mode==='best')root.querySelector('#bests .icn.dia')?.closest('button')?.click();
    if(mode==='overview')el('reset')?.click();
    setView(mode);
  };
  const modes=[['overview','Overview'],['islands','By island'],['migration','Migration only'],['shared','Shared ground'],['best','Best solution']];
  return <div className="backend-viz-wrap">
    <div className="views" aria-label="Graph views"><div className="view-tabs">{modes.map(([id,label])=><button key={id} type="button" aria-pressed={view===id} disabled={!graph.nodes.size} onClick={()=>pick(id)}>{label}</button>)}</div></div>
    <div className="viewer-host backend-stn-host" ref={host} aria-label="Archipelago backend graph"/>
  </div>;
}
