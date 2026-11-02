import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePresets, buildRunRequest, initialClustering, FormError } from './run-form.js';

import { catalog } from '../../test-support/presets.js';

const build=(extra={})=>buildRunRequest({catalog,preset:'de_rastrigin',values:{},clustering:initialClustering(),stream:true,...extra});

test('real catalog accepts published rules and rejects malformed/unsupported metadata',()=>{
  assert.equal(validatePresets(catalog),catalog);
  for(const data of [null,[],{presets:[]},{...catalog,presets:[{}]},{...catalog,overrides:{seed:{type:'float'}}},{...catalog,overrides:{x:{type:'choice',choices:[]}}}]) assert.throws(()=>validatePresets(data),/preset|override/i);
});

test('untouched defaults are omitted; dotted keys, bools and optional zero seed keep JSON types',()=>{
  assert.deepEqual(build(),{preset:'de_rastrigin',overrides:{},stream:true,clustering:initialClustering()});
  assert.deepEqual(build({values:{num_islands:'6','migration.enabled':false,seed:'0'}}).overrides,{num_islands:6,'migration.enabled':false,seed:0});
  assert.deepEqual(build({values:{num_islands:'5',seed:''}}).overrides,{});
});

test('runner validation rejects blanks, fractional/out-of-range values, choices and unknown overrides',()=>{
  for(const values of [{num_islands:''},{num_islands:'4.5'},{num_islands:'7'},{num_islands:'NaN'},{evaluation_budget:'999'},{seed:'4294967296'},{'migration.enabled':'false'},{'migration.topology':'bad'},{population_size:100}]) assert.throws(()=>build({values}),FormError);
  assert.throws(()=>build({preset:'missing'}),/Choose a preset/);
});

test('known cross-field constraints use effective defaults and migration disabled bypasses them',()=>{
  assert.throws(()=>build({values:{'migration.topology':'torus'}}),/6 islands/);
  assert.throws(()=>build({values:{target_generations:'10'}}),/interval/);
  assert.equal(build({values:{target_generations:'10','migration.enabled':false}}).overrides['migration.enabled'],false);
});

test('current clustering allows auto nulls and manual positive values, with a mandatory stage',()=>{
  const auto=initialClustering();
  assert.equal(build().clustering.birch_threshold,null);
  assert.equal(build({clustering:{...auto,birch_threshold:'0.25',denstream_half_life:''}}).clustering.birch_threshold,0.25);
  for(const settings of [{lsh:false,birch:false,denstream:false},{detail:'0.4'},{birch_threshold:0},{denstream_epsilon:-1},{denstream_half_life:'x'},{denstream_mu:''},{denstream_beta:1.01},{lsh_hashes:'1.5'},{seed:'1.5'},{birch_branching_factor:50}]) assert.throws(()=>build({clustering:{...auto,...settings}}),FormError);
  assert.equal(build({stream:false}).stream,false);
});
