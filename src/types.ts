export type RunStatusName = 'queued' | 'running' | 'clustering' | 'done' | 'failed' | 'cancelling' | 'cancelled';

export type RunSettings = {
  num_islands: number;
  evaluation_budget: number;
  target_generations: number;
  'termination.stagnation_generations'?: number;
  'migration.enabled': boolean;
  'migration.topology': string;
  'migration.interval': number;
  'migration.num_migrants': number;
  seed?: number;
};

// Mirrors archipelago's clustering Config. A null distance means auto.
export type Clustering = {
  lsh: boolean;
  birch: boolean;
  denstream: boolean;
  detail: number;
  birch_threshold: number | null;
  denstream_epsilon: number | null;
  denstream_half_life: number | null;
  denstream_mu: number;
  denstream_beta: number;
  lsh_hashes: number;
  seed: number;
};

export type Run = {
  run_id: string;
  run_name: string;
  status: RunStatusName;
  stream: boolean;
  preset: string;
  run_settings: RunSettings;
  clustering: Clustering;
  error: { phase: 'runner' | 'clustering' | 'internal'; message: string } | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
};

export type NewRun = {
  run_name: string;
  preset: string;
  run_settings: RunSettings;
  stream: boolean;
  clustering: Partial<Clustering>;
};

export type RunPage = { runs: Run[]; next_cursor: string | null };

export type OverrideSpec = { type: 'int'; min?: number; max?: number; optional?: boolean } | { type: 'bool' } | { type: 'choice'; choices: string[] };

export type Preset = { preset: string; algorithm: string; benchmark: string; description: string; defaults: RunSettings };

export type Presets = { overrides: Partial<Record<keyof RunSettings, OverrideSpec>>; presets: Preset[] };

export type Health = { status: 'ok' | 'unavailable'; version: string; ready: boolean };

// One island's generation_end statistics as the runner logged them; archipelago passes them through unchanged.
export type GenerationSummary = {
  island_id: number;
  generation: number;
  evaluations_total: number | null;
  best_fitness: number | null;
  best_so_far_fitness: number | null;
  mean_fitness: number | null;
  std_fitness: number | null;
  diversity: number | null;
  // The runner's diversity definition, which depends on the genome representation.
  diversity_metric: string | null;
  diversity_sample_size: number | null;
};

export type StageDiagnostic = number | string | boolean | number[] | null;

// A Shapley player: an island, or a [source, destination] migration route.
export type Player = number | [number, number];

// Players' values add up to full_value - empty_value: the improvement the players are needed for. A coalition's value
// is the best improvement reachable through lineages that stay inside it.
export type ShapleyGame = {
  empty_value: number;
  full_value: number;
  // Null when every player order was used (exact); otherwise how many orders were sampled.
  sampled_orders: number | null;
  // Highest value first. standard_error is null for exact games.
  players: { player: Player; value: number; standard_error: number | null }[];
  // Every coalition when exact; empty when sampled.
  coalitions: { players: Player[]; value: number }[];
  // A few example orders, each the steps of adding one player at a time.
  orders: { player: Player; before: number; after: number }[][];
};

export type ShapleyAttribution = {
  status: 'ready';
  // Best fitness among the founders, the observed best, and the best whose whole ancestry was logged.
  baseline_fitness: number;
  observed_best_fitness: number;
  supported_best_fitness: number;
  coverage: { evaluations: number; supported: number };
  warnings: string[];
  islands: ShapleyGame;
  routes: ShapleyGame;
};

// How far apart islands' populations sit in genome space, as MMD² between them (0 = the same).
export type Separation = {
  // The run's typical distance between two genomes, the scale the whole-run values are measured at.
  typical_distance: number | null;
  // Each island pair over the whole run; p is a generation-swap test, small meaning a real difference.
  pairs: { a: number[]; b: number[]; mmd2: number[]; p: number[] };
  // Windows of generations, each measured at its own typical distance.
  windows: { from_generation: number[]; typical_distance: number[] };
  // One entry per window and pair with both islands present; window indexes into windows.
  window_pairs: { window: number[]; a: number[]; b: number[]; mmd2: number[] };
};

// The search clusters as columns: cluster i is position i in each list. x and y place a cluster on the layout's
// ground plane and z is the layout's third axis.
export type GraphNodes = {
  id: number[];
  island: number[];
  x: number[];
  y: number[];
  z: number[];
  // Evaluations that landed in the cluster, and how many distinct genomes they were.
  visits: number[];
  members: number[];
  mean_fitness: (number | null)[];
  best_fitness: (number | null)[];
  fitness_percentile: number[];
  // The cluster's mean evaluation index as a share of its island's budget.
  progress: number[];
  first_eval: number[];
  last_eval: number[];
  in_degree: number[];
  out_degree: number[];
  islands_sharing: number[];
  island_best: boolean[];
  overall_best: boolean[];
  migration_endpoint: boolean[];
  genome_hash: string[];
  // DenStream's decaying weight; null without DenStream.
  weight: (number | null)[] | null;
};

// Parent -> child steps within an island; weight is how many times the step was taken.
export type GraphEdges = { id: number[]; source: number[]; target: number[]; weight: number[] };

// Migrants that went from one cluster (source id) to another (target id), and how many.
export type GraphMigrations = { id: number[]; source: number[]; target: number[]; count: number[] };

export type Graph = {
  nodes: GraphNodes;
  edges: GraphEdges;
  migrations: GraphMigrations;
  // Mean number of islands per occupied cluster.
  overlap: number;
};

type Columns<T extends string> = { id: number[] } & Record<T, unknown[]>;

// What changed since the previous streamed update, applied in field order; removed nodes take their edges and
// migrations with them before new ones are added.
export type GraphDelta = {
  new_nodes: GraphNodes;
  updated_nodes: Columns<
    | 'x'
    | 'y'
    | 'z'
    | 'visits'
    | 'members'
    | 'mean_fitness'
    | 'best_fitness'
    | 'progress'
    | 'first_eval'
    | 'last_eval'
    | 'in_degree'
    | 'out_degree'
    | 'islands_sharing'
    | 'migration_endpoint'
  >;
  percentiles: Columns<'fitness_percentile'>;
  weights: Columns<'weight'> | null;
  removed_nodes: number[];
  // Every node's position, sent when the layout was refitted.
  positions: Columns<'x' | 'y' | 'z'> | null;
  new_edges: GraphEdges;
  edge_updates: Columns<'weight'>;
  new_migrations: GraphMigrations;
  migration_updates: Columns<'count'>;
  island_best: number[];
  overall_best: number | null;
  overlap: number;
};

// One streamed update of a live run.
export type RunUpdate = { status: 'warming_up' | 'live'; graph: GraphDelta };

// archipelago's Result, trimmed to the parts the run page reads so far.
export type RunResult = {
  run: {
    run_id: string;
    algorithm: string;
    benchmark: string;
    migration_topology: string | null;
    islands: number[];
    maximising: boolean;
    // From the runner's run_start; null for logs that lack them. 0 stagnation generations means the rule was off.
    budget_per_island: number | null;
    stagnation_generations: number | null;
  };
  layout: { method: 'pca' | 'mds' | 'none'; variance_kept_2d: number; variance_kept_3d: number };
  graph: Graph;
  separation: Separation;
  migration_routes: { source: number; destination: number; migrants: number }[];
  clustering: {
    stages: string[];
    counts: { evaluations: number; rows_clustered: number; nodes: number; faded_nodes: number | null };
    resolved: {
      birch_threshold: number | null;
      denstream_epsilon: number | null;
      denstream_half_life: number | null;
      lsh_bucket_width: number | null;
    };
    // Keyed by stage; each stage reports its own set of values, which also differs between batch and streamed runs.
    diagnostics: Record<string, Record<string, StageDiagnostic>>;
    elapsed_seconds: number;
  };
  // Sorted by island, then generation. Empty when the logs had no generation summaries.
  generation_history: GenerationSummary[];
  explainability: {
    shapley: ShapleyAttribution | { status: 'unavailable'; detail: string };
  };
  malformed_rows: number;
  warnings: string[];
  // One per island that logged island_end, sorted by island; an island that crashed has none.
  island_ends: IslandEnd[];
};

// The runner's TerminationReason values, which archipelago passes through as they are.
export type TerminationReason = 'stagnation' | 'max_evaluations' | 'max_generations' | 'target_fitness_reached' | 'time_limit' | 'error' | 'aborted';

// Why and when an island stopped, from the runner's island_end event.
export type IslandEnd = {
  island_id: number;
  termination_reason: TerminationReason;
  generations_completed: number;
  evaluations_total: number;
  generations_since_improvement: number | null;
};
