import test from 'node:test';
import assert from 'node:assert/strict';
import {compile,mount,act,dom,runId} from '../../test-support/dom.js';

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
