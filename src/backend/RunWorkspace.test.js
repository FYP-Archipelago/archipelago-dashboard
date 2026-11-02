import test from 'node:test';
import assert from 'node:assert/strict';
import {compile,mount,act,dom,runId,click,button} from '../../test-support/dom.js';

const Workspace=await compile('src/backend/RunWorkspace.jsx');
dom.window.HTMLCanvasElement.prototype.getContext=()=>null;
const nodeTable=ids=>({id:ids,island:ids.map((_,i)=>i),x:ids.map((_,i)=>i),y:ids.map(()=>0),z:ids.map(()=>0),visits:ids.map(()=>1),members:ids.map(()=>2),mean_fitness:ids.map(()=>3),best_fitness:ids.map(()=>4),fitness_percentile:ids.map(()=>50),progress:ids.map(()=>0.5),first_eval:ids.map(()=>0),last_eval:ids.map(()=>1),in_degree:ids.map(()=>0),out_degree:ids.map(()=>0),islands_sharing:ids.map(()=>1),island_best:ids.map(()=>false),overall_best:ids.map(()=>false),migration_endpoint:ids.map(()=>false),genome_hash:ids.map(id=>`hash-${id}`),weight:null});
const links=(ids,source,target,field)=>({id:ids,source,target,[field]:ids.map(()=>2)});
const result={run:{run_id:runId,algorithm:'DE',benchmark:'rastrigin',migration_topology:'ring',islands:[0,1],maximising:false},layout:{method:'pca',variance_kept_2d:.8,variance_kept_3d:.9},graph:{nodes:nodeTable([10,20]),edges:links([1],[10],[20],'weight'),migrations:links([2],[10],[20],'count'),overlap:1.1},clustering:{stages:['lsh','birch'],counts:{evaluations:200,rows_clustered:200,nodes:2,faded_nodes:null},resolved:{birch_threshold:.3,denstream_epsilon:null},diagnostics:{birch:{clusters:2}},elapsed_seconds:1.2},separation:{method:'mmd-random-fourier-features',typical_distance:.7,pairs:{a:[0],b:[1],mmd2:[.4],p:[.01]},windows:{from_generation:[0],typical_distance:[.6]},window_pairs:{window:[0],a:[0],b:[1],mmd2:[.3]}},malformed_rows:1,warnings:['one malformed row']};

class FakeSource {
  constructor(url){this.url=url;this.listeners=new Map();this.closed=false;}
  addEventListener(name,listener){this.listeners.set(name,listener);}
  emit(name,data){this.listeners.get(name)?.({data:JSON.stringify(data)});}
  close(){this.closed=true;}
}
const delta=()=>({new_nodes:nodeTable([]),updated_nodes:{id:[]},percentiles:{id:[]},weights:null,positions:null,removed_nodes:[],new_edges:links([],[],[],'weight'),edge_updates:{id:[]},new_migrations:links([],[],[],'count'),migration_updates:{id:[]},island_best:[],overall_best:null,overlap:0});
const pendingApi=()=>({url:path=>path,result:async()=>{throw Object.assign(Error('no result: run is running'),{status:404});}});

test('malformed updates and statuses produce recoverable errors instead of unmounting the workspace',async()=>{
  let source;const view=await mount(Workspace,{runId,api:pendingApi(),onBack(){},view:'run',eventSourceFactory:()=>source=new FakeSource('')});
  try{
    await act(async()=>source.emit('update',{status:'live',graph:{...delta(),new_nodes:{id:[1]}},warnings:[]}));
    assert.match(document.body.textContent,/missing island/);assert.ok(source.closed);
    await click(button('Retry connection'));
    await act(async()=>source.emit('status',{}));
    assert.match(document.body.textContent,/invalid status/);assert.ok(button('Retry connection'));
  }finally{await view.close();}
});
test('live diagnostics use update metadata before a final result exists',async()=>{
  let source;const view=await mount(Workspace,{runId,api:pendingApi(),onBack(){},view:'diagnostics',eventSourceFactory:()=>source=new FakeSource('')});
  try{
    await act(async()=>source.emit('update',{status:'live',graph:delta(),clustering:{...result.clustering,counts:{evaluations:12345}},malformed_rows:0,warnings:[]}));
    assert.match(document.body.textContent,/12,345/);assert.match(document.body.textContent,/Island separation is available in the final result/);
  }finally{await view.close();}
});
test('run switch clears previous data immediately and ignores events from the old connection',async()=>{
  let source;const api=pendingApi();const factory=()=>source=new FakeSource('');
  const view=await mount(Workspace,{runId,api,onBack(){},view:'run',eventSourceFactory:factory});
  try{
    const old=source;await act(async()=>old.emit('final',result));
    await view.rerender({runId:'run-20261103T120000Z-11223344'});
    assert.doesNotMatch(document.body.textContent,/rastrigin/);
    await act(async()=>old.emit('final',result));assert.doesNotMatch(document.body.textContent,/rastrigin/);
  }finally{await view.close();}
});
test('done status recovers the persisted result when the final event is unavailable',async()=>{
  let source,calls=0;
  const api={url:p=>p,result:async()=>{if(!calls++)throw Object.assign(Error('no result: run is running'),{status:404});return result;}};
  const view=await mount(Workspace,{runId,api,onBack(){},view:'run',eventSourceFactory:()=>source=new FakeSource('')});
  try{await act(async()=>source.emit('status',{status:'done'}));assert.equal(calls,2);assert.match(document.body.textContent,/Final result loaded/);assert.ok(source.closed);}finally{await view.close();}
});
test('permanently closed streams offer retry and pending streams close on unmount',async()=>{
  let source;const factory=()=>source=new FakeSource('');
  const view=await mount(Workspace,{runId,api:pendingApi(),onBack(){},view:'run',eventSourceFactory:factory});
  try{
    source.readyState=2;await act(async()=>source.listeners.get('error')({}));
    assert.match(document.body.textContent,/Event stream closed/);await click(button('Retry connection'));assert.equal(source.closed,false);
  }finally{await view.close();assert.ok(source.closed);}
});
test('cancelled streams close without interpreting later final events as success',async()=>{
  let source;const view=await mount(Workspace,{runId,api:pendingApi(),onBack(){},view:'run',eventSourceFactory:()=>source=new FakeSource('')});
  try{
    await act(async()=>source.emit('status',{status:'cancelled'}));await act(async()=>source.emit('final',result));
    assert.match(document.body.textContent,/Status: cancelled/);assert.doesNotMatch(document.body.textContent,/Final result loaded/);
  }finally{await view.close();}
});
test('malformed live metadata is recoverable before React renders diagnostics',async()=>{
  let source;const view=await mount(Workspace,{runId,api:pendingApi(),onBack(){},view:'diagnostics',eventSourceFactory:()=>source=new FakeSource('')});
  try{
    await act(async()=>source.emit('update',{status:'live',graph:delta(),clustering:{stages:'lsh'},warnings:[]}));
    assert.match(document.body.textContent,/invalid clustering/);assert.ok(button('Retry connection'));assert.ok(source.closed);
  }finally{await view.close();}
});
test('failed status blocks late graph updates and finals while retaining backend error details',async()=>{
  let source;const view=await mount(Workspace,{runId,api:pendingApi(),onBack(){},view:'run',eventSourceFactory:()=>source=new FakeSource('')});
  try{
    await act(async()=>source.emit('status',{status:'failed'}));
    await act(async()=>source.emit('update',{status:'live',graph:delta(),warnings:[]}));await act(async()=>source.emit('final',result));
    assert.match(document.body.textContent,/Status: failed/);assert.doesNotMatch(document.body.textContent,/Final result loaded/);
    await act(async()=>source.emit('error',{phase:'runner',message:'time limit'}));
    assert.match(document.body.textContent,/runner: time limit/);assert.ok(source.closed);
  }finally{await view.close();}
});
test('failed status closes within a bounded wait if error details never arrive',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  let source;const view=await mount(Workspace,{runId,api:pendingApi(),onBack(){},view:'run',eventSourceFactory:()=>source=new FakeSource('')});
  try{
    await act(async()=>source.emit('status',{status:'failed'}));await act(async()=>t.mock.timers.tick(5000));
    assert.ok(source.closed);assert.match(document.body.textContent,/No additional error details/);
  }finally{await view.close();t.mock.timers.reset();}
});
test('malformed final separation metadata is reported without rendering a broken diagnostics page',async()=>{
  const view=await mount(Workspace,{runId,api:{url:p=>p,result:async()=>({...result,separation:{}})},onBack(){},view:'diagnostics'});
  try{assert.match(document.body.textContent,/invalid separation metadata/);assert.ok(button('Retry connection'));}finally{await view.close();}
});

test('live status, graph delta, network retry state and final event render in the workspace',async()=>{
  let source;
  const api={url:path=>'/backend'+path,result:async()=>{throw Object.assign(Error('no result: run is running'),{status:404});}};
  const view=await mount(Workspace,{runId,api,onBack(){},eventSourceFactory:url=>(source=new FakeSource(url))});
  try{
    assert.equal(source.url,`/backend/runs/${runId}/events`);
    await act(async()=>source.emit('status',{status:'running'}));
    assert.match(document.body.textContent,/Status: running/);
    await act(async()=>source.emit('update',{status:'live',layout:result.layout,clustering:result.clustering,malformed_rows:1,warnings:result.warnings,graph:{new_nodes:nodeTable([10,20]),updated_nodes:{id:[]},percentiles:{id:[]},weights:null,positions:null,removed_nodes:[],new_edges:links([1],[10],[20],'weight'),edge_updates:{id:[]},new_migrations:links([2],[10],[20],'count'),migration_updates:{id:[]},island_best:[10],overall_best:20,overlap:1.1}}));
    assert.ok(document.querySelector('[aria-label="Archipelago backend graph"] #gl'));
    assert.match(document.body.textContent,/WEBGL2 UNAVAILABLE/);
    await act(async()=>source.listeners.get('error')({}));
    assert.match(document.body.textContent,/Events: reconnecting/);
    await act(async()=>source.emit('final',result));
    assert.match(document.body.textContent,/Final result loaded/);
    assert.equal(source.closed,true);
  }finally{await view.close();}
});

test('saved result drives diagnostics and separation without an SSE connection',async()=>{
  let opened=0;
  const api={result:async()=>result,url:()=>'/backend/events'};
  const view=await mount(Workspace,{runId,api,onBack(){},view:'diagnostics',eventSourceFactory:()=>{opened++;return new FakeSource('');}});
  try{
    assert.equal(opened,0);
    assert.match(document.body.textContent,/Island separation/);
    assert.match(document.body.textContent,/one malformed row|0.4/);
    assert.match(document.body.textContent,/200/);
  }finally{await view.close();}
});

test('backend failure phase is shown and a pending event stream closes on unmount',async()=>{
  let source;
  const api={url:path=>'/backend'+path,result:async()=>{throw Object.assign(Error('no result: run is running'),{status:404});}};
  const view=await mount(Workspace,{runId,api,onBack(){},view:'run',eventSourceFactory:url=>(source=new FakeSource(url))});
  try{
    await act(async()=>source.emit('error',{phase:'clustering',message:'invalid rows'}));
    assert.match(document.body.textContent,/clustering: invalid rows/);
    assert.match(document.body.textContent,/Status: failed/);
    assert.equal(source.closed,true);
  }finally{await view.close();}
});
