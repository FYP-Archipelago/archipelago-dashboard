import test from 'node:test';
import assert from 'node:assert/strict';
import { readRecentRuns, rememberRun, forgetRun, HISTORY_KEY } from './recent-runs.js';
const memory=()=>{const entries=new Map();return {getItem:key=>entries.get(key)??null,setItem:(key,value)=>entries.set(key,value)};};
const entry=n=>({run_id:`run-20261102T120000Z-${n.toString(16).padStart(8,'0')}`,preset:'de_rastrigin',source:'new',at:'2026-11-02T12:00:00Z'});

test('history survives reads and deduplicates by backend and ID, with at most 30 per backend',()=>{
  const storage=memory();
  rememberRun(storage,'/backend/',entry(1));rememberRun(storage,'/backend',entry(1));
  rememberRun(storage,'http://other:8000',entry(1));
  assert.equal(readRecentRuns(storage,'/backend').length,1);
  for(let i=2;i<=32;i++)rememberRun(storage,'/backend',entry(i));
  const list=readRecentRuns(storage,'/backend');assert.equal(list.length,30);assert.equal(list[0].run_id,entry(32).run_id);
  forgetRun(storage,'/backend',entry(32).run_id);assert.equal(readRecentRuns(storage,'/backend').length,29);
  assert.equal(readRecentRuns(storage,'http://other:8000').length,1);
});

test('malformed, versionless and disabled storage never crash reading',()=>{
  const storage=memory();
  for(const data of ['oops','null','{}',JSON.stringify([entry(1),null,{run_id:'bogus'}])]) {
    storage.setItem(HISTORY_KEY,data);assert.deepEqual(readRecentRuns(storage,'/backend'),[]);
  }
  const disabled={getItem:()=>{throw Error('blocked');},setItem:()=>{throw Error('quota');}};
  assert.deepEqual(readRecentRuns(disabled,'/backend'),[]);
  assert.throws(()=>rememberRun(disabled,'/backend',entry(1)),/remember/);
  assert.throws(()=>rememberRun(storage,'/backend',{run_id:'bogus'}),/run ID/);
});

test('accepted configuration survives refresh and manual reopen without inferred status',()=>{
  const storage=memory();
  const configuration={preset:'de_rastrigin',overrides:{seed:0},stream:false,clustering:{birch:true,detail:1}};
  rememberRun(storage,'http://localhost:8000',{...entry(1),configuration,status:'queued'});
  rememberRun(storage,'http://localhost:8000',{run_id:entry(1).run_id,source:'manual'});
  const saved=readRecentRuns(storage,'http://localhost:8000')[0];
  assert.deepEqual(saved.configuration,configuration);assert.equal(saved.preset,'de_rastrigin');
  assert.equal(saved.status,undefined);assert.equal(saved.source,'new');
});

test('corrupted remembered metadata is discarded without losing its valid run ID',()=>{
  const storage=memory();
  storage.setItem(HISTORY_KEY,JSON.stringify({version:1,runs:[{...entry(1),backend:'/backend',preset:{bad:true},configuration:{preset:'broken',stream:false,overrides:null,clustering:{}}}]}));
  const saved=readRecentRuns(storage,'/backend')[0];
  assert.equal(saved.run_id,entry(1).run_id);assert.equal(saved.preset,'');assert.equal(saved.configuration,undefined);
});
