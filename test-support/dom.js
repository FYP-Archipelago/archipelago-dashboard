import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { catalog } from './presets.js';

export const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost/'});
Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true});
const {createRoot}=await import('react-dom/client');
export const runId='run-20261102T120000Z-aabbccdd';
export const makeApi=(extra={})=>({baseUrl:'/backend',identity:async()=> 'http://localhost:8000',health:async()=>({status:'ok',db:true,redis:true}),presets:async()=>catalog,createRun:async body=>({run_id:runId,status:'queued',...body,error:null}),...extra});

export async function compile(relative) {
  const entry=new URL('../'+relative,import.meta.url), folder=new URL(`../.superpowers/workflow-ui/${process.pid}/`,import.meta.url);
  await mkdir(folder,{recursive:true});
  const output=await build({entryPoints:[fileURLToPath(entry)],bundle:true,write:false,format:'esm',packages:'external',loader:{'.css':'empty'}});
  const file=new URL(relative.replaceAll('/','-').replace('.jsx','.mjs'),folder);
  await writeFile(file,output.outputFiles[0].contents);
  return (await import(file.href)).default;
}
export async function mount(Component,props={},prepare=()=>{}) {
  document.body.innerHTML='<div id="test-root"></div>';window.localStorage.clear();window.history.replaceState(null,'','#library');prepare();
  const root=createRoot(document.getElementById('test-root'));
  await act(async()=>root.render(React.createElement(Component,props)));
  return {close:async()=>act(()=>root.unmount()),rerender:async next=>act(async()=>root.render(React.createElement(Component,{...props,...next})))};
}
export const find=name=>document.querySelector(`[name="${name}"]`) || document.getElementById(name);
export const button=text=>[...document.querySelectorAll('button')].find(el=>el.textContent.trim()===text);
export async function click(el) {assert.ok(el,'control exists');await act(async()=>el.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true})));}
export async function input(name,value) {
  const el=find(name);assert.ok(el,`Input ${name} exists`);
  await act(async()=>{
    Object.getOwnPropertyDescriptor(el.tagName==='SELECT'?dom.window.HTMLSelectElement.prototype:dom.window.HTMLInputElement.prototype,'value').set.call(el,value);
    el.dispatchEvent(new dom.window.Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}));
  });
}
export async function submit(selector='.new-run-form') {await act(async()=>document.querySelector(selector).dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true})));}
export {act,React,catalog};
