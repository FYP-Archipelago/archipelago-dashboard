import type { Clustering, Presets, Run, RunSettings } from '@/types.ts';

// Shaped like the runner's real /presets answer, trimmed to three presets.
export const PRESETS: Presets = {
  overrides: {
    num_islands: { type: 'int', min: 4, max: 6 },
    evaluation_budget: { type: 'int', min: 1000, max: 250000 },
    target_generations: { type: 'int', min: 2 },
    'migration.enabled': { type: 'bool' },
    'migration.topology': { type: 'choice', choices: ['bidirectional_ring', 'fully_connected', 'lattice', 'random', 'ring', 'star', 'torus'] },
    'migration.interval': { type: 'int', min: 1 },
    'migration.num_migrants': { type: 'int', min: 1 },
    seed: { type: 'int', min: 0, max: 4294967295, optional: true },
  },
  presets: [
    {
      preset: 'DE_Rastrigin',
      algorithm: 'de',
      benchmark: 'shifted_rotated',
      description: 'DE/rand/1/bin on CEC-shifted Rastrigin 10D.',
      defaults: {
        num_islands: 5,
        evaluation_budget: 100000,
        target_generations: 200,
        'migration.enabled': true,
        'migration.topology': 'ring',
        'migration.interval': 20,
        'migration.num_migrants': 5,
      },
    },
    {
      preset: 'GA_Knapsack',
      algorithm: 'ga',
      benchmark: 'knapsack',
      description: 'GA on a 0/1 knapsack.',
      defaults: {
        num_islands: 4,
        evaluation_budget: 50000,
        target_generations: 100,
        'migration.enabled': false,
        'migration.topology': 'star',
        'migration.interval': 10,
        'migration.num_migrants': 2,
        seed: 7,
      },
    },
    {
      preset: 'GA_TSP_Berlin52',
      algorithm: 'ga',
      benchmark: 'tsp',
      description: 'GA on Berlin52.',
      defaults: {
        num_islands: 6,
        evaluation_budget: 100000,
        target_generations: 300,
        'migration.enabled': true,
        'migration.topology': 'fully_connected',
        'migration.interval': 16,
        'migration.num_migrants': 10,
      },
    },
  ],
};

const SETTINGS: RunSettings = {
  num_islands: 5,
  evaluation_budget: 100000,
  target_generations: 300,
  'migration.enabled': true,
  'migration.topology': 'ring',
  'migration.interval': 16,
  'migration.num_migrants': 10,
};

const CLUSTERING: Clustering = {
  lsh: true,
  birch: true,
  denstream: true,
  detail: 1,
  birch_threshold: null,
  denstream_epsilon: null,
  denstream_half_life: null,
  denstream_mu: 10,
  denstream_beta: 0.5,
  lsh_hashes: 6,
  seed: 0,
};

export const makeRun = (id: string, change: Partial<Run> = {}): Run => ({
  run_id: id,
  run_name: `name-${id}`,
  status: 'done',
  stream: true,
  preset: 'GA_TSP_Berlin52',
  run_settings: SETTINGS,
  clustering: CLUSTERING,
  error: null,
  created_at: new Date().toISOString(),
  ...change,
});
