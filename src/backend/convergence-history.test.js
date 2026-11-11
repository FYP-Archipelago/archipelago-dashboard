import test from 'node:test';
import assert from 'node:assert/strict';
import {convergenceHistory} from './convergence-history.js';

test('chart mapping preserves module values and gaps without filling missing generations',()=>{
  const rows=[{island_id:2,generation:4,best_fitness:0,mean_fitness:3},{island_id:2,generation:0,best_fitness:4,mean_fitness:5},{island_id:2,generation:2,best_fitness:null,mean_fitness:4}];
  const original=structuredClone(rows);
  const data=convergenceHistory({generation_history:rows});
  assert.deepEqual(rows,original);
  assert.deepEqual(data.islands[0].series.map(row=>[row.generation,row.best_fitness]),[[0,4],[2,null],[4,0]]);
  assert.equal(data.charts.best_fitness.lines[0].points[1],null);
  assert.ok(data.charts.best_fitness.lines[0].points[2]);
  assert.equal(data.charts.best_so_far_fitness,undefined);
});
test('single-point charts have finite positions and incompatible diversity units are not compared',()=>{
  const data=convergenceHistory({generation_history:[{island_id:0,generation:0,best_fitness:0,diversity:.3,diversity_metric:'hamming'},{island_id:1,generation:0,best_fitness:0,diversity:.2,diversity_metric:'euclidean'}]});
  assert.equal(data.charts.diversity,undefined);
  assert.ok(data.chart.lines.every(line=>line.points.every(point=>Number.isFinite(point.x)&&Number.isFinite(point.y))));
});
test('history rejects malformed metrics and duplicates, but absent history is empty',()=>{
  assert.equal(convergenceHistory({}),null);
  assert.equal(convergenceHistory({generation_history:[]}),null);
  for(const rows of [[{island_id:0,generation:0,best_fitness:'2'}],[{island_id:0,generation:0},{island_id:0,generation:0}]]) assert.throws(()=>convergenceHistory({generation_history:rows}));
});
test('axis labels retain distinctions for closely spaced small fitness values',()=>{
  const data=convergenceHistory({generation_history:[{island_id:0,generation:0,best_fitness:0.0000010000001},{island_id:0,generation:1,best_fitness:0.0000010000004}]});
  assert.equal(new Set(data.chart.y_ticks.map(tick=>Number(tick.label))).size,5);
  assert.equal(data.islands[0].series[0].best_fitness,0.0000010000001);
});
