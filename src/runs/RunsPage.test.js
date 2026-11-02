import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { catalog } from './fixtures/presets.js';
import { readRecentRuns } from './recent-runs.js';

const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost/'});
Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true});
const { createRoot }=await import('react-dom/client');
const dir=new URL('../../.superpowers/ui-tests/',import.meta.url);
await mkdir(dir,{recursive:true});
const bundle=await build({entryPoints:[fileURLToPath(new URL('./RunsPage.jsx',import.meta.url))],bundle:true,write:false,format:'esm',packages:'external',loader:{'.css':'empty'}});
const compiled=new URL('RunsPage.mjs',dir);await writeFile(compiled,bundle.outputFiles[0].contents);
const { default:RunsPage }=await import(compiled.href);
const localBundle=await build({entryPoints:[fileURLToPath(new URL('./LocalRuns.jsx',import.meta.url))],bundle:true,write:false,format:'esm',packages:'external'});
const localCompiled=new URL('LocalRuns.mjs',dir);await writeFile(localCompiled,localBundle.outputFiles[0].contents);
const { default:LocalRuns }=await import(localCompiled.href);
const id='run-20261102T120000Z-aabbccdd';
const api=(extra={})=>({baseUrl:'/backend',health:async()=>({status:'ok',db:true,redis:true}),presets:async()=>catalog,createRun:async()=>({run_id:id,status:'queued',preset:'de_rastrigin'}),...extra});

test('application shell remains valid UTF-8 so labels render without replacement characters',async()=>{
  const source=await readFile(new URL('../main.jsx',import.meta.url));
  assert.doesNotThrow(()=>new TextDecoder('utf-8',{fatal:true}).decode(source));
});

async function render(client=api(),options={}) {
  document.body.innerHTML='<div id="test-root"></div>';window.localStorage.clear();
  const root=createRoot(document.getElementById('test-root'));const opened=[];
  await act(async()=>root.render(React.createElement(RunsPage,{api:client,onOpenRun:runId=>opened.push(runId),storage:window.localStorage,...options})));
  return {opened,close:async()=>act(()=>root.unmount())};
}
const find=name=>document.querySelector(`[name="${name}"]`);
async function input(name,value) {
  const el=find(name);assert.ok(el,`Input ${name} exists`);
  await act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new dom.window.Event('input',{bubbles:true}));});
}
async function click(el) {assert.ok(el,'button exists');await act(async()=>{el.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true}));});}
const button=text=>[...document.querySelectorAll('button')].find(el=>el.textContent===text);
async function submit() {await act(async()=>{document.querySelector('.new-run-form').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));});}

test('preset UI uses backend defaults and submits an actual CreateRun body before handing off ID',async()=>{
  let body;
  const view=await render(api({createRun:async value=>{body=value;return {run_id:id,status:'queued',preset:'de_rastrigin'};}}));
  try {
    assert.match(document.body.textContent,/Backend connected/);
    assert.match(document.body.textContent,/Five islands explore Rastrigin/);
    assert.equal(find('num_islands').value,'5');assert.equal(find('num_islands').min,'4');
    await input('seed','0');await submit();
    assert.equal(body.preset,'de_rastrigin');assert.deepEqual(body.overrides,{seed:0});assert.equal(body.stream,true);assert.equal(body.clustering.birch,true);
    assert.deepEqual(view.opened,[id]);assert.equal(readRecentRuns(window.localStorage,'/backend')[0].run_id,id);
  } finally {await view.close();}
});

test('stage validation prevents POST and an API error keeps edited values',async()=>{
  let calls=0;
  const view=await render(api({createRun:async()=>{calls++;throw Error('Runner rejected this combination.');}}));
  try {
    await input('evaluation_budget','2000');
    for(const name of ['lsh','birch','denstream'])await click(find(name));
    await submit();assert.equal(calls,0);assert.match(document.body.textContent,/Enable at least one clustering stage/);
    await click(find('birch'));await submit();assert.equal(calls,1);
    assert.match(document.body.textContent,/Runner rejected this combination/);assert.equal(find('evaluation_budget').value,'2000');
  } finally {await view.close();}
});

test('pending submission cannot produce duplicate runs, even from repeated submit events',async()=>{
  let resolve,calls=0;const pending=new Promise(done=>resolve=done);
  const view=await render(api({createRun:()=>{calls++;return pending;}}));
  try {
    await submit();await submit();assert.equal(calls,1);assert.ok(button('Starting…').disabled);
    await act(async()=>resolve({run_id:id,status:'queued',preset:'de_rastrigin'}));assert.deepEqual(view.opened,[id]);
  }finally{await view.close();}
});

test('preset failure can retry; upload tab is explicit and preserves the new-run form',async()=>{
  let calls=0;
  const view=await render(api({presets:async()=>{if(!calls++)throw Error('Runner unavailable.');return catalog;}}));
  try{
    assert.match(document.body.textContent,/Runner unavailable/);await click(button('Retry connection'));assert.ok(find('num_islands'));
    await input('evaluation_budget','3000');await click(button('Upload an existing run'));
    assert.match(document.body.textContent,/backend does not yet accept existing-run uploads/);
    await click(button('Start a new run'));assert.equal(find('evaluation_budget').value,'3000');
  }finally{await view.close();}
});

test('history can reopen/remove IDs and accepted runs still navigate when storage is blocked',async()=>{
  const view=await render();
  try{
    await input('run_id',id);await click(button('Open run'));assert.deepEqual(view.opened,[id]);
    await click(button('Remove'));assert.equal(readRecentRuns(window.localStorage,'/backend').length,0);
  }finally{await view.close();}
  const blocked={getItem:()=>null,setItem:()=>{throw Error('quota');}};
  const accepted=await render(api(),{storage:blocked});
  try{await submit();assert.deepEqual(accepted.opened,[id]);assert.match(document.body.textContent,/could not remember/);}finally{await accepted.close();}
});

test('unhealthy backend blocks creation and stale catalog responses cannot replace retry results',async()=>{
  let done,calls=0;const pending=new Promise(resolve=>done=resolve);
  const view=await render(api({health:async()=>({status:'unavailable',db:false,redis:true}),presets:()=>++calls===1?pending:Promise.resolve(catalog)}));
  try {
    assert.match(document.body.textContent,/Backend unavailable/);await click(button('Retry connection'));
    await act(async()=>done({...catalog,presets:[{...catalog.presets[0],description:'STALE DESCRIPTION'}]}));
    assert.doesNotMatch(document.body.textContent,/STALE DESCRIPTION/);assert.ok(button('Start run').disabled);
  }finally{await view.close();}
});

test('changing presets preserves each draft and uses the newly selected defaults',async()=>{
  const second={...catalog.presets[0],preset:'de_sphere',benchmark:'sphere',defaults:{...catalog.presets[0].defaults,evaluation_budget:20000}};
  const view=await render(api({presets:async()=>({...catalog,presets:[...catalog.presets,second]})}));
  const choose=async value=>act(async()=>{const select=find('preset');select.value=value;select.dispatchEvent(new dom.window.Event('change',{bubbles:true}));});
  try{
    await input('evaluation_budget','3000');await choose('de_sphere');assert.equal(find('evaluation_budget').value,'20000');
    await input('evaluation_budget','4000');await choose('de_rastrigin');assert.equal(find('evaluation_budget').value,'3000');
    await choose('de_sphere');assert.equal(find('evaluation_budget').value,'4000');
  }finally{await view.close();}
});

test('history follows resolved proxy target when that target changes at the same dashboard origin',async()=>{
  let target='http://first:8000';
  const view=await render(api({identity:async()=>target}));
  try{
    await input('run_id',id);await click(button('Open run'));
    assert.equal(readRecentRuns(window.localStorage,target).length,1);
    target='http://second:8000';await click(button('Retry connection'));
    assert.match(document.body.textContent,/No runs remembered yet/);
    assert.equal(readRecentRuns(window.localStorage,'http://first:8000').length,1);
  }finally{await view.close();}
});

test('local library retains open, summaries and explicitly confirmed deletion',async()=>{
  document.body.innerHTML='<div id="test-root"></div>';const root=createRoot(document.getElementById('test-root'));
  const calls=[],opened=[];let refreshed=0;
  const runs=[{id:'local-1',algorithm:'de',benchmark:'sphere',summary:{total_evaluations:123},size:1000}];
  await act(async()=>root.render(React.createElement(LocalRuns,{runs,onOpenLocal:id=>opened.push(id),refresh:async()=>{refreshed++;},request:async(...args)=>{calls.push(args);return {};}})));
  try{
    assert.match(document.body.textContent,/123/);await click(button('Open local-1'));assert.deepEqual(opened,['local-1']);
    assert.ok(button('Delete local run').disabled);assert.equal(calls.length,0);
    await click(find('confirm-local-delete'));await click(button('Delete local run'));
    assert.deepEqual(calls,[['/runs/local-1',{method:'DELETE'}]]);assert.equal(refreshed,1);assert.ok(button('Delete local run').disabled);
  }finally{await act(()=>root.unmount());}
});
