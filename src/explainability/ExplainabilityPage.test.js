import test from 'node:test';
import assert from 'node:assert/strict';
import {compile,mount,click,button,input,runId,act} from '../../test-support/dom.js';

const Page=await compile('src/explainability/ExplainabilityPage.jsx');
const player={id:'0',label:'Island 0',value:5,standard_error:0,share_percent:100,bar_percent:100};
const game={method:'exact',evaluated_coalitions:2,permutations:null,seed:1,players:[player],empty_value:0,full_value:5,allocated_gain:5,efficiency_error:0,
  coalitions:[{id:'0',players:[],value:0,value_percent:0},{id:'1',players:['0'],value:5,value_percent:100}],
  examples:[{id:'0',steps:[{player_id:'0',label:'Island 0',before:0,after:5,marginal:5,bar_percent:100}]}]};
const result={schema_version:1,run_id:runId,maximising:false,baseline_fitness:10,observed_best_fitness:5,supported_best_fitness:5,
  coverage:{total:2,supported:2,excluded:0,percent:100},warnings:[],source:{kind:'local-recorded-lineage',algorithm:'de',benchmark:'sphere',topology:'ring',elapsed_seconds:0.1},
  games:{islands:game,routes:{...game,players:[],examples:[],coalitions:[{id:'0',players:[],value:5,value_percent:100}],empty_value:5,allocated_gain:0}}};
const client={index:async()=>({schema_version:1,runs:[{run_id:runId,algorithm:'de',benchmark:'sphere',islands:1,coverage_percent:100}],errors:[]}),run:async()=>result};

test('initial render accepts an unresolved run selection',async()=>{
  const root=await mount(Page,{client});
  try{assert.match(document.body.textContent,/No attribution dataset selected/);}finally{await root.close();}
});

test('renders actual attribution, switches games and explores precomputed coalitions',async()=>{
  const root=await mount(Page,{runId,client});
  try{
    assert.match(document.body.textContent,/Recorded lineage/);
    assert.match(document.body.textContent,/Island 0/);
    assert.match(document.querySelector('[data-coalition-value]').textContent,/0/);
    await click(document.querySelector('input[type="checkbox"]'));
    assert.match(document.querySelector('[data-coalition-value]').textContent,/5/);
    await click(button('Migration routes'));
    assert.match(document.body.textContent,/No cross-island dependencies/);
    assert.match(document.body.textContent,/separate games/i);
  }finally{await root.close();}
});

test('unavailable current run never silently substitutes a recorded example',async()=>{
  const other='run-20261102T120001Z-11223344';let calls=0,opened='';
  const root=await mount(Page,{runId:other,client:{...client,run:async()=>{calls++;return result;}},onSelectRun:id=>{opened=id;}});
  try{
    assert.equal(calls,0);
    assert.match(document.body.textContent,/Individual ancestry unavailable/);
    await input('explanation-run',runId);
    assert.equal(opened,runId);
    assert.equal(document.querySelector('[data-attribution]'),null);
  }finally{await root.close();}
});

test('late response for an old run cannot replace the new selection',async()=>{
  let resolve;const pending=new Promise(r=>{resolve=r;});
  const root=await mount(Page,{runId,client:{...client,run:()=>pending}});
  try{
    await root.rerender({runId:'run-20261102T120001Z-11223344'});
    await act(async()=>resolve(result));
    assert.equal(document.querySelector('[data-attribution]'),null);
    assert.match(document.body.textContent,/Individual ancestry unavailable/);
  }finally{await root.close();}
});

test('missing local preparation has a useful retry state',async()=>{
  let fail=true;
  const root=await mount(Page,{runId,client:{...client,index:async()=>{if(fail)throw new Error('Prepare local artifacts');return client.index();}}});
  try{
    assert.match(document.querySelector('[role="alert"]').textContent,/Prepare local artifacts/);
    fail=false;await click(button('Retry'));
    assert.ok(document.querySelector('[data-attribution]'));
  }finally{await root.close();}
});

const pending={schema_version:1,run_id:runId,status:'pending',detail:'Computing recorded ancestry.'};
const ready={schema_version:1,run_id:runId,status:'ready',explanation:result};
const unavailable={schema_version:1,run_id:runId,status:'unavailable',detail:'This run has no persisted individual lineage.'};

test('backend pending explanation polls after two seconds and displays ready attribution despite a missing sample index',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  let calls=0,requested,signal;
  const api={explanation:async(id,options)=>{requested=id;signal=options.signal;return ++calls===1?pending:ready;}};
  const root=await mount(Page,{runId,api,client:{...client,index:async()=>{throw new Error('Samples are unavailable');}}});
  try{
    assert.equal(requested,runId);assert.match(document.body.textContent,/Computing recorded ancestry/);
    assert.match(document.body.textContent,/Backend lineage/);
    await act(async()=>t.mock.timers.tick(1999));assert.equal(calls,1);
    await act(async()=>t.mock.timers.tick(1));assert.equal(calls,2);
    assert.ok(document.querySelector('[data-attribution]'));
    await act(async()=>t.mock.timers.tick(6000));assert.equal(calls,2);
  }finally{await root.close();assert.equal(signal.aborted,true);t.mock.timers.reset();}
});

test('backend pending stops at unavailable and never loads an unrelated sample recording',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});let calls=0,sampleCalls=0;
  const api={explanation:async()=>++calls===1?pending:unavailable};
  const root=await mount(Page,{runId,api,client:{...client,run:async()=>{sampleCalls++;return result;}}});
  try{
    await act(async()=>t.mock.timers.tick(2000));
    assert.match(document.body.textContent,/no persisted individual lineage/);
    assert.equal(document.querySelector('[data-attribution]'),null);
    await act(async()=>t.mock.timers.tick(10000));assert.equal(calls,2);assert.equal(sampleCalls,0);
  }finally{await root.close();t.mock.timers.reset();}
});

test('backend request failures offer retry without automatically switching to samples',async()=>{
  let calls=0,sampleCalls=0;
  const api={explanation:async()=>{if(++calls===1)throw new Error('Backend unavailable');return ready;}};
  const root=await mount(Page,{runId,api,client:{...client,run:async()=>{sampleCalls++;return result;}}});
  try{
    assert.match(document.querySelector('[role="alert"]').textContent,/Backend unavailable/);
    assert.equal(document.querySelector('[data-attribution]'),null);
    await click(button('Retry'));assert.ok(document.querySelector('[data-attribution]'));assert.equal(sampleCalls,0);
  }finally{await root.close();}
});

test('a pending response never displays attached attribution before ready and polling errors can be retried',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});let calls=0;
  const api={explanation:async()=>{calls++;if(calls===1)return {...pending,explanation:result};if(calls===2)throw new Error('Analysis request failed');return ready;}};
  const root=await mount(Page,{runId,api,client});
  try{
    assert.ok(!document.querySelector('[data-attribution]'),'pending attribution remains hidden');
    await act(async()=>t.mock.timers.tick(2000));
    assert.match(document.querySelector('[role="alert"]').textContent,/Analysis request failed/);
    await act(async()=>t.mock.timers.tick(10000));assert.equal(calls,2);
    await click(button('Retry'));assert.ok(document.querySelector('[data-attribution]'));
  }finally{await root.close();t.mock.timers.reset();}
});

test('changing backend aborts the old request and ignores its late result for the same run',async()=>{
  let resolve,signal;
  const oldApi={explanation:(_,options)=>{signal=options.signal;return new Promise(r=>resolve=r);}};
  const newApi={explanation:async()=>unavailable};
  const root=await mount(Page,{runId,api:oldApi,client});
  try{
    await root.rerender({api:newApi});assert.equal(signal.aborted,true);
    await act(async()=>resolve(ready));
    assert.match(document.body.textContent,/no persisted individual lineage/);assert.equal(document.querySelector('[data-attribution]'),null);
  }finally{await root.close();}
});

test('changing run clears pending polling and ignores late backend results',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});let calls=0,resolve,oldSignal;
  const other='run-20261102T120001Z-11223344';
  const api={explanation:(id,options)=>{
    calls++;
    if(id===other)return Promise.resolve({...unavailable,run_id:other});
    oldSignal=options.signal;
    return calls===1?Promise.resolve(pending):new Promise(r=>resolve=r);
  }};
  const root=await mount(Page,{runId,api,client});
  try{
    await act(async()=>t.mock.timers.tick(2000));assert.equal(calls,2);
    await root.rerender({runId:other});assert.equal(oldSignal.aborted,true);
    await act(async()=>resolve(ready));
    assert.equal(document.querySelector('[data-attribution]'),null);
    assert.match(document.body.textContent,/no persisted individual lineage/);
    await act(async()=>t.mock.timers.tick(10000));assert.equal(calls,3);
  }finally{await root.close();t.mock.timers.reset();}
});

test('unmount cancels the scheduled backend poll',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});let calls=0,signal;
  const root=await mount(Page,{runId,client,api:{explanation:async(_,options)=>{calls++;signal=options.signal;return pending;}}});
  await root.close();assert.equal(signal.aborted,true);
  await act(async()=>t.mock.timers.tick(10000));assert.equal(calls,1);t.mock.timers.reset();
});

test('versioned sample IDs remain explicitly labeled and selectable with a backend configured',async()=>{
  const sampleId='run-20260903T230838Z-4891f68f';let backendCalls=0,sampleCalls=0;
  const sampleClient={index:async()=>({schema_version:1,runs:[{run_id:sampleId,algorithm:'de',benchmark:'rastrigin',islands:4,coverage_percent:100}],errors:[]}),run:async id=>{sampleCalls++;assert.equal(id,sampleId);return {...result,run_id:id};}};
  const root=await mount(Page,{runId:sampleId,client:sampleClient,api:{explanation:async()=>{backendCalls++;return unavailable;}}});
  try{
    assert.match(document.body.textContent,/Sample recording/);assert.ok(document.querySelector('[data-attribution]'));
    assert.equal(sampleCalls,1);assert.equal(backendCalls,0);
    assert.match(document.querySelector('select[name="explanation-run"]').selectedOptions[0].textContent,/Sample recording/);
  }finally{await root.close();}
});

test('malformed and wrong-run backend ready responses are errors rather than displayed attribution',async()=>{
  for(const value of [{...ready,run_id:'run-20261102T120001Z-11223344'},{...ready,explanation:{...result,games:{islands:null,routes:game}}}]){
    const root=await mount(Page,{runId,client,api:{explanation:async()=>value}});
    try{assert.match(document.querySelector('[role="alert"]').textContent,/malformed|another run/);assert.equal(document.querySelector('[data-attribution]'),null);}finally{await root.close();}
  }
});
