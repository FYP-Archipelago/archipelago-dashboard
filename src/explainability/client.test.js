import test from 'node:test';
import assert from 'node:assert/strict';
import {createExplanationClient} from './client.js';

const id='run-20261102T120000Z-aabbccdd';
const game={method:'exact',players:[],empty_value:0,full_value:0,allocated_gain:0,efficiency_error:0,evaluated_coalitions:1,permutations:null,seed:1,coalitions:[{id:'0',players:[],value:0,value_percent:0}],examples:[]};
const artifact=()=>({schema_version:1,run_id:id,maximising:false,baseline_fitness:0,observed_best_fitness:0,supported_best_fitness:0,coverage:{total:1,supported:1,excluded:0,percent:100},warnings:[],games:{islands:game,routes:game}});
const response=body=>new Response(JSON.stringify(body),{headers:{'content-type':'application/json'}});

test('missing artifacts and Vite HTML fallback produce preparation guidance',async()=>{
  for(const res of [new Response('',{status:404}),new Response('<html/>',{headers:{'content-type':'text/html'}})]){
    const client=createExplanationClient({fetchImpl:async()=>res});
    await assert.rejects(client.index(),/explainability:prepare/);
  }
});

test('artifact validation rejects mismatched run IDs and corrupt games',async()=>{
  for(const mutate of [a=>{a.run_id='run-20261102T120001Z-11223344';},a=>{a.games.routes=null;},a=>{a.coverage.percent=NaN;},a=>{a.games.islands={...game,players:[{id:'x',label:{bad:true},value:0}]};},a=>{a.games.routes={...game,method:'permutation-sampling',permutations:null};},a=>{a.source={algorithm:{bad:true}};}]){
    const value=artifact();mutate(value);
    await assert.rejects(createExplanationClient({fetchImpl:async()=>response(value)}).run(id),/malformed|another run/);
  }
});

test('nested malformed artifacts produce a validation error rather than a renderer crash',async()=>{
  for(const mutate of [a=>{a.games.islands={...game,coalitions:[null]};},a=>{a.games.routes={...game,examples:[null]};},a=>{a.games.routes={...game,examples:[{id:'x',steps:[null]}]};},a=>{a.source=[];},a=>{a.coverage=[];}]){
    const value=artifact();mutate(value);
    await assert.rejects(createExplanationClient({fetchImpl:async()=>response(value)}).run(id),/malformed|another run/);
  }
});

test('malformed index metadata cannot reach run selector rendering',async()=>{
  for(const value of [{schema_version:1,runs:[{run_id:id,benchmark:{bad:true}}],errors:[]},{schema_version:1,runs:[],errors:[{run_id:id,detail:{bad:true}}]}]){
    await assert.rejects(createExplanationClient({fetchImpl:async()=>response(value)}).index(),/Unsupported explanation index/);
  }
});

test('valid artifact request forwards abort and bypasses stale browser caches',async()=>{
  let options,path;
  const controller=new AbortController();
  const client=createExplanationClient({fetchImpl:async(url,opts)=>{path=url;options=opts;return response(artifact());}});
  assert.equal((await client.run(id,{signal:controller.signal})).run_id,id);
  assert.equal(path,`/sample-explanations/${id}.json`);assert.equal(options.cache,'no-store');
  assert.ok(options.signal instanceof AbortSignal);
});
