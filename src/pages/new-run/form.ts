import { adjectives, animals, colors, uniqueNamesGenerator } from 'unique-names-generator';

import type { Clustering, NewRun, OverrideSpec, Preset, Presets, RunSettings } from '@/types.ts';

import { numberFormat } from './shared.ts';

// Clustering stages in pipeline order.
export const STAGES = [
  { key: 'lsh', label: 'LSH', text: 'Hashes genomes into buckets of near-duplicates. Fast first pass.' },
  { key: 'birch', label: 'BIRCH', text: 'Builds compact sub-clusters inside each bucket.' },
  { key: 'denstream', label: 'DenStream', text: 'Tracks density over time and fades stale regions.' },
] as const;

export type Stage = (typeof STAGES)[number]['key'];
export type SettingKey = 'evaluation_budget' | 'target_generations' | 'migration.interval' | 'migration.num_migrants' | 'seed';
export type ScheduleKey = 'migration.interval' | 'migration.num_migrants';
export type AdvancedKey = 'lsh_hashes' | 'birch_threshold' | 'denstream_epsilon' | 'denstream_half_life' | 'denstream_mu' | 'denstream_beta' | 'seed';

export type ClusterForm = Record<Stage, boolean> & { detail: number; text: Record<AdvancedKey, string> };

export type Form = {
  preset: Preset;
  islands: number;
  migration: boolean;
  topology: string;
  text: Record<SettingKey, string>;
  clustering: ClusterForm;
  stream: boolean;
  name: string;
};

export type Patch = (change: Partial<Form>) => void;
export type SetText = (key: SettingKey) => (value: string) => void;

// The runner lays a torus out as rows x columns, the rows being the largest divisor of the island count up to its
// square root. Under 2 rows or 3 columns every island has just two neighbours, a ring, which the runner rejects.
export function torusGrid(islands: number): { rows: number; columns: number; valid: boolean } {
  let rows = 1;
  for (let candidate = 1; candidate * candidate <= islands; candidate++) if (islands % candidate === 0) rows = candidate;
  const columns = islands / rows;
  return { rows, columns, valid: rows >= 2 && columns >= 3 };
}

// The island counts the runner allows that make a torus, e.g. "6, 8 or 9 islands".
export function torusNeeds(overrides: Presets['overrides']): string {
  const spec = overrides.num_islands;
  const [min, max] = spec?.type === 'int' && spec.min !== undefined && spec.max !== undefined ? [spec.min, spec.max] : [6, 6];
  const counts = Array.from({ length: max - min + 1 }, (_, i) => min + i).filter((count) => torusGrid(count).valid);
  if (!counts.length) return 'a grid of at least 2 x 3 islands';
  return `${counts.length > 1 ? `${counts.slice(0, -1).join(', ')} or ` : ''}${counts.at(-1)} islands`;
}

// archipelago's clustering Config allows detail in this range.
export const DETAIL_MIN = 0.5;
export const DETAIL_MAX = 2;

export const NAME_MAX = 100;

export const randomName = () => uniqueNamesGenerator({ dictionaries: [adjectives, colors, animals], separator: '-', length: 3 });

type Rule = { int?: boolean; min?: number; max?: number; above?: number; optional?: boolean };

const AUTO_HINT = 'Blank measures it from the run';

// Advanced clustering settings; `stage` hides a field while its stage is off.
export const ADVANCED: { key: AdvancedKey; label: string; stage: Stage | null; rule: Rule; hint: string }[] = [
  { key: 'lsh_hashes', label: 'LSH hashes', stage: 'lsh', rule: { int: true, min: 1 }, hint: 'More hashes, finer blocks' },
  { key: 'birch_threshold', label: 'BIRCH threshold', stage: 'birch', rule: { above: 0, optional: true }, hint: AUTO_HINT },
  { key: 'denstream_epsilon', label: 'DenStream epsilon', stage: 'denstream', rule: { above: 0, optional: true }, hint: AUTO_HINT },
  { key: 'denstream_half_life', label: 'DenStream half-life (s)', stage: 'denstream', rule: { above: 0, optional: true }, hint: AUTO_HINT },
  { key: 'denstream_mu', label: 'DenStream μ', stage: 'denstream', rule: { above: 0 }, hint: 'Higher prunes more' },
  { key: 'denstream_beta', label: 'DenStream β', stage: 'denstream', rule: { above: 0, max: 1 }, hint: 'Higher prunes more, up to 1' },
  { key: 'seed', label: 'Clustering seed', stage: null, rule: { int: true, min: 0, max: 2 ** 32 - 1 }, hint: 'Same seed, same result' },
];

// archipelago's clustering Config defaults, with every stage on.
export const DEFAULT_CLUSTERING: ClusterForm = {
  lsh: true,
  birch: true,
  denstream: true,
  detail: 1,
  text: {
    lsh_hashes: '6',
    birch_threshold: '',
    denstream_epsilon: '',
    denstream_half_life: '',
    denstream_mu: '10',
    denstream_beta: '0.5',
    seed: '0',
  },
};

function numberError(text: string, rule: Rule): string {
  const value = text.trim();
  if (!value) return rule.optional ? '' : 'Required';

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 'Must be a number';
  if (rule.int && !Number.isInteger(parsed)) return 'Must be a whole number';
  if (rule.min !== undefined && parsed < rule.min) return `At least ${numberFormat.format(rule.min)}`;
  if (rule.max !== undefined && parsed > rule.max) return `At most ${numberFormat.format(rule.max)}`;
  if (rule.above !== undefined && parsed <= rule.above) return `Must be above ${rule.above}`;
  return '';
}

// Python's round(), which the runner uses: halves go to the even neighbour.
const roundHalfEven = (value: number) => (value % 1 === 0.5 ? 2 * Math.round(value / 2) : Math.round(value));

// The per-island population the runner derives (dEA-runner's resolved_population_size): the island's share of the
// budget over (generations + 1), divided again by the 7 offspring per parent that evolution strategies spend, at
// least 4. Some presets' tournaments raise the runner's floor to 7, which only matters for very small budgets.
export function populationOf(form: Form): number | null {
  const budget = Number(form.text.evaluation_budget);
  const generations = Number(form.text.target_generations);
  if (!Number.isInteger(budget) || !Number.isInteger(generations) || budget < 1 || generations < 1) return null;

  const budgetPerIsland = Math.max(1, Math.floor(budget / form.islands));
  const offspring = form.preset.algorithm === 'es' ? 7 : 1;
  return Math.max(4, roundHalfEven(budgetPerIsland / ((generations + 1) * offspring)));
}

const intRule = (spec: OverrideSpec | undefined): Rule =>
  spec?.type === 'int' ? { int: true, min: spec.min, max: spec.max, optional: spec.optional } : { int: true };

export function presetSettings(preset: Preset): Pick<Form, 'preset' | 'islands' | 'migration' | 'topology' | 'text'> {
  const defaults = preset.defaults;
  return {
    preset,
    islands: defaults.num_islands,
    migration: defaults['migration.enabled'],
    topology: defaults['migration.topology'],
    text: {
      evaluation_budget: String(defaults.evaluation_budget),
      target_generations: String(defaults.target_generations),
      'migration.interval': String(defaults['migration.interval']),
      'migration.num_migrants': String(defaults['migration.num_migrants']),
      seed: defaults.seed === undefined ? '' : String(defaults.seed),
    },
  };
}

export function validate(form: Form, overrides: Presets['overrides']): Record<string, string> {
  const errors: Record<string, string> = {};
  const flag = (key: string, message: string) => {
    if (message) errors[key] = message;
  };

  const name = form.name.trim();
  flag('name', !name ? 'Give the run a name.' : name.length > NAME_MAX ? `At most ${NAME_MAX} characters.` : '');

  for (const key of ['evaluation_budget', 'target_generations', 'seed'] as const) flag(key, numberError(form.text[key], intRule(overrides[key])));

  if (form.migration) {
    for (const key of ['migration.interval', 'migration.num_migrants'] as const) flag(key, numberError(form.text[key], intRule(overrides[key])));
    const intervalTooLong = Number(form.text['migration.interval']) > Number(form.text.target_generations);
    if (!errors['migration.interval'] && !errors.target_generations && intervalTooLong)
      flag('migration.interval', 'Must not exceed target generations');
    if (form.topology === 'torus' && !torusGrid(form.islands).valid) flag('topology', `A torus needs ${torusNeeds(overrides)}.`);
    // The runner refuses to send a whole population.
    const population = populationOf(form);
    if (!errors['migration.num_migrants'] && population !== null && Number(form.text['migration.num_migrants']) >= population)
      flag('migration.num_migrants', `Must be below the island's population of ${population}`);
  }

  const clustering = form.clustering;
  if (!STAGES.some((stage) => clustering[stage.key])) flag('stages', 'Enable at least one stage.');
  for (const field of ADVANCED)
    if (!field.stage || clustering[field.stage]) flag(`clustering.${field.key}`, numberError(clustering.text[field.key], field.rule));

  return errors;
}

export function toNewRun(form: Form): NewRun {
  const numberOf = (key: SettingKey) => Number(form.text[key]);
  const defaults = form.preset.defaults;
  const clustering = form.clustering;

  const run_settings: RunSettings = {
    num_islands: form.islands,
    evaluation_budget: numberOf('evaluation_budget'),
    target_generations: numberOf('target_generations'),
    'migration.enabled': form.migration,
    // With migration off the runner ignores these, so send the preset's and drop any half-edited values.
    'migration.topology': form.migration ? form.topology : defaults['migration.topology'],
    'migration.interval': form.migration ? numberOf('migration.interval') : defaults['migration.interval'],
    'migration.num_migrants': form.migration ? numberOf('migration.num_migrants') : defaults['migration.num_migrants'],
  };
  if (form.text.seed.trim()) run_settings.seed = numberOf('seed');

  // Only the enabled stages' settings are sent; a blank distance is sent as null, which means auto.
  const stageSettings: Partial<Clustering> = Object.fromEntries(
    ADVANCED.filter((field) => !field.stage || clustering[field.stage]).map((field) => {
      const text = clustering.text[field.key].trim();
      return [field.key, text ? Number(text) : null];
    })
  );

  return {
    run_name: form.name.trim(),
    preset: form.preset.preset,
    run_settings,
    stream: form.stream,
    clustering: { lsh: clustering.lsh, birch: clustering.birch, denstream: clustering.denstream, detail: clustering.detail, ...stageSettings },
  };
}
