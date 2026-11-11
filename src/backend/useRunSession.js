import {useEffect,useRef,useState} from 'react';
import {applyGraphDelta,emptyGraph,graphFromResult} from './graph-model.js';
import { RUN_STATUSES } from './api.js';

const initial = (runId) => ({runId,status:'loading',connection:'connecting',graph:emptyGraph(),result:null,layout:null,clustering:null,malformedRows:0,warnings:[],error:'',cancelPending:false,cancelError:'',cancelNotice:''});
const message = error => error instanceof Error ? error.message : String(error);
const nativeEventSource = target => new EventSource(target);

function validateMetadata(value,{final=false}={}) {
  const finite=number=>typeof number==='number'&&Number.isFinite(number);
  const integer=number=>Number.isSafeInteger(number)&&number>=0;
  const record=item=>item!==null&&typeof item==='object'&&!Array.isArray(item);
  const scalar=item=>item===null||typeof item==='string'||typeof item==='boolean'||finite(item);
  if(!record(value))throw Error('Backend sent invalid metadata.');
  if(final&&['run','layout','clustering','separation','malformed_rows','warnings'].some(key=>value[key]==null))throw Error('Backend sent incomplete final result metadata.');
  if(value.run!==undefined){
    const run=value.run;
    if(!record(run)||typeof run.run_id!=='string'||!run.run_id||!['algorithm','benchmark'].every(key=>typeof run[key]==='string')||(run.migration_topology!==null&&typeof run.migration_topology!=='string')||!Array.isArray(run.islands)||!run.islands.every(Number.isSafeInteger)||typeof run.maximising!=='boolean'||!Object.values(run).every(item=>scalar(item)||(Array.isArray(item)&&item.every(scalar))))throw Error('Backend sent invalid run metadata.');
  }
  if(value.malformed_rows!==undefined&&!integer(value.malformed_rows))throw Error('Backend sent invalid malformed row count.');
  if(value.layout!=null&&(!record(value.layout)||!['pca','mds','none'].includes(value.layout.method)||!['variance_kept_2d','variance_kept_3d'].every(key=>finite(value.layout[key]))))throw Error('Backend sent invalid layout metadata.');
  if(value.warnings!==undefined&&(!Array.isArray(value.warnings)||!value.warnings.every(item=>typeof item==='string')))throw Error('Backend sent invalid warnings.');
  if(value.clustering!=null){
    const c=value.clustering;
    if(final&&(!['stages','counts','resolved','diagnostics','elapsed_seconds'].every(key=>c[key]!=null)||
      !['evaluations','rows_clustered','nodes','faded_nodes'].every(key=>Object.hasOwn(c.counts,key))||
      !['birch_threshold','denstream_epsilon','denstream_half_life','lsh_bucket_width'].every(key=>Object.hasOwn(c.resolved,key))))throw Error('Backend sent incomplete final clustering metadata.');
    if(!record(c)||(c.stages!==undefined&&(!Array.isArray(c.stages)||!c.stages.every(stage=>typeof stage==='string'))))throw Error('Backend sent invalid clustering metadata.');
    for(const field of ['counts','resolved','diagnostics'])if(c[field]!==undefined&&!record(c[field]))throw Error('Backend sent invalid clustering metadata.');
    if(c.counts&&!Object.entries(c.counts).every(([key,item])=>integer(item)||(key==='faded_nodes'&&item===null)))throw Error('Backend sent invalid clustering metadata.');
    if(c.resolved&&!Object.values(c.resolved).every(item=>item===null||finite(item)))throw Error('Backend sent invalid clustering metadata.');
    // Stage diagnostics include text, booleans, nullable numbers and numeric
    // calibration checkpoint arrays; nested records are not part of the API.
    if(c.diagnostics&&!Object.values(c.diagnostics).every(stage=>record(stage)&&Object.values(stage).every(item=>scalar(item)||(Array.isArray(item)&&item.every(finite)))))throw Error('Backend sent invalid clustering metadata.');
    if(c.elapsed_seconds!==undefined&&(!finite(c.elapsed_seconds)||c.elapsed_seconds<0))throw Error('Backend sent invalid clustering metadata.');
  }
  if(value.separation!=null){
    if(!record(value.separation)||value.separation.method!=='mmd-random-fourier-features'||(value.separation.typical_distance!==null&&!finite(value.separation.typical_distance)))throw Error('Backend sent invalid separation metadata.');
    for(const [name,fields] of Object.entries({pairs:['a','b','mmd2','p'],windows:['from_generation','typical_distance'],window_pairs:['window','a','b','mmd2']})){
      const table=value.separation[name];
      if(!table||fields.some(field=>!Array.isArray(table[field])||table[field].length!==table[fields[0]].length))throw Error('Backend sent invalid separation metadata.');
      for(const field of fields)if(!table[field].every(item=>['a','b','window','from_generation'].includes(field)?integer(item):finite(item)))throw Error('Backend sent invalid separation metadata.');
    }
    if(value.separation.pairs.p.some(p=>p<0||p>1)||value.separation.window_pairs.window.some(index=>index>=value.separation.windows.from_generation.length))throw Error('Backend sent invalid separation metadata.');
  }
}

export default function useRunSession({runId,api,eventSourceFactory=nativeEventSource}) {
  const [state,setState] = useState(()=>initial(runId));
  const [retry,setRetry] = useState(0);
  const cancelAction=useRef(null);
  useEffect(()=>{
    let active=true,source=null,attempts=0,timer=null,cancelling=false;
    const abort=new AbortController();
    setState(initial(runId));
    let graphState=emptyGraph(),acceptingEvents=true,failedStatus=false,terminal=false;
    const patch=change=>{if(active)setState(current=>({...current,...change}));};
    const finish=result=>{
      if(!active)return;
      try {
        validateMetadata(result,{final:true});
        if(result.run.run_id!==runId)throw Error('Backend returned a result for another run.');
        const graph=graphFromResult(result);
        patch({status:'done',connection:'closed',graph,result,layout:result.layout,clustering:result.clustering,malformedRows:result.malformed_rows,warnings:result.warnings||[],error:''});
        acceptingEvents=false;terminal=true;source?.close();
      } catch(error) {acceptingEvents=false;patch({connection:'closed',error:message(error)});source?.close();}
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
    const cancel=async()=>{
      if(!active||cancelling||terminal)return;
      cancelling=true;patch({cancelPending:true,cancelError:'',cancelNotice:''});
      try{
        const response=await api.cancelRun(runId,{signal:abort.signal});
        if(!active)return;
        if(terminal){patch({cancelPending:false});return;}
        if(response?.run_id!==runId||!RUN_STATUSES.has(response.status))throw Error('Backend returned an invalid cancellation response.');
        patch({cancelPending:false});
        if(response.status==='done'){
          acceptingEvents=false;terminal=true;source?.close();patch({status:'done',connection:'loading result',error:''});await loadResult({terminal:true});
        }else if(response.status==='cancelled'||response.status==='failed'){
          acceptingEvents=false;terminal=true;failedStatus=false;clearTimeout(timer);source?.close();
          const failure=response.error;
          patch({status:response.status,connection:'closed',error:response.status==='failed'?`${failure?.phase?failure.phase+': ':''}${failure?.message||'Run failed.'}`:''});
        } else if (response.status === 'cancelling') {
          // Recorded but not yet confirmed; the event stream reports cancelled once both runner and worker stop.
          patch({ status: 'cancelling' });
        }else patch({cancelNotice:`Cancellation was not confirmed. Backend status: ${response.status}.`});
      }catch(error){if(active)patch({cancelPending:false,cancelError:terminal?'':message(error)});}
      finally{cancelling=false;}
    };
    cancelAction.current=cancel;
    const parse=(event,label)=>{try{return JSON.parse(event.data);}catch{throw Error(`Backend sent an invalid ${label} event.`);}};
    const start=async()=>{
      if (await loadResult() || !active) return;
      try {source=eventSourceFactory(api.url(`/runs/${encodeURIComponent(runId)}/events`));}
      catch(error){patch({connection:'closed',error:message(error)});return;}
      source.onopen=()=>{if(active&&acceptingEvents)patch({connection:'connected',error:''});};
      source.addEventListener('status',event=>{
        if(!active||!acceptingEvents)return;
        try {
          const {status}=parse(event,'status');
          if(!RUN_STATUSES.has(status))throw Error('Backend sent an invalid status event.');
          patch({status,connection:'connected'});
          if(['done','failed','cancelled'].includes(status))terminal=true;
          if(status==='done') {acceptingEvents=false;source.close();patch({connection:'loading result'});loadResult({terminal:true});}
          if(status==='failed') {
            acceptingEvents=false;failedStatus=true;
            patch({error:'Run failed. Waiting for backend error details.'});
            // The backend sends the failure phase/message after its status.
            timer=setTimeout(()=>{if(active&&failedStatus){failedStatus=false;source.close();patch({connection:'closed',error:'Run failed. No additional error details were received.'});}},5000);
          }
          if(status==='cancelled') {acceptingEvents=false;source.close();patch({connection:'closed'});}
        } catch(error){acceptingEvents=false;patch({error:message(error),connection:'closed'});source.close();}
      });
      source.addEventListener('update',event=>{
        if(!active||!acceptingEvents)return;
        try {
          const update=parse(event,'update');
          if(!['warming_up','live'].includes(update.status))throw Error('Backend sent an invalid update status.');
          validateMetadata(update);
          // Validate/apply before scheduling React state: updater exceptions are
          // otherwise raised later, outside this event handler's catch block.
          const graph=applyGraphDelta(graphState,update.graph);
          graphState=graph;
          patch({status:update.status,connection:'connected',graph,
            clustering:update.clustering,malformedRows:update.malformed_rows,warnings:update.warnings||[],error:''});
          if(update.layout)patch({layout:update.layout});
        } catch(error){acceptingEvents=false;patch({error:message(error),connection:'closed'});source.close();}
      });
      source.addEventListener('final',event=>{
        if(!active||!acceptingEvents)return;
        try {
          finish(parse(event, 'final'));
        } catch (error) {
          acceptingEvents = false;
          patch({ error: message(error), connection: 'closed' });
          source.close();
        }
      });
      source.addEventListener('error',event=>{
        if(!active||(!acceptingEvents&&!failedStatus))return;
        if(failedStatus){clearTimeout(timer);failedStatus=false;acceptingEvents=false;if(!event.data){source.close();patch({connection:'closed',error:'Run failed. The event stream closed before error details arrived.'});return;}}
        if(event.data) {
          try {
            const failure=parse(event,'error');
            if(!failure||typeof failure.message!=='string'||(failure.phase!==undefined&&typeof failure.phase!=='string'))throw Error('Backend sent an invalid error event.');
            terminal=true;patch({status:'failed',connection:'closed',error:`${failure.phase ? failure.phase+': ' : ''}${failure.message||'Run failed.'}`});
          }
          catch(error){patch({error:message(error),connection:'closed'});}
          acceptingEvents=false;source.close();
        } else if(source.readyState===2){acceptingEvents=false;patch({connection:'closed',error:'Event stream closed. Retry the connection to reload this run.'});}
        else patch({connection:'reconnecting'}); // EventSource retries with Last-Event-ID.
      });
    };
    start();
    return()=>{active=false;abort.abort();clearTimeout(timer);source?.close();if(cancelAction.current===cancel)cancelAction.current=null;};
  },[runId,api,eventSourceFactory,retry]);
  return {...(state.runId===runId?state:initial(runId)),retry:()=>setRetry(value=>value+1),cancelRun:()=>cancelAction.current?.()};
}
