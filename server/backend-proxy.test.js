import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { proxyBackend, backendIdentity } from './backend-proxy.js';
import { handler } from './index.js';

async function listen(handler) {const server=http.createServer(handler);server.listen(0,'127.0.0.1');await once(server,'listening');return server;}
const url=server=>`http://127.0.0.1:${server.address().port}`;
const close=server=>{server.closeAllConnections();return new Promise(resolve=>server.close(resolve));};

test('backend identity follows the actual upstream without credentials or URL ambiguity',()=>{
  assert.equal(backendIdentity('http://localhost:8000/'),'http://localhost:8000');
  assert.equal(backendIdentity('http://other:8000/v1/'),'http://other:8000/v1');
  for(const value of ['http://user:secret@localhost:8000','file:///tmp','http://localhost:8000/?x=1'])assert.throws(()=>backendIdentity(value));
});

test('local dashboard metadata and proxy use the same upstream and identity is never cached',async()=>{
  const upstream=await listen((req,res)=>{res.writeHead(200,{'content-type':'application/json'});res.end('{"status":"ok","db":true,"redis":true}');});
  const previous=process.env.ARCHIPELAGO_BACKEND_URL;
  process.env.ARCHIPELAGO_BACKEND_URL=url(upstream);
  const dashboard=await listen(handler);
  try{
    const config=await fetch(url(dashboard)+'/api/backend-config');
    assert.deepEqual(await config.json(),{backend_id:url(upstream)});assert.equal(config.headers.get('cache-control'),'no-store');
    const health=await fetch(url(dashboard)+'/backend/health');assert.equal((await health.json()).status,'ok');
  }finally{
    if(previous===undefined)delete process.env.ARCHIPELAGO_BACKEND_URL;else process.env.ARCHIPELAGO_BACKEND_URL=previous;
    await close(dashboard);await close(upstream);
  }
});

test('retired local data and upload APIs cannot expose or compute run data',async()=>{
  const dashboard=await listen(handler);
  try{
    for(const [method,path] of [['GET','/api/runs'],['GET','/api/config'],['GET','/api/health'],['POST','/api/runs/upload'],['POST','/api/runs/import']]){
      const response=await fetch(url(dashboard)+path,{method,...(method==='POST'?{headers:{'content-type':'application/json'},body:'{}'}:{})});
      assert.equal(response.status,404,`${method} ${path} is retired`);
    }
  }finally{await close(dashboard);}
});

test('local backend proxy preserves JSON status, body and prefix without invoking legacy API', async () => {
  let received;
  const upstream=await listen(async (req,res)=>{
    let body='';for await(const chunk of req)body+=chunk;
    received={path:req.url,method:req.method,body};res.writeHead(422,{'content-type':'application/json'});res.end('{"detail":"invalid preset"}');
  });
  const proxy=await listen((req,res)=>proxyBackend(req,res,{baseUrl:url(upstream)+'/v1'}));
  try{
    const response=await fetch(url(proxy)+'/backend/runs',{method:'POST',headers:{'content-type':'application/json'},body:'{"preset":"bad"}'});
    assert.equal(response.status,422);assert.deepEqual(await response.json(),{detail:'invalid preset'});
    assert.deepEqual(received,{path:'/v1/runs',method:'POST',body:'{"preset":"bad"}'});
    assert.equal((await fetch(url(proxy)+'/backend/cluster/run',{method:'POST'})).status,404);
    assert.equal((await fetch(url(proxy)+'/backend/runs/upload',{method:'POST'})).status,404);
  }finally{await close(proxy);await close(upstream);}
});

test('SSE is flushed immediately, forwards Last-Event-ID, and closes upstream on disconnect', async () => {
  let lastId;
  let disconnected;
  const ended=new Promise(resolve=>disconnected=resolve);
  const upstream=await listen((req,res)=>{
    lastId=req.headers['last-event-id'];res.writeHead(200,{'content-type':'text/event-stream','cache-control':'no-cache'});
    res.write('event: status\ndata: {"status":"running"}\n\n');res.on('close',disconnected);
  });
  const proxy=await listen((req,res)=>proxyBackend(req,res,{baseUrl:url(upstream)}));
  try{
    const abort=new AbortController();
    const response=await fetch(url(proxy)+'/backend/runs/run-20261102T120000Z-aabbccdd/events',{headers:{'last-event-id':'12-3'},signal:abort.signal});
    const first=await response.body.getReader().read();
    assert.match(new TextDecoder().decode(first.value),/event: status/);assert.equal(lastId,'12-3');
    assert.equal(response.headers.get('content-type'),'text/event-stream');
    abort.abort();await ended;
  }finally{await close(proxy);await close(upstream);}
});
