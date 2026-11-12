import { test, expect } from 'vitest';
import { buildRunRequest, initialClustering, FormError } from './run-form.js';

import { catalog } from '../test/fixtures/presets.js';

const build = (extra = {}) =>
  buildRunRequest({ catalog, preset: 'de_rastrigin', values: {}, clustering: initialClustering(), stream: true, ...extra });

test('untouched defaults are omitted; dotted keys, bools and optional zero seed keep JSON types', () => {
  expect(build()).toStrictEqual({ preset: 'de_rastrigin', overrides: {}, stream: true, clustering: initialClustering() });
  expect(build({ values: { num_islands: '6', 'migration.enabled': false, seed: '0' } }).overrides).toStrictEqual({
    num_islands: 6,
    'migration.enabled': false,
    seed: 0,
  });
  expect(build({ values: { num_islands: '5', seed: '' } }).overrides).toStrictEqual({});
});

test('runner validation rejects blanks, fractional/out-of-range values, choices and unknown overrides', () => {
  for (const values of [
    { num_islands: '' },
    { num_islands: '4.5' },
    { num_islands: '7' },
    { num_islands: 'NaN' },
    { evaluation_budget: '999' },
    { seed: '4294967296' },
    { 'migration.enabled': 'false' },
    { 'migration.topology': 'bad' },
    { population_size: 100 },
  ])
    expect(() => build({ values })).toThrow(FormError);
  expect(() => build({ preset: 'missing' })).toThrow(/Choose a preset/);
});

test('known cross-field constraints use effective defaults and migration disabled bypasses them', () => {
  expect(() => build({ values: { 'migration.topology': 'torus' } })).toThrow(/6 islands/);
  expect(() => build({ values: { target_generations: '10' } })).toThrow(/interval/);
  expect(build({ values: { target_generations: '10', 'migration.enabled': false } }).overrides['migration.enabled']).toBe(false);
});

test('current clustering allows auto nulls and manual positive values, with a mandatory stage', () => {
  const auto = initialClustering();
  expect(build().clustering.birch_threshold).toBe(null);
  expect(build({ clustering: { ...auto, birch_threshold: '0.25', denstream_half_life: null } }).clustering.birch_threshold).toBe(0.25);
  expect(build({ clustering: { ...auto, denstream: false, denstream_half_life: '' } }).clustering.denstream_half_life).toBe(null);
  for (const settings of [
    { lsh: false, birch: false, denstream: false },
    { detail: '0.4' },
    { birch_threshold: '' },
    { birch_threshold: 0 },
    { denstream_epsilon: -1 },
    { denstream_half_life: 'x' },
    { denstream_mu: '' },
    { denstream_beta: 1.01 },
    { lsh_hashes: '1.5' },
    { seed: '1.5' },
    { birch_branching_factor: 50 },
  ])
    expect(() => build({ clustering: { ...auto, ...settings } })).toThrow(FormError);
  expect(build({ stream: false }).stream).toBe(false);
});
