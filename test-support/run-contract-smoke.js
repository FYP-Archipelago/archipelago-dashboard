// Opt-in HTTP/SSE smoke check against integration-smoke-server.js through Vite.
import assert from 'node:assert/strict';
import {createBackendClient} from '../src/backend/api.js';
import {emptyGraph,applyGraphDelta,graphFromResult} from '../src/backend/graph-model.js';
import {readAttribution} from '../src/explainability/attribution.js';

const base=process.argv[2]||'http://127.0.0.1:5180/backend';
const api=createBackendClient({baseUrl:base});
assert.equal((await api.health()).test_fixture,true,'Only run this script against the labelled fixture server.');
const catalog=await api.presets();
const body=stream=>({preset:catalog.presets[0].preset,overrides:{},stream,clustering:{lsh:true,birch:true,denstream:false,detail:1}});
async function follow(id,consume){
  const response=await fetch(api.url(`/runs/${id}/events`));assert.equal(response.status,200);
  const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='';
  try{
    while(true){
      const part=await reader.read();if(part.done)return;
      buffer+=decoder.decode(part.value,{stream:true});
      let split;
      while((split=buffer.indexOf('\n\n'))!==-1){
        const frame=buffer.slice(0,split);buffer=buffer.slice(split+2);
        const type=frame.match(/^event: (.+)$/m)?.[1],data=frame.match(/^data: (.+)$/m)?.[1];
        if(type&&data&&await consume(type,JSON.parse(data)))return;
      }
    }
  }finally{await reader.cancel();}
}
for(const stream of [true,false]){
  const run=await api.createRun(body(stream));let graph=emptyGraph(),updates=0;
  await assert.rejects(api.result(run.run_id),error=>error.status===404,'No result, so no attribution, before the run finishes.');
  await follow(run.run_id,(type,data)=>{
    if(type==='update'){graph=applyGraphDelta(graph,data.graph);updates++;}
    return type==='final'||(type==='status'&&data.status==='done');
  });
  const final=await api.result(run.run_id),saved=graphFromResult(final);
  assert.equal(final.run.run_id,run.run_id);assert.equal(saved.nodes.size,2);
  if(stream){assert.ok(updates>0);assert.equal(graph.nodes.size,saved.nodes.size);}else assert.equal(updates,0);
  assert.deepEqual(graphFromResult(await api.result(run.run_id)),saved,'Persisted reopen retains graph identity.');
  assert.equal(readAttribution(final,run.run_id).status,'ready','The saved result carries Shapley attribution.');
  console.log(`${stream?'streaming':'batch'}: POST → HTTP/SSE → persisted GET → reopen + attribution in the result passed`);
}
const cancelled=await api.createRun(body(true));
const ack=await api.cancelRun(cancelled.run_id);assert.equal(ack.status,'cancelled');
await follow(cancelled.run_id,(type,data)=>type==='status'&&data.status==='cancelled');
await assert.rejects(api.result(cancelled.run_id),error=>error.status===404&&/cancelled/.test(error.message));
console.log('cancellation: POST → cancelled SSE → no final result passed');
