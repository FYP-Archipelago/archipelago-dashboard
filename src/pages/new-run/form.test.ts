import { describe, expect, it } from 'vitest';

import { PRESETS } from '@/test/fixtures.ts';

import { DEFAULT_CLUSTERING, populationOf, presetSettings, toNewRun, validate, type Form } from './form.ts';

const formFor = (presetIndex = 0, change: Partial<Form> = {}): Form => ({
  ...presetSettings(PRESETS.presets[presetIndex]!),
  clustering: DEFAULT_CLUSTERING,
  stream: true,
  name: 'brave-blue-otter',
  ...change,
});

const withText = (form: Form, text: Partial<Form['text']>): Form => ({ ...form, text: { ...form.text, ...text } });

describe('toNewRun', () => {
  it("sends the preset's defaults as numbers, unchanged", () => {
    const run = toNewRun(formFor());

    expect(run.preset).toBe('DE_Rastrigin');
    expect(run.run_settings).toEqual({ ...PRESETS.presets[0]!.defaults });
  });

  it("sends the preset's migration settings when migration is off, whatever was typed", () => {
    const form = withText(formFor(0, { migration: false, topology: 'torus' }), { 'migration.interval': 'abc', 'migration.num_migrants': '' });

    const settings = toNewRun(form).run_settings;

    expect(settings['migration.enabled']).toBe(false);
    expect(settings['migration.topology']).toBe('ring');
    expect(settings['migration.interval']).toBe(20);
    expect(settings['migration.num_migrants']).toBe(5);
  });

  it('leaves the seed out when blank, so the runner picks one, and sends it as a number when set', () => {
    expect(toNewRun(withText(formFor(), { seed: '  ' })).run_settings).not.toHaveProperty('seed');
    expect(toNewRun(withText(formFor(), { seed: '42' })).run_settings.seed).toBe(42);
  });

  it('trims the run name', () => {
    expect(toNewRun(formFor(0, { name: '  spaced-name  ' })).run_name).toBe('spaced-name');
  });

  it('sends a blank optional distance as null, which means auto', () => {
    const clustering = toNewRun(formFor()).clustering;

    expect(clustering.birch_threshold).toBeNull();
    expect(clustering.denstream_epsilon).toBeNull();
    expect(clustering.lsh_hashes).toBe(6);
  });

  it("drops a disabled stage's settings but keeps every stage flag, the detail and the general seed", () => {
    const form = formFor(0, { clustering: { ...DEFAULT_CLUSTERING, denstream: false, detail: 1.5 } });

    const clustering = toNewRun(form).clustering;

    expect(clustering).toMatchObject({ lsh: true, birch: true, denstream: false, detail: 1.5, seed: 0 });
    expect(clustering).not.toHaveProperty('denstream_mu');
    expect(clustering).not.toHaveProperty('denstream_epsilon');
    expect(clustering).toHaveProperty('birch_threshold');
  });
});

describe('validate', () => {
  it("accepts every preset's defaults", () => {
    for (const index of PRESETS.presets.keys()) {
      const form = formFor(index);
      expect(validate(form, PRESETS.overrides), PRESETS.presets[index]!.preset).toEqual({});
    }
  });

  it("enforces the runner's limits from the overrides", () => {
    const errors = validate(withText(formFor(), { evaluation_budget: '999', target_generations: '1', seed: '4294967296' }), PRESETS.overrides);

    expect(Object.keys(errors).sort()).toEqual(['evaluation_budget', 'seed', 'target_generations']);
  });

  it('rejects fractions and text where whole numbers are needed', () => {
    const errors = validate(withText(formFor(), { evaluation_budget: '1500.5', target_generations: 'many' }), PRESETS.overrides);

    expect(errors).toHaveProperty('evaluation_budget');
    expect(errors).toHaveProperty('target_generations');
  });

  it('rejects an interval longer than the run, but only once the run length itself is valid', () => {
    const tooLong = withText(formFor(), { 'migration.interval': '201' });
    const unknownLength = withText(formFor(), { 'migration.interval': '201', target_generations: '' });

    expect(validate(withText(formFor(), { 'migration.interval': '200' }), PRESETS.overrides)).not.toHaveProperty(['migration.interval']);
    expect(validate(tooLong, PRESETS.overrides)).toHaveProperty(['migration.interval']);
    expect(validate(unknownLength, PRESETS.overrides)).not.toHaveProperty(['migration.interval']);
  });

  // The runner builds the grid with as many rows as fit under the square root; under 2 x 3 it is only a ring.
  it('only allows a torus whose islands make a grid of at least 2 x 3', () => {
    const torusError = (islands: number) => validate(formFor(0, { topology: 'torus', islands }), PRESETS.overrides).topology;

    expect([4, 5, 7, 11].map(torusError)).toEqual([expect.any(String), expect.any(String), expect.any(String), expect.any(String)]);
    expect([6, 8, 9, 10, 12].map(torusError)).toEqual([undefined, undefined, undefined, undefined, undefined]);
  });

  it("names the island counts within the runner's range that make a torus", () => {
    const wide = { ...PRESETS.overrides, num_islands: { type: 'int' as const, min: 4, max: 10 } };

    expect(validate(formFor(0, { topology: 'torus', islands: 5 }), wide).topology).toBe('A torus needs 6, 8, 9 or 10 islands.');
  });

  it('ignores every migration setting while migration is off', () => {
    const form = withText(formFor(0, { migration: false, topology: 'torus' }), { 'migration.interval': '0', 'migration.num_migrants': 'x' });

    expect(validate(form, PRESETS.overrides)).toEqual({});
  });

  it('needs at least one clustering stage', () => {
    const form = formFor(0, { clustering: { ...DEFAULT_CLUSTERING, lsh: false, birch: false, denstream: false } });

    expect(validate(form, PRESETS.overrides)).toHaveProperty('stages');
  });

  it("does not hold up a run over a disabled stage's settings", () => {
    const clustering = { ...DEFAULT_CLUSTERING, denstream: false, text: { ...DEFAULT_CLUSTERING.text, denstream_beta: '5' } };

    expect(validate(formFor(0, { clustering }), PRESETS.overrides)).toEqual({});
    expect(validate(formFor(0, { clustering: { ...clustering, denstream: true } }), PRESETS.overrides)).toHaveProperty(['clustering.denstream_beta']);
  });

  it('needs a name of at most 100 characters', () => {
    expect(validate(formFor(0, { name: '   ' }), PRESETS.overrides)).toHaveProperty('name');
    expect(validate(formFor(0, { name: 'x'.repeat(101) }), PRESETS.overrides)).toHaveProperty('name');
    expect(validate(formFor(0, { name: 'x'.repeat(100) }), PRESETS.overrides)).not.toHaveProperty('name');
  });
});

// Mirrors dEA-runner's resolved_population_size, which rejects a run that sends a whole population.
describe('migrants per route', () => {
  const migrantsError = (form: Form, migrants: number) =>
    validate(withText(form, { 'migration.num_migrants': String(migrants) }), PRESETS.overrides)['migration.num_migrants'];

  it("must stay below the island's population", () => {
    // 100,000 over 5 islands is 20,000 each, over 201 generations: about 99.5, so 100.
    expect(populationOf(formFor())).toBe(100);
    expect(migrantsError(formFor(), 100)).toBeDefined();
    expect(migrantsError(formFor(), 99)).toBeUndefined();
  });

  it("counts an evolution strategy's 7 offspring per parent", () => {
    const es = formFor(0, { preset: { ...PRESETS.presets[0]!, algorithm: 'es' } });

    expect(populationOf(es)).toBe(14);
  });

  it('rounds halves to even, as Python does', () => {
    // 9,000 over 4 islands is 2,250 each, over 100 generations: exactly 22.5.
    const tie = withText(formFor(0, { islands: 4 }), { evaluation_budget: '9000', target_generations: '99' });

    expect(populationOf(tie)).toBe(22);
    expect(migrantsError(tie, 22)).toBeDefined();
  });

  it('never counts a population below 4', () => {
    const tiny = withText(formFor(0, { islands: 4 }), { evaluation_budget: '1000', target_generations: '1000', 'migration.interval': '10' });

    expect(populationOf(tiny)).toBe(4);
    expect(migrantsError(tiny, 4)).toBeDefined();
    expect(migrantsError(tiny, 3)).toBeUndefined();
  });

  it('is not checked against a population that cannot be worked out yet', () => {
    expect(populationOf(withText(formFor(), { evaluation_budget: '' }))).toBeNull();
    expect(migrantsError(withText(formFor(), { evaluation_budget: '' }), 10000)).toBeUndefined();
  });
});
