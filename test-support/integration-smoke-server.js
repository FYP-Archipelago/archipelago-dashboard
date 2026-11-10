// Explicit test fixture server: no runner, database, clustering or scientific computation.
// Run manually, then point a separate Vite process's ARCHIPELAGO_BACKEND_URL here.
import http from 'node:http';
import {readFileSync} from 'node:fs';
import {catalog} from './presets.js';
import {result,delta} from './backend-fixture.js';

const runs=new Map();let sequence=0;
// Python-precomputed attribution from a published recording, attached to every fixture result.
const {explainability}=JSON.parse(readFileSync(new URL('../public/recorded-runs/run-20260903T230838Z-4891f68f.json',import.meta.url),'utf8'));
const json=(res,value,status=200)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(value));};
const send=(entry,event,data)=>{for(const res of entry.clients)res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);};
const status=(entry,next)=>{entry.status=next;send(entry,'status',{status:next});};
http.createServer(async(req,res)=>{
  const path=new URL(req.url,'http://localhost').pathname;
  if(req.method==='GET'&&path==='/health')return json(res,{status:'ok',db:true,redis:true,test_fixture:true});
  if(req.method==='GET'&&path==='/presets')return json(res,catalog);
  if(req.method==='POST'&&path==='/runs'){
    let text='';for await(const chunk of req)text+=chunk;
    const request=JSON.parse(text),id=`run-20261104T120000Z-${(++sequence).toString(16).padStart(8,'0')}`;
    const final={...structuredClone(result),explainability};final.run.run_id=id;
    const entry={...request,run_id:id,status:'queued',clients:new Set(),final};runs.set(id,entry);
    const later=(ms,action)=>setTimeout(()=>{if(!['cancelled','done','failed'].includes(entry.status))action();},ms);
    later(500,()=>status(entry,'running'));
    later(1200,()=>{
      if(!request.stream)return;
      const graph={...delta(),new_nodes:final.graph.nodes,new_edges:final.graph.edges,new_migrations:final.graph.migrations,overlap:final.graph.overlap};
      send(entry,'update',{status:'live',graph,layout:final.layout,clustering:final.clustering,malformed_rows:0,warnings:[]});
    });
    later(5000,()=>status(entry,'clustering'));
    later(9000,()=>{status(entry,'done');send(entry,'final',final);for(const client of entry.clients)client.end();});
    console.log(`Fixture created ${id}, stream=${request.stream}`);
    return json(res,{...request,run_id:id,status:'queued',error:null},202);
  }
  const match=path.match(/^\/runs\/([^/]+)\/(events|result|cancel)$/);
  const entry=match&&runs.get(match[1]);
  if(!entry)return json(res,{detail:'run not found'},404);
  if(req.method==='GET'&&match[2]==='result')return entry.status==='done'?json(res,entry.final):json(res,{detail:`no result: run is ${entry.status}`},404);
  if(req.method==='GET'&&match[2]==='events'){
    res.writeHead(200,{'content-type':'text/event-stream','cache-control':'no-cache'});res.flushHeaders();entry.clients.add(res);
    res.write(`event: status\ndata: ${JSON.stringify({status:entry.status})}\n\n`);
    req.on('close',()=>entry.clients.delete(res));return;
  }
  if(req.method==='POST'&&match[2]==='cancel'){
    if(!['done','failed','cancelled'].includes(entry.status))status(entry,'cancelled');
    return json(res,{run_id:entry.run_id,status:entry.status,error:null},entry.status==='cancelled'?202:200);
  }
  json(res,{detail:'Not found'},404);
}).listen(8181,'127.0.0.1',()=>console.log('TEST FIXTURE backend: http://127.0.0.1:8181 (not a real runner)'));
