import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createExplanationClient} from './client.js';

test('published samples validate and reconcile island and route contributions',async()=>{
  const client=createExplanationClient({fetchImpl:async url=>new Response(await readFile(new URL('../../public'+url,import.meta.url)),{headers:{'content-type':'application/json'}})});
  const index=await client.index();
  assert.equal(index.runs.length,2);
  for(const run of index.runs){
    const artifact=await client.run(run.run_id);
    assert.equal(artifact.coverage.percent,100);
    for(const game of Object.values(artifact.games)){
      assert.ok(Math.abs(game.empty_value+game.players.reduce((sum,p)=>sum+p.value,0)-game.full_value)<1e-8);
    }
    assert.equal(artifact.observed_best_fitness,artifact.supported_best_fitness);
    assert.ok(!JSON.stringify(artifact).includes('genome_repr'));
  }
});
