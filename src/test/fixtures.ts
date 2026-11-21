import type { Clustering, GenerationSummary, Presets, Run, RunResult, RunSettings } from '@/types.ts';

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
  started_at: null,
  finished_at: null,
  ...change,
});

// Five generations for one island; null best-so-far values are generations the runner logged without one.
function islandRows(island: number, bestSoFar: number[], mean: number[], diversity: number[]): GenerationSummary[] {
  return bestSoFar.map((value, generation) => ({
    island_id: island,
    generation,
    evaluations_total: (generation + 1) * 10,
    best_fitness: value,
    best_so_far_fitness: value,
    mean_fitness: mean[generation]!,
    std_fitness: 1,
    diversity: diversity[generation]!,
    diversity_metric: 'mean_pairwise_hamming_normalised',
    diversity_sample_size: null,
  }));
}

// A minimising three-island result. Islands 0 and 1 both end on 60: island 1 gets there first (generation 2,
// 30 evaluations), island 0 a generation later. Island 2's mean goes negative, which a log scale cannot show.
export const makeResult = (change: Partial<RunResult> = {}): RunResult => ({
  run: {
    run_id: 'run-1',
    algorithm: 'ga',
    benchmark: 'tsp',
    migration_topology: 'ring',
    islands: [0, 1, 2],
    maximising: false,
    budget_per_island: 50,
    stagnation_generations: 2,
  },
  layout: { method: 'pca', variance_kept_2d: 0.5, variance_kept_3d: 0.6 },
  // Migrants went 10 -> 12 into a better cluster, back 12 -> 10 into a worse one, 13 -> 20 into an equal one, and
  // 11 -> 99 into a cluster that has since faded out of the graph.
  graph: {
    nodes: { id: [10, 11, 12, 13, 20], island: [0, 0, 1, 1, 2], best_fitness: [80, 90, 60, 60, 60] },
    edges: { id: [1, 2, 3] },
    migrations: { id: [1, 2, 3, 4], source: [10, 12, 13, 11], target: [12, 10, 20, 99], count: [4, 2, 3, 1] },
    overlap: 1.5,
  },
  clustering: {
    stages: ['lsh', 'birch'],
    counts: { evaluations: 150, rows_clustered: 150, nodes: 8, faded_nodes: null },
    resolved: { birch_threshold: 0.354, denstream_epsilon: null, denstream_half_life: null, lsh_bucket_width: null },
    diagnostics: {
      lsh: { family: 'minhash', blocks: 10, clusters_after: 10 },
      birch: { threshold: 0.354, threshold_checkpoints: [0.7, 0.5, 0.354], subclusters: 9, clusters_after: 8 },
    },
    elapsed_seconds: 2.5,
  },
  separation: {
    typical_distance: 1,
    pairs: { a: [0, 0, 1], b: [1, 2, 2], mmd2: [0.5, 0.1, 0.2], p: [0.003, 0.3, 0.01] },
    windows: { from_generation: [0, 10], typical_distance: [2, 1] },
    window_pairs: { window: [0, 0, 1, 1], a: [0, 0, 0, 1], b: [1, 2, 1, 2], mmd2: [0.4, 0.2, 0.6, 0.15] },
  },
  migration_routes: [
    { source: 0, destination: 1, migrants: 6 },
    { source: 1, destination: 0, migrants: 2 },
    { source: 1, destination: 2, migrants: 4 },
    { source: 2, destination: 0, migrants: 0 },
  ],
  generation_history: [
    ...islandRows(0, [100, 80, 80, 60, 60], [120, 100, 90, 80, 70], [0.5, 0.4, 0.3, 0.2, 0.1]),
    ...islandRows(1, [100, 90, 60, 60, 60], [130, 110, 95, 85, 75], [0.6, 0.5, 0.4, 0.3, 0.2]),
    ...islandRows(2, [100, 95, 90, 85, 70], [50, 10, -5, -10, -20], [0.7, 0.6, 0.5, 0.4, 0.3]),
  ],
  // Islands 0 and 1 stopped on the stagnation rule; island 2 used its 50 evaluations.
  island_ends: [
    { island_id: 0, termination_reason: 'stagnation', generations_completed: 5, evaluations_total: 50, generations_since_improvement: 1 },
    { island_id: 1, termination_reason: 'stagnation', generations_completed: 5, evaluations_total: 50, generations_since_improvement: 2 },
    { island_id: 2, termination_reason: 'max_evaluations', generations_completed: 5, evaluations_total: 50, generations_since_improvement: 0 },
  ],
  // The islands share an improvement of 40: island 0 earns 22, island 1 13, island 2 5. Migration lifts what the islands
  // reach on their own (20) to 40, credited 15 to route 0 -> 1, 5 to 1 -> 2 and nothing to 1 -> 0.
  explainability: {
    shapley: {
      status: 'ready',
      baseline_fitness: 100,
      observed_best_fitness: 60,
      supported_best_fitness: 60,
      coverage: { evaluations: 150, supported: 120 },
      warnings: [],
      islands: {
        empty_value: 0,
        full_value: 40,
        sampled_orders: null,
        players: [
          { player: 0, value: 22, standard_error: null },
          { player: 1, value: 13, standard_error: null },
          { player: 2, value: 5, standard_error: null },
        ],
        coalitions: [
          { players: [], value: 0 },
          { players: [0], value: 20 },
          { players: [1], value: 10 },
          { players: [2], value: 2 },
          { players: [0, 1], value: 34 },
          { players: [0, 2], value: 26 },
          { players: [1, 2], value: 14 },
          { players: [0, 1, 2], value: 40 },
        ],
        orders: [
          [
            { player: 0, before: 0, after: 20 },
            { player: 1, before: 20, after: 34 },
            { player: 2, before: 34, after: 40 },
          ],
          [
            { player: 2, before: 0, after: 2 },
            { player: 1, before: 2, after: 14 },
            { player: 0, before: 14, after: 40 },
          ],
        ],
      },
      routes: {
        empty_value: 20,
        full_value: 40,
        sampled_orders: null,
        players: [
          { player: [0, 1], value: 15, standard_error: null },
          { player: [1, 2], value: 5, standard_error: null },
          { player: [1, 0], value: 0, standard_error: null },
        ],
        coalitions: [
          { players: [], value: 20 },
          { players: [[0, 1]], value: 35 },
          { players: [[1, 2]], value: 25 },
          { players: [[1, 0]], value: 20 },
          {
            players: [
              [0, 1],
              [1, 2],
            ],
            value: 40,
          },
          {
            players: [
              [0, 1],
              [1, 0],
            ],
            value: 35,
          },
          {
            players: [
              [1, 2],
              [1, 0],
            ],
            value: 25,
          },
          {
            players: [
              [0, 1],
              [1, 2],
              [1, 0],
            ],
            value: 40,
          },
        ],
        orders: [
          [
            { player: [0, 1], before: 20, after: 35 },
            { player: [1, 2], before: 35, after: 40 },
            { player: [1, 0], before: 40, after: 40 },
          ],
        ],
      },
    },
  },
  malformed_rows: 0,
  warnings: [],
  ...change,
});
