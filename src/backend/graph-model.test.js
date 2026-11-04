import test from 'node:test';
import assert from 'node:assert/strict';
import {applyGraphDelta,emptyGraph,graphFromResult} from './graph-model.js';
import {visibleGraph} from './graph-visibility.js';

const nodes=(ids,islands)=>({id:ids,island:islands,x:ids.map(Number),y:ids.map(()=>0),z:ids.map(()=>0),visits:ids.map(()=>1),members:ids.map(()=>2),mean_fitness:ids.map(()=>3),best_fitness:ids.map(()=>4),fitness_percentile:ids.map(()=>50),progress:ids.map(()=>0.5),first_eval:ids.map(()=>0),last_eval:ids.map(()=>1),in_degree:ids.map(()=>0),out_degree:ids.map(()=>0),islands_sharing:ids.map(()=>1),island_best:ids.map(()=>false),overall_best:ids.map(()=>false),migration_endpoint:ids.map(()=>false),genome_hash:ids.map(id=>`hash-${id}`),weight:null});
const edges=(ids,sources,targets)=>({id:ids,source:sources,target:targets,weight:ids.map(()=>1)});
const migrations=(ids,sources,targets)=>({id:ids,source:sources,target:targets,count:ids.map(()=>2)});
const changes=(ids,fields)=>({id:ids,...fields});
const snapshot=()=>({graph:{nodes:nodes([10,20],[0,1]),edges:edges([5],[10],[20]),migrations:migrations([7],[10],[20]),overlap:1.5}});
const delta=()=>({new_nodes:nodes([],[]),updated_nodes:changes([],Object.fromEntries(['x','y','z','visits','members','mean_fitness','best_fitness','progress','first_eval','last_eval','in_degree','out_degree','islands_sharing','migration_endpoint'].map(field=>[field,[]]))),percentiles:changes([],{fitness_percentile:[]}),weights:null,positions:null,removed_nodes:[],new_edges:edges([],[],[]),edge_updates:changes([],{weight:[]}),new_migrations:migrations([],[],[]),migration_updates:changes([],{count:[]}),island_best:[10],overall_best:20,overlap:1.5});

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

for (const [name,mutate] of [
  ['duplicate node IDs',r=>{r.graph.nodes.id=[10,10];}],
  ['string node ID',r=>{r.graph.nodes.id[0]='10';}],
  ['fractional node ID',r=>{r.graph.nodes.id[0]=10.5;}],
  ['unsafe node ID',r=>{r.graph.nodes.id[0]=Number.MAX_SAFE_INTEGER+1;}],
  ['negative edge ID',r=>{r.graph.edges.id[0]=-1;}],
  ['duplicate migration IDs',r=>{r.graph.migrations=migrations([7,7],[10,10],[20,20]);}],
  ['short column',r=>{r.graph.nodes.x.pop();}],
  ['long column',r=>{r.graph.edges.weight.push(2);}],
  ['missing empty column',r=>{r.graph.nodes=nodes([],[]);delete r.graph.nodes.x;}],
  ['non-finite coordinate',r=>{r.graph.nodes.x[0]=Infinity;}],
  ['object coordinate',r=>{r.graph.nodes.y[0]={value:1};}],
  ['null coordinate',r=>{r.graph.nodes.z[0]=null;}],
  ['non-finite fitness',r=>{r.graph.nodes.best_fitness[0]=NaN;}],
  ['object fitness',r=>{r.graph.nodes.mean_fitness[0]={};}],
  ['string percentile',r=>{r.graph.nodes.fitness_percentile[0]='50';}],
  ['non-finite progress',r=>{r.graph.nodes.progress[0]=-Infinity;}],
  ['fractional count',r=>{r.graph.nodes.visits[0]=1.5;}],
  ['object island',r=>{r.graph.nodes.island[0]={};}],
  ['non-boolean marker',r=>{r.graph.nodes.overall_best[0]='false';}],
  ['object genome hash',r=>{r.graph.nodes.genome_hash[0]={};}],
  ['non-finite node weight',r=>{r.graph.nodes.weight=[NaN,null];}],
  ['nullable edge weight',r=>{r.graph.edges.weight=null;}],
  ['object migration count',r=>{r.graph.migrations.count[0]={};}],
  ['dangling edge',r=>{r.graph.edges.target[0]=30;}],
  ['string link reference',r=>{r.graph.edges.target[0]='20';}],
  ['dangling migration',r=>{r.graph.migrations.source[0]=30;}],
  ['non-finite overlap',r=>{r.graph.overlap=NaN;}],
]) test(`rejects snapshot with ${name}`,()=>{
  const result=snapshot();mutate(result);
  assert.throws(()=>graphFromResult(result),/Backend graph/);
});

test('preserves nullable node measurements and arbitrary finite layout coordinates',()=>{
  const result=snapshot();
  Object.assign(result.graph.nodes,{x:[-124.5,1e20],mean_fitness:[null,-12.5],best_fitness:[null,0],weight:[null,.25]});
  const graph=graphFromResult(result);
  assert.equal(graph.nodes.get(10).mean_fitness,null);
  assert.equal(graph.nodes.get(10).weight,null);
  assert.equal(graph.nodes.get(20).x,1e20);
  assert.equal(graph.nodes.get(20).fitness_percentile,50);
});

for (const [name,mutate] of [
  ['existing new node ID',d=>{d.new_nodes=nodes([10],[0]);}],
  ['duplicate new node IDs',d=>{d.new_nodes=nodes([30,30],[0,1]);}],
  ['unknown node update',d=>{d.percentiles=changes([30],{fitness_percentile:[50]});}],
  ['duplicate update IDs',d=>{d.percentiles=changes([10,10],{fitness_percentile:[50,60]});}],
  ['mismatched positions',d=>{d.positions=changes([10],{x:[1,2],y:[0],z:[0]});}],
  ['non-finite position',d=>{d.positions=changes([10],{x:[NaN],y:[0],z:[0]});}],
  ['invalid optional positions',d=>{d.positions=false;}],
  ['invalid optional weights',d=>{d.weights=0;}],
  ['object weight',d=>{d.weights=changes([10],{weight:[{}]});}],
  ['duplicate removals',d=>{d.removed_nodes=[10,10];d.island_best=[];}],
  ['invalid removal ID',d=>{d.removed_nodes=['10'];}],
  ['unknown removal ID',d=>{d.removed_nodes=[30];}],
  ['missing removals',d=>{delete d.removed_nodes;}],
  ['dangling new edge',d=>{d.new_edges=edges([6],[10],[30]);}],
  ['edge to removed node',d=>{d.removed_nodes=[20];d.overall_best=10;d.new_edges=edges([6],[10],[20]);}],
  ['existing new edge ID',d=>{d.new_edges=edges([5],[20],[10]);}],
  ['dangling new migration',d=>{d.new_migrations=migrations([8],[30],[20]);}],
  ['unknown edge update',d=>{d.edge_updates=changes([6],{weight:[3]});}],
  ['unknown migration update',d=>{d.migration_updates=changes([8],{count:[3]});}],
  ['non-numeric link update',d=>{d.edge_updates=changes([5],{weight:[{}]});}],
  ['unknown best node',d=>{d.overall_best=30;}],
  ['invalid best node',d=>{d.overall_best='20';}],
  ['unknown island best node',d=>{d.island_best=[30];}],
  ['duplicate island best IDs',d=>{d.island_best=[10,10];}],
  ['non-finite overlap',d=>{d.overlap=Infinity;}],
]) test(`rejects delta with ${name} without changing the prior graph`,()=>{
  const previous=graphFromResult(snapshot());
  const before=structuredClone(previous);
  const update=delta();mutate(update);
  assert.throws(()=>applyGraphDelta(previous,update),/Backend graph/);
  assert.deepEqual(previous,before);
});

test('allows an empty backend delta and nullable overall best on an empty graph',()=>{
  const update=delta();update.island_best=[];update.overall_best=null;update.overlap=0;
  assert.deepEqual(applyGraphDelta(emptyGraph(),update),emptyGraph());
});

test('a late delta validation failure preserves previously applied node and link values',()=>{
  const previous=graphFromResult(snapshot());
  const update=delta();
  update.positions=changes([10],{x:[-99.5],y:[2],z:[3]});
  update.edge_updates=changes([5],{weight:[10]});
  update.overall_best=999;
  assert.throws(()=>applyGraphDelta(previous,update),/Backend graph/);
  assert.equal(previous.nodes.get(10).x,10);
  assert.equal(previous.edges.get(5).weight,1);
});

test('delta preserves nullable fitness and fractional node weights while replacing prior best markers',()=>{
  const result=snapshot();
  result.graph.nodes.island_best=[false,true];result.graph.nodes.overall_best=[false,true];
  const previous=graphFromResult(result);
  const update=delta();
  update.updated_nodes=changes([10],Object.fromEntries(Object.entries(nodes([10],[0])).filter(([field])=>Object.hasOwn(update.updated_nodes,field))));
  update.updated_nodes.mean_fitness=[null];update.updated_nodes.best_fitness=[null];
  update.weights=changes([10],{weight:[.125]});
  update.overall_best=10;
  const next=applyGraphDelta(previous,update);
  assert.equal(next.nodes.get(10).mean_fitness,null);
  assert.equal(next.nodes.get(10).best_fitness,null);
  assert.equal(next.nodes.get(10).weight,.125);
  assert.equal(next.nodes.get(10).overall_best,true);
  assert.equal(next.nodes.get(20).island_best,false);
  assert.equal(next.nodes.get(20).overall_best,false);
  assert.equal(previous.nodes.get(20).overall_best,true);
});
