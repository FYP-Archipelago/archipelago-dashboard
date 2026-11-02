import test from 'node:test';
import assert from 'node:assert/strict';
import { readRoute, runHash } from './navigation.js';
const id='run-20261102T120000Z-aabbccdd';
test('backend IDs survive refresh and current-run tabs',()=>{
  assert.deepEqual(readRoute(runHash(id)),{page:'archipelago',runId:id});
  assert.deepEqual(readRoute(runHash(id,'configuration')),{page:'configuration',runId:id});
  assert.deepEqual(readRoute('#library'),{page:'library',runId:null});
  assert.deepEqual(readRoute(''),{page:'library',runId:null});
  assert.deepEqual(readRoute('#archipelago?run_id=%ZZ'),{page:'archipelago',runId:null});
  assert.throws(()=>runHash('bad/id'),/run ID/);
  assert.throws(()=>runHash(id,'study'),/view/);
});
test('Scale is retired while analysis placeholders retain the current run',()=>{
  assert.deepEqual(readRoute('#study'),{page:'library',runId:null});
  for(const page of ['migration','convergence','diagnostics','run'])assert.deepEqual(readRoute(runHash(id,page)),{page,runId:id});
});
