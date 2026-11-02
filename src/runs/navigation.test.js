import test from 'node:test';
import assert from 'node:assert/strict';
import { readRoute, runHash } from './navigation.js';
test('backend run ID survives refresh and local navigation clears backend selection',()=>{
  const id='run-20261102T120000Z-aabbccdd';
  assert.deepEqual(readRoute(runHash(id)),{page:'archipelago',runId:id});
  assert.deepEqual(readRoute('#library'),{page:'library',runId:null});
  assert.deepEqual(readRoute('#migration'),{page:'migration',runId:null});
  assert.deepEqual(readRoute(''),{page:'library',runId:null});
  assert.deepEqual(readRoute('#archipelago?run_id=%ZZ'),{page:'archipelago',runId:null});
  assert.throws(()=>runHash('bad/id'),/run ID/);
});
