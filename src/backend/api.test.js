import test from 'node:test';
import assert from 'node:assert/strict';
import { createBackendClient, BackendError } from './api.js';

const run = {run_id:'run-20261102T120000Z-aabbccdd',status:'queued',stream:true,preset:'de_rastrigin',overrides:{},clustering:{birch:true},error:null};
const reply = (value, status=200) => new Response(JSON.stringify(value), {status,headers:{'content-type':'application/json'}});

test('current backend uses its own namespace and preserves the real create response', async () => {
  const calls=[];
  const api=createBackendClient({baseUrl:'/backend/',fetchImpl:async (url,options)=>{calls.push([url,options]);return reply(run,202);}});
  const body={preset:'de_rastrigin',overrides:{seed:0},stream:true,clustering:{birch:true}};
  assert.deepEqual(await api.createRun(body),run);
  assert.equal(calls[0][0],'/backend/runs');
  assert.equal(calls[0][1].method,'POST');
  assert.deepEqual(JSON.parse(calls[0][1].body),body);
  assert.equal(api.url(`/runs/${run.run_id}/events`),`/backend/runs/${run.run_id}/events`);
  assert.throws(()=>api.url('//elsewhere/health'));
  assert.throws(()=>createBackendClient({baseUrl:'javascript:bad'}));
});

test('health, presets and result share the client and support URL prefixes', async () => {
  const calls=[];
  const api=createBackendClient({baseUrl:'http://localhost:8000/service/',fetchImpl:async url=>{calls.push(url);return reply({status:'ok',db:true,redis:true});}});
  assert.equal((await api.health()).status,'ok');
  await api.presets();await api.result(run.run_id);
  assert.deepEqual(calls,['http://localhost:8000/service/health','http://localhost:8000/service/presets',`http://localhost:8000/service/runs/${run.run_id}/result`]);
});

test('FastAPI details, validation arrays and non-JSON errors are readable', async () => {
  for(const [response, pattern] of [
    [reply({detail:'runner unavailable'},502),/runner unavailable/],
    [reply({detail:[{loc:['body','clustering','detail'],msg:'must be at most 2'}]},422),/clustering.detail: must be at most 2/],
    [new Response('<html>bad gateway</html>',{status:502}),/HTTP 502.*non-JSON/],
    [new Response('broken',{status:200}),/non-JSON/],
  ]) {
    const api=createBackendClient({fetchImpl:async()=>response});
    await assert.rejects(api.health(),error=>error instanceof BackendError&&pattern.test(error.message));
  }
});

test('failed POST is not retried and a lost response warns of ambiguous acceptance', async () => {
  let calls=0;
  const api=createBackendClient({fetchImpl:async()=>{calls++;throw new TypeError('Failed to fetch');}});
  await assert.rejects(api.createRun({}),error=>error.ambiguous&&/may have been accepted/.test(error.message));
  assert.equal(calls,1);
});

test('HTML gateway failure after create carries an ambiguous-acceptance warning',async()=>{
  const api=createBackendClient({fetchImpl:async()=>new Response('<html>Gateway timeout</html>',{status:504})});
  await assert.rejects(api.createRun({}),error=>error.status===504&&error.ambiguous&&/may have been accepted/.test(error.message));
});

test('proxy identity resolves the actual configured backend; direct URLs identify themselves',async()=>{
  let requested;
  const proxied=createBackendClient({fetchImpl:async url=>{requested=url;return reply({backend_id:'http://localhost:8000'});}});
  assert.equal(await proxied.identity(),'http://localhost:8000');assert.equal(requested,'/api/backend-config');
  const direct=createBackendClient({baseUrl:'http://other:8000/v1/'});
  assert.equal(await direct.identity(),'http://other:8000/v1');
});

test('malformed create success never yields an invented run ID', async () => {
  for(const value of [{job_id:'old-job'},{...run,run_id:''},{...run,status:'finished'}]) {
    const api=createBackendClient({fetchImpl:async()=>reply(value,202)});
    await assert.rejects(api.createRun({}),error=>error.ambiguous&&/run response/.test(error.message));
  }
});

test('external abort stays an AbortError and timeouts are readable', async () => {
  const fetchImpl=(_, {signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));
  const controller=new AbortController();
  const api=createBackendClient({fetchImpl,timeoutMs:10});
  const pending=api.presets({signal:controller.signal});controller.abort();
  await assert.rejects(pending,{name:'AbortError'});
  // Keep the loop alive: AbortSignal timeout timers alone are unref'd in Node.
  const keepAlive=setInterval(()=>{},100);
  try {await assert.rejects(api.health(),/timed out/);}finally{clearInterval(keepAlive);}
});
