export type RunStatusName = 'queued' | 'running' | 'clustering' | 'done' | 'failed' | 'cancelling' | 'cancelled';

export type RunSettings = {
  num_islands: number;
  evaluation_budget: number;
  target_generations: number;
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
