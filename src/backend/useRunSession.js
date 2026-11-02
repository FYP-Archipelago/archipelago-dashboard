import {useEffect,useState} from 'react';
import {applyGraphDelta,emptyGraph,graphFromResult} from './graph-model.js';

const initial = () => ({status:'loading',connection:'connecting',graph:emptyGraph(),result:null,layout:null,clustering:null,malformedRows:0,warnings:[],error:''});
const message = error => error instanceof Error ? error.message : String(error);
const nativeEventSource = target => new EventSource(target);

export default function useRunSession({runId,api,eventSourceFactory=nativeEventSource}) {
  const [state,setState] = useState(initial);
  const [retry,setRetry] = useState(0);
  useEffect(()=>{
    let active=true,source=null,attempts=0,timer=null;
    const abort=new AbortController();
    setState(initial());
    const patch=change=>{if(active)setState(current=>({...current,...change}));};
    const finish=result=>{
      try {
        const graph=graphFromResult(result);
        patch({status:'done',connection:'closed',graph,result,layout:result.layout,clustering:result.clustering,malformedRows:result.malformed_rows,warnings:result.warnings||[],error:''});
        source?.close();
      } catch(error) {patch({connection:'closed',error:message(error)});source?.close();}
    };
    const loadResult=async ({terminal=false}={})=>{
      try {finish(await api.result(runId,{signal:abort.signal}));return true;}
      catch(error) {
        if (!active || abort.signal.aborted) return true;
        if (error.status===404 && /run not found/i.test(error.message)) {patch({status:'unknown',connection:'closed',error:message(error)});source?.close();return true;}
        if (error.status===404 && !terminal) return false;
        if (error.status===404 && terminal && attempts++<60) {
          timer=setTimeout(()=>loadResult({terminal:true}),1000);
          return true;
        }
        patch({connection:'closed',error:message(error)});source?.close();return true;
      }
    };
    const parse=(event,label)=>{try{return JSON.parse(event.data);}catch{throw Error(`Backend sent an invalid ${label} event.`);}};
    const start=async()=>{
      if (await loadResult() || !active) return;
      try {source=eventSourceFactory(api.url(`/runs/${encodeURIComponent(runId)}/events`));}
      catch(error){patch({connection:'closed',error:message(error)});return;}
      source.onopen=()=>patch({connection:'connected',error:''});
      source.addEventListener('status',event=>{
        try {
          const {status}=parse(event,'status');
          patch({status,connection:'connected'});
          if(status==='done') {source.close();patch({connection:'loading result'});loadResult({terminal:true});}
          if(status==='cancelled') {source.close();patch({connection:'closed'});}
        } catch(error){patch({error:message(error)});source.close();}
      });
      source.addEventListener('update',event=>{
        try {
          const update=parse(event,'update');
          setState(current=>active?{
            ...current,status:update.status,connection:'connected',graph:applyGraphDelta(current.graph,update.graph),
            layout:update.layout||current.layout,clustering:update.clustering,malformedRows:update.malformed_rows,warnings:update.warnings||[],error:'',
          }:current);
        } catch(error){patch({error:message(error),connection:'closed'});source.close();}
      });
      source.addEventListener('final',event=>{try{finish(parse(event,'final'));}catch(error){patch({error:message(error),connection:'closed'});source.close();}});
      source.addEventListener('error',event=>{
        if(event.data) {
          try {const failure=parse(event,'error');patch({status:'failed',connection:'closed',error:`${failure.phase ? failure.phase+': ' : ''}${failure.message||'Run failed.'}`});}
          catch(error){patch({error:message(error),connection:'closed'});}
          source.close();
        } else patch({connection:'reconnecting'}); // EventSource retries with Last-Event-ID.
      });
    };
    start();
    return()=>{active=false;abort.abort();clearTimeout(timer);source?.close();};
  },[runId,api,eventSourceFactory,retry]);
  return {...state,retry:()=>setRetry(value=>value+1)};
}
