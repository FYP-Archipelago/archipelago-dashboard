import {acceptedConfiguration,HISTORY_KEY,isRunId} from '../runs/recent-runs.js';

const IDENTITY='recorded-demo:v1';
export function validateRecordedAnalytics(value,id) {
  const finite=number=>typeof number==='number'&&Number.isFinite(number);
  const count=number=>Number.isSafeInteger(number)&&number>=0;
  const metrics=['best_so_far_fitness','mean_fitness','fitness_std','diversity','evaluations'];
  const valid=value?.schema_version===1&&value.run_id===id&&value.source==='recorded-generation-summaries'&&typeof value.maximising==='boolean'&&
    Array.isArray(value.islands)&&value.islands.length>0&&value.islands.every(island=>count(island.island_id)&&Array.isArray(island.series)&&island.series.length>0&&island.series.every((row,index)=>
      count(row.generation)&&finite(row.best_fitness)&&(!index||row.generation>island.series[index-1].generation)&&metrics.every(key=>row[key]===undefined||(key==='evaluations'?count(row[key]):finite(row[key])))))&&
    new Set(value.islands.map(island=>island.island_id)).size===value.islands.length;
  const chart=value?.chart;
  if(!valid||!chart||!finite(chart.width)||chart.width<=0||!finite(chart.height)||chart.height<=0||!['best_so_far_fitness','best_fitness','mean_fitness','diversity'].includes(chart.metric)||
    !Array.isArray(chart.x_ticks)||!chart.x_ticks.length||!chart.x_ticks.every(t=>finite(t.x)&&t.x>=0&&t.x<=chart.width&&typeof t.label==='string'&&finite(Number(t.label)))||
    !Array.isArray(chart.y_ticks)||!chart.y_ticks.length||!chart.y_ticks.every(t=>finite(t.y)&&t.y>=0&&t.y<=chart.height&&typeof t.label==='string'&&finite(Number(t.label)))||
    !Array.isArray(chart.lines)||chart.lines.length!==value.islands.length||new Set(chart.lines.map(line=>line.island_id)).size!==chart.lines.length||
    !chart.lines.every(line=>{const island=value.islands.find(item=>item.island_id===line.island_id);return island&&Array.isArray(line.points)&&line.points.length===island.series.length&&line.points.every(point=>finite(point.x)&&point.x>=0&&point.x<=chart.width&&finite(point.y)&&point.y>=0&&point.y<=chart.height);})||
    value.islands.some(island=>island.series.some(row=>!finite(row[chart.metric]))))throw Error('Published recorded history is malformed or belongs to another run.');
  if (value.charts !== undefined) {
    if (!value.charts || typeof value.charts !== 'object' || Array.isArray(value.charts) || !Object.hasOwn(value.charts, chart.metric)) throw Error('Published recorded history has invalid metric charts.');
    for (const [metric, metricChart] of Object.entries(value.charts)) {
      if (metricChart?.metric !== metric) throw Error('Published recorded history has invalid metric charts.');
      validateRecordedAnalytics({...value, chart: metricChart, charts: undefined}, id);
    }
  }
  return value;
}
export function recordingStorage(recordings,backend=IDENTITY) {
  const values=new Map([[HISTORY_KEY,JSON.stringify({version:1,runs:recordings.map(entry=>({backend,run_id:entry.run_id,preset:entry.label,at:entry.recorded_at,source:'manual',configuration:entry.configuration}))})]]);
  return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value))};
}

export function createRecordedApi({fetchImpl=globalThis.fetch,baseUrl='/recorded-runs'}={}) {
  let catalog;
  async function read(file,{signal}={},root=baseUrl) {
    signal?.throwIfAborted();
    const timeout=AbortSignal.timeout(15000);
    const response=await fetchImpl(`${root}/${file}`,{signal:signal?AbortSignal.any([signal,timeout]):timeout,cache:'no-store'});
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
    async analytics(id,options) {await requireRun(id,options);return validateRecordedAnalytics(await read(`${id}.json`,options,'/recorded-analytics'),id);},
    createRun:blocked,cancelRun:blocked,
    url:()=>{throw Error('Saved recordings have no live event stream.');},
  };
}

export const recordedApi=createRecordedApi();
