import test from 'node:test';
import assert from 'node:assert/strict';
import {applyGraphDelta,emptyGraph,graphFromResult} from './graph-model.js';
import {visibleGraph} from './graph-visibility.js';

const nodes=(ids,islands)=>({id:ids,island:islands,x:ids.map(Number),y:ids.map(()=>0),z:ids.map(()=>0),visits:ids.map(()=>1),members:ids.map(()=>2),mean_fitness:ids.map(()=>3),best_fitness:ids.map(()=>4),fitness_percentile:ids.map(()=>50),progress:ids.map(()=>0.5),first_eval:ids.map(()=>0),last_eval:ids.map(()=>1),in_degree:ids.map(()=>0),out_degree:ids.map(()=>0),islands_sharing:ids.map(()=>1),island_best:ids.map(()=>false),overall_best:ids.map(()=>false),migration_endpoint:ids.map(()=>false),genome_hash:ids.map(id=>`hash-${id}`),weight:null});
const edges=(ids,sources,targets)=>({id:ids,source:sources,target:targets,weight:ids.map(()=>1)});
const migrations=(ids,sources,targets)=>({id:ids,source:sources,target:targets,count:ids.map(()=>2)});
const changes=(ids,fields)=>({id:ids,...fields});

test('materializes backend columnar result with nullable weights and stable IDs',()=>{
  const graph=graphFromResult({graph:{nodes:nodes([10,20],[0,1]),edges:edges([5],[10],[20]),migrations:migrations([7],[10],[20]),overlap:1.5}});
  assert.equal(graph.nodes.get(20).genome_hash,'hash-20');
  assert.equal(graph.nodes.get(10).weight,null);
  assert.equal(graph.edges.get(5).target,20);
  assert.equal(graph.overlap,1.5);
});

test('applies delta order, removes incident links and refreshes best markers',()=>{
  const start=graphFromResult({graph:{nodes:nodes([10,20],[0,1]),edges:edges([5],[10],[20]),migrations:migrations([7],[10],[20]),overlap:1}});
  const delta={new_nodes:nodes([30],[1]),updated_nodes:changes([10],{x:[6],y:[0],z:[0],visits:[4],members:[5],mean_fitness:[7],best_fitness:[8],progress:[.9],first_eval:[0],last_eval:[9],in_degree:[2],out_degree:[3],islands_sharing:[1],migration_endpoint:[true]}),percentiles:changes([10],{fitness_percentile:[95]}),weights:changes([10],{weight:[.4]}),positions:changes([10],{x:[9],y:[2],z:[1]}),removed_nodes:[20],new_edges:edges([6],[10],[30]),edge_updates:changes([6],{weight:[4]}),new_migrations:migrations([8],[10],[30]),migration_updates:changes([8],{count:[5]}),island_best:[10],overall_best:30,overlap:1.2};
  const next=applyGraphDelta(start,delta);
  assert.equal(start.nodes.size,2);
  assert.equal(next.nodes.get(10).x,9);
  assert.equal(next.nodes.get(10).fitness_percentile,95);
  assert.equal(next.nodes.get(10).weight,.4);
  assert.equal(next.nodes.get(10).island_best,true);
  assert.equal(next.nodes.get(30).overall_best,true);
  assert.equal(next.nodes.has(20),false);
  assert.equal(next.edges.has(5),false);
  assert.equal(next.edges.get(6).weight,4);
  assert.equal(next.migrations.has(7),false);
  assert.equal(next.migrations.get(8).count,5);
});

test('migration visibility follows hidden islands and only existing node IDs',()=>{
  const graph=graphFromResult({graph:{nodes:nodes([10,20],[0,1]),edges:edges([5],[10],[20]),migrations:migrations([7],[10],[20]),overlap:1}});
  const shown=visibleGraph(graph,{hiddenIslands:new Set([1])});
  assert.deepEqual(shown.nodes.map(node=>node.id),[10]);
  assert.equal(shown.edges.length,0);
  assert.equal(shown.migrations.length,0);
  assert.equal(emptyGraph().nodes.size,0);
});
