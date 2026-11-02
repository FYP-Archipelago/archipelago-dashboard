import test from 'node:test';
import assert from 'node:assert/strict';
import {backendViewerGraph} from './backend-graph.js';

test('backend graph keeps stable IDs, island labels, best markers and migration counts',()=>{
  const nodes=new Map([
    [72,{id:72,island:5,x:.2,y:.3,z:.4,mean_fitness:8,best_fitness:7,fitness_percentile:.25,progress:.8,visits:4,members:3,islands_sharing:2,island_best:true,overall_best:true,genome_hash:'h72'}],
    [13,{id:13,island:2,x:-.5,y:.1,z:0,mean_fitness:12,best_fitness:10,fitness_percentile:.9,progress:.1,visits:1,members:1,islands_sharing:1,island_best:true,overall_best:false,genome_hash:'h13'}]
  ]);
  const graph={nodes,edges:new Map([[1,{id:1,source:13,target:72,weight:3}]]),migrations:new Map([[2,{id:2,source:13,target:72,count:9}]]),overlap:1.5};
  const {G,DS,idIndex}=backendViewerGraph(graph,'run-abc');
  assert.deepEqual(DS.islandIds,[2,5]);
  assert.equal(idIndex.get(72),1);
  assert.deepEqual([...G.e],[0,1]);
  assert.ok(Math.abs(G.pz[1]-.4)<1e-6);
  assert.ok(Math.abs(G.pct[1]-.25)<1e-6);
  assert.deepEqual([...G.bestOfGroup],[0,1]);
  assert.equal(G.bestOfRun[0],1);
  assert.equal(G.routes[0].n,9);
  assert.equal(G.mig[0].count,9);
  assert.equal(G.nodes[1].genome_hash,'h72');
});
