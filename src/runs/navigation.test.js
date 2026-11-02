import test from 'node:test';
import assert from 'node:assert/strict';
import { readRoute, runHash, localRunHash } from './navigation.js';
test('backend run ID survives refresh and local navigation clears backend selection',()=>{
  const id='run-20261102T120000Z-aabbccdd';
  assert.deepEqual(readRoute(runHash(id)),{page:'archipelago',runId:id});
  assert.deepEqual(readRoute('#library'),{page:'library',runId:null});
  assert.deepEqual(readRoute('#migration'),{page:'migration',runId:null});
  assert.deepEqual(readRoute(''),{page:'library',runId:null});
  assert.deepEqual(readRoute('#archipelago?run_id=%ZZ'),{page:'archipelago',runId:null});
  assert.throws(()=>runHash('bad/id'),/run ID/);
});
test('changing a local run preserves its active analysis page',()=>{
  for(const page of ['migration','convergence','run'])assert.equal(localRunHash(page),`#${page}`);
  assert.equal(localRunHash(),'#archipelago');assert.equal(localRunHash('library'),'#archipelago');
});
