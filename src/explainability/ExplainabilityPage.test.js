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
