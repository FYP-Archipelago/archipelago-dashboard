import {nodeTable,links,result,delta} from '../../test-support/backend-fixture.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {compile,mount,act,dom,runId,click,button} from '../../test-support/dom.js';

const Workspace=await compile('src/backend/RunWorkspace.jsx');
dom.window.HTMLCanvasElement.prototype.getContext=()=>null;

class FakeSource {
  constructor(url){this.url=url;this.listeners=new Map();this.closed=false;}
  addEventListener(name,listener){this.listeners.set(name,listener);}
  emit(name,data){this.listeners.get(name)?.({data:JSON.stringify(data)});}
  close(){this.closed=true;}
}
const pendingApi=()=>({url:path=>path,result:async()=>{throw Object.assign(Error('no result: run is running'),{status:404});}});

test('run details display final and live backend layout diagnostics',async()=>{
  const final=await mount(Workspace,{runId,api:{url:p=>p,result:async()=>result},view:'run'});
  try{assert.match(document.body.textContent,/Layout/);assert.match(document.body.textContent,/PCA/);assert.match(document.body.textContent,/80%/);}finally{await final.close();}
  let source;const live=await mount(Workspace,{runId,api:pendingApi(),view:'run',eventSourceFactory:()=>source=new FakeSource('')});
  try{
    await act(async()=>source.emit('update',{status:'live',graph:delta(),layout:{method:'mds',variance_kept_2d:.7,variance_kept_3d:.85}}));
    assert.match(document.body.textContent,/MDS/);assert.match(document.body.textContent,/85%/);
  }finally{await live.close();}
});

test('done status does not claim a final result before persisted data is validated',async()=>{
  let source,resolve,calls=0;const waiting=new Promise(r=>{resolve=r;});
  const api={url:p=>p,result:()=>calls++?waiting:Promise.reject(Object.assign(Error('no result'),{status:404}))};
  const view=await mount(Workspace,{runId,api,view:'run',eventSourceFactory:()=>source=new FakeSource('')});
  try{
    await act(async()=>source.emit('status',{status:'done'}));
    assert.doesNotMatch(document.body.textContent,/Final result loaded/);assert.match(document.body.textContent,/Loading final result/);
    await act(async()=>resolve({graph:null}));
    assert.doesNotMatch(document.body.textContent,/Final result loaded/);assert.ok(button('Retry connection'));
  }finally{await view.close();}
});

test('cancellation submits once, retains graph and ignores late successful events',async()=>{
  let source,resolve,calls=0;const response=new Promise(r=>{resolve=r;});
  const api={...pendingApi(),cancelRun:()=>{calls++;return response;}};
  const view=await mount(Workspace,{runId,api,view:'run',eventSourceFactory:()=>source=new FakeSource('')});
  try{
    await act(async()=>source.emit('status',{status:'running'}));await click(button('Cancel run'));
    assert.equal(calls,1);assert.ok(button('Cancelling…').disabled);
    await act(async()=>resolve({run_id:runId,status:'cancelled'}));
    assert.match(document.body.textContent,/Status: cancelled/);assert.ok(source.closed);
    await act(async()=>source.emit('final',result));assert.doesNotMatch(document.body.textContent,/Final result loaded/);
  }finally{await view.close();}
});

test('cancellation failure is retryable and a completion race loads the actual result',async()=>{
  let source,cancels=0,reads=0;
  const api={url:p=>p,result:async()=>{if(!reads++)throw Object.assign(Error('no result'),{status:404});return result;},cancelRun:async()=>{if(!cancels++)throw Error('runner offline');return {run_id:runId,status:'done'};}};
  const view=await mount(Workspace,{runId,api,view:'run',eventSourceFactory:()=>source=new FakeSource('')});
  try{
    await act(async()=>source.emit('status',{status:'running'}));await click(button('Cancel run'));
    assert.match(document.body.textContent,/runner offline/);assert.ok(!button('Cancel run').disabled);
    await click(button('Cancel run'));assert.match(document.body.textContent,/Final result loaded/);assert.match(document.body.textContent,/Status: done/);
  }finally{await view.close();}
});

test('cancellation response from a previous run cannot modify the new run',async()=>{
  let source,resolve;const response=new Promise(r=>{resolve=r;});
  const api={...pendingApi(),cancelRun:()=>response};
  const view=await mount(Workspace,{runId,api,view:'run',eventSourceFactory:()=>source=new FakeSource('')});
  try{
    await act(async()=>source.emit('status',{status:'running'}));await click(button('Cancel run'));
    await view.rerender({runId:'run-20261104T120000Z-11223344'});
    await act(async()=>source.emit('status',{status:'running'}));await act(async()=>resolve({run_id:runId,status:'cancelled'}));
    assert.match(document.body.textContent,/Status: running/);assert.doesNotMatch(document.body.textContent,/Status: cancelled/);
  }finally{await view.close();}
});

test('REST cancellation remains available after the event stream closes',async()=>{
  let source,calls=0;
  const view=await mount(Workspace,{runId,api:{...pendingApi(),cancelRun:async()=>{calls++;return {run_id:runId,status:'cancelled'};}},view:'run',eventSourceFactory:()=>source=new FakeSource('')});
  try{
    await act(async()=>source.emit('status',{status:'running'}));source.readyState=2;await act(async()=>source.listeners.get('error')({}));
    await click(button('Cancel run'));assert.equal(calls,1);assert.match(document.body.textContent,/Status: cancelled/);
  }finally{await view.close();}
});

test('a stream error cannot discard an acknowledged in-flight cancellation',async()=>{
  let source,resolve;const response=new Promise(r=>{resolve=r;});
  const view=await mount(Workspace,{runId,api:{...pendingApi(),cancelRun:()=>response},view:'run',eventSourceFactory:()=>source=new FakeSource('')});
  try{
    await act(async()=>source.emit('status',{status:'running'}));await click(button('Cancel run'));
    await act(async()=>source.emit('update',{status:'live',graph:{bad:true}}));
    await act(async()=>resolve({run_id:runId,status:'cancelled'}));assert.match(document.body.textContent,/Status: cancelled/);
  }finally{await view.close();}
});

test('malformed backend error data does not disable REST cancellation',async()=>{
  let source,calls=0;
  const view=await mount(Workspace,{runId,api:{...pendingApi(),cancelRun:async()=>{calls++;return {run_id:runId,status:'cancelled'};}},view:'run',eventSourceFactory:()=>source=new FakeSource('')});
  try{
    await act(async()=>source.emit('status',{status:'running'}));await act(async()=>source.emit('error',null));
    await click(button('Cancel run'));assert.equal(calls,1);assert.match(document.body.textContent,/Status: cancelled/);
  }finally{await view.close();}
});

test('malformed separation row values are rejected before React diagnostics rendering',async()=>{
  let source;const view=await mount(Workspace,{runId,api:pendingApi(),view:'diagnostics',eventSourceFactory:()=>source=new FakeSource('')});
  try{
    await act(async()=>source.emit('final',{...result,separation:{...result.separation,pairs:{...result.separation.pairs,a:[{}]}}}));
    assert.match(document.body.textContent,/invalid separation/);assert.ok(button('Retry connection'));
  }finally{await view.close();}
});

test('malformed updates and statuses produce recoverable errors instead of unmounting the workspace',async()=>{
  let source;const view=await mount(Workspace,{runId,api:pendingApi(),onBack(){},view:'run',eventSourceFactory:()=>source=new FakeSource('')});
  try{
    await act(async()=>source.emit('update',{status:'live',graph:{...delta(),new_nodes:{id:[1]}},warnings:[]}));
    assert.match(document.body.textContent,/missing.*island/);assert.ok(source.closed);
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

test('stream completion loads the backend migration summary without reopening the run',async()=>{
  let source,calls=0;
  const migration_summary={islands:[0,1],total:2,routes:1,maximum:2,
    rows:[{island:0,cells:[{island:0,count:0,intensity:0},{island:1,count:2,intensity:1}]},{island:1,cells:[{island:0,count:0,intensity:0},{island:1,count:0,intensity:0}]}],
    totals:[{island:0,sent:2,received:0,sent_percent:100,received_percent:0},{island:1,sent:0,received:2,sent_percent:0,received_percent:100}]};
  const api={url:p=>p,result:async()=>{if(!calls++)throw Object.assign(Error('no result'),{status:404});return {...result,migration_summary};}};
  const view=await mount(Workspace,{runId,api,view:'migration',eventSourceFactory:()=>source=new FakeSource('')});
  try {
    await act(async()=>source.emit('final',result));
    assert.equal(calls,2);
    assert.ok(document.querySelector('.migration-matrix'));
    assert.equal(document.querySelector('.migration-metrics dd').textContent,'2');
    assert.equal(document.querySelector('.migration-details').open,false);
    assert.ok(source.closed);
  } finally {await view.close();}
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
    await act(async()=>source.emit('update',{status:'live',layout:result.layout,clustering:result.clustering,malformed_rows:1,warnings:result.warnings,graph:{...delta(),new_nodes:nodeTable([10,20]),new_edges:links([1],[10],[20],'weight'),new_migrations:links([2],[10],[20],'count'),island_best:[10],overall_best:20,overlap:1.1}}));
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

test('Back to Runs is visible above the run heading and returns to Runs',async()=>{
  let returned=0;
  const view=await mount(Workspace,{runId,api:{result:async()=>result,url:()=>'/backend/events'},onBack(){returned++;},view:'archipelago'});
  try{
    assert.equal(document.querySelector('.backend-run-workspace').firstElementChild.className,'run-back');
    await click(button('← Back to Runs'));
    assert.equal(returned,1);
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

test('invalid nested clustering metadata is rejected before diagnostics rendering',async t=>{
  const cases=[
    ['counts',{counts:{evaluations:{bad:1}}}],
    ['resolved settings',{resolved:{birch_threshold:[]}}],
    ['stage diagnostics',{diagnostics:{birch:{radius:{bad:1}}}}],
    ['checkpoint arrays',{diagnostics:{denstream:{epsilon_checkpoints:[.1,{}]}}}],
    ['stage records',{diagnostics:{birch:[]}}],
    ['elapsed time',{elapsed_seconds:'soon'}],
  ];
  for(const [name,change] of cases)await t.test(name,async()=>{
    let source;const view=await mount(Workspace,{runId,api:pendingApi(),view:'diagnostics',eventSourceFactory:()=>source=new FakeSource('')});
    try{
      await act(async()=>source.emit('update',{status:'live',graph:delta(),clustering:{...result.clustering,...change}}));
      assert.match(document.body.textContent,/invalid clustering metadata/);assert.ok(button('Retry connection'));
      assert.ok(source.closed);
    }finally{await view.close();}
  });
});

test('run metadata is checked before accepting a saved result',async t=>{
  for(const [name,run] of [
    ['nested benchmark',{...result.run,benchmark:{bad:1}}],
    ['island shape',{...result.run,islands:{length:2}}],
    ['island values',{...result.run,islands:[{}]}],
    ['optimisation direction',{...result.run,maximising:'false'}],
    ['missing identity',{...result.run,run_id:''}],
  ])await t.test(name,async()=>{
    const view=await mount(Workspace,{runId,api:{url:p=>p,result:async()=>({...result,run})},view:'run'});
    try{assert.match(document.body.textContent,/invalid run metadata/);assert.doesNotMatch(document.body.textContent,/Final result loaded/);assert.ok(button('Retry connection'));}finally{await view.close();}
  });
});

test('metadata validation preserves nullable values and backend diagnostic value types',async()=>{
  const data={...result,run:{...result.run,migration_topology:null},clustering:{...result.clustering,diagnostics:{denstream:{epsilon:.2,input_points:2,family:'p_stable',summarised:false,prune_period:null,epsilon_checkpoints:[.1,.2]}}},separation:{...result.separation,typical_distance:null}};
  const view=await mount(Workspace,{runId,api:{url:p=>p,result:async()=>data},view:'diagnostics'});
  try{assert.match(document.body.textContent,/Final result loaded/);assert.match(document.body.textContent,/p_stable/);assert.match(document.body.textContent,/0.1, 0.2/);assert.match(document.body.textContent,/Unavailable/);}finally{await view.close();}
});

test('final results require complete metadata before declaring success',async t=>{
  for(const field of ['run','layout','clustering','separation','malformed_rows','warnings']){
    for(const missing of [true,false])await t.test(`${field} ${missing?'missing':'null'}`,async()=>{
      const data=structuredClone(result);
      if(missing)delete data[field];else data[field]=null;
      const view=await mount(Workspace,{runId,api:{url:p=>p,result:async()=>data},view:'run'});
      try{assert.doesNotMatch(document.body.textContent,/Final result loaded/);assert.ok(button('Retry connection'));}finally{await view.close();}
    });
  }
});

test('final clustering metadata requires its declared fields',async t=>{
  const paths=[['stages'],['counts'],['resolved'],['diagnostics'],['elapsed_seconds'],
    ...['evaluations','rows_clustered','nodes','faded_nodes'].map(key=>['counts',key]),
    ...['birch_threshold','denstream_epsilon','denstream_half_life','lsh_bucket_width'].map(key=>['resolved',key])];
  for(const path of paths)await t.test(path.join('.'),async()=>{
    const data=structuredClone(result);let parent=data.clustering;
    for(const key of path.slice(0,-1))parent=parent[key];delete parent[path.at(-1)];
    const view=await mount(Workspace,{runId,api:{url:p=>p,result:async()=>data},view:'run'});
    try{assert.doesNotMatch(document.body.textContent,/Final result loaded/);assert.ok(button('Retry connection'));}finally{await view.close();}
  });
});

test('invalid scalar result metadata is recoverable',async t=>{
  for(const [name,change,label] of [
    ['malformed row count',{malformed_rows:{}},'malformed row count'],
    ['separation distance',{separation:{...result.separation,typical_distance:{}}},'separation metadata'],
    ['separation method',{separation:{...result.separation,method:[]}},'separation metadata'],
  ])await t.test(name,async()=>{
    const view=await mount(Workspace,{runId,api:{url:p=>p,result:async()=>({...result,...change})},view:'run'});
    try{assert.match(document.body.textContent,new RegExp('invalid '+label));assert.doesNotMatch(document.body.textContent,/Final result loaded/);assert.ok(button('Retry connection'));}finally{await view.close();}
  });
});
