import {acceptedConfiguration,HISTORY_KEY,isRunId} from '../runs/recent-runs.js';
import {createExplanationClient} from '../explainability/client.js';

const IDENTITY='recorded-demo:v1';
export function recordingStorage(recordings,backend=IDENTITY) {
  const values=new Map([[HISTORY_KEY,JSON.stringify({version:1,runs:recordings.map(entry=>({backend,run_id:entry.run_id,preset:entry.label,at:entry.recorded_at,source:'manual',configuration:entry.configuration}))})]]);
  return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value))};
}

export function createRecordedApi({fetchImpl=globalThis.fetch,baseUrl='/recorded-runs'}={}) {
  const samples=createExplanationClient({fetchImpl});
  let catalog;
  async function read(file,{signal}={}) {
    signal?.throwIfAborted();
    const timeout=AbortSignal.timeout(15000);
    const response=await fetchImpl(`${baseUrl}/${file}`,{signal:signal?AbortSignal.any([signal,timeout]):timeout,cache:'no-store'});
    if(!response.ok||!response.headers.get('content-type')?.includes('application/json'))throw Error('Published recording data is unavailable. Retry loading the demonstration.');
    return response.json();
  }
  async function recordings(options={}) {
    options.signal?.throwIfAborted();
    if(catalog)return catalog;
    const value=await read('index.json',options);
    if(value?.schema_version!==1||!Array.isArray(value.runs)||!value.runs.length||!value.runs.every(entry=>
      isRunId(entry?.run_id)&&typeof entry.label==='string'&&typeof entry.recorded_at==='string'&&Number.isFinite(Date.parse(entry.recorded_at))&&acceptedConfiguration(entry.configuration))||
      new Set(value.runs.map(entry=>entry.run_id)).size!==value.runs.length)throw Error('Published recording index is malformed.');
    catalog=value.runs;
    return catalog;
  }
  const blocked=async()=>{throw Error('This is a recorded-data demonstration. New execution and cancellation require a connected backend.');};
  async function requireRun(id,options) {
    if(!isRunId(id)||!(await recordings(options)).some(entry=>entry.run_id===id))throw Object.assign(Error('run not found: this recording is not included in the demonstration.'),{status:404});
  }
  return {
    isDemo:true,identity:async()=>IDENTITY,recordings,
    async result(id,options) {
      await requireRun(id,options);
      const value=await read(`${id}.json`,options);
      if(value?.run?.run_id!==id)throw Error('Published result belongs to another run.');
      return value;
    },
    async explanation(id,options) {await requireRun(id,options);return {schema_version:1,run_id:id,status:'ready',explanation:await samples.run(id,options)};},
    createRun:blocked,cancelRun:blocked,
    url:()=>{throw Error('Saved recordings have no live event stream.');},
  };
}

export const recordedApi=createRecordedApi();
