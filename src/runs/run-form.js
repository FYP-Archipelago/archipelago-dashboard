export class FormError extends Error {
  constructor(fields) {
    super(Object.values(fields).join(' '));
    this.name = 'FormError';
    this.fields = fields;
  }
}

export const runValueLabel = (value) =>
  String(value)
    .replaceAll('_', ' ')
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase());

export const CLUSTER_FIELDS = {
  detail: { label: 'Clustering detail', min: 0.5, max: 2, default: 1, step: 0.1 },
  birch_threshold: { label: 'BIRCH threshold', positive: true, auto: true, stage: 'birch', step: 'any' },
  denstream_epsilon: { label: 'DenStream epsilon', positive: true, auto: true, stage: 'denstream', step: 'any' },
  denstream_half_life: { label: 'DenStream half-life (seconds)', positive: true, auto: true, stage: 'denstream', step: 'any' },
  denstream_mu: { label: 'DenStream mu', positive: true, default: 10, stage: 'denstream', step: 'any' },
  denstream_beta: { label: 'DenStream beta', positive: true, max: 1, default: 0.5, stage: 'denstream', step: 'any' },
  lsh_hashes: { label: 'LSH hashes', type: 'int', min: 1, default: 6, stage: 'lsh', step: 1 },
  seed: { label: 'Clustering seed', type: 'int', default: 0, step: 1 },
};
export const initialClustering = () => ({
  lsh: true,
  birch: true,
  denstream: true,
  ...Object.fromEntries(Object.entries(CLUSTER_FIELDS).map(([key, rule]) => [key, rule.auto ? null : rule.default])),
});

function parseValue(label, value, rule) {
  if (rule.type === 'bool') {
    if (typeof value !== 'boolean') throw new Error(`${label} must be true or false.`);
    return value;
  }
  if (rule.type === 'choice') {
    if (!rule.choices.includes(value)) throw new Error(`${label} must be one of ${rule.choices.join(', ')}.`);
    return value;
  }
  if ((typeof value !== 'string' && typeof value !== 'number') || String(value).trim() === '') throw new Error(`${label} is required.`);
  const number = Number(value);
  if (!Number.isFinite(number) || (rule.type === 'int' && !Number.isSafeInteger(number)))
    throw new Error(`${label} must be ${rule.type === 'int' ? 'an integer' : 'a finite number'}.`);
  if (rule.positive && number <= 0) throw new Error(`${label} must be greater than 0.`);
  if (rule.min !== undefined && number < rule.min) throw new Error(`${label} must be at least ${rule.min}.`);
  if (rule.max !== undefined && number > rule.max) throw new Error(`${label} must be at most ${rule.max}.`);
  return number;
}

export function buildRunRequest({ catalog, preset, values = {}, clustering, stream = true }) {
  const selected = catalog?.presets?.find((item) => item.preset === preset);
  if (!selected) throw new FormError({ preset: 'Choose a preset from the backend.' });
  const errors = {},
    overrides = {},
    effective = { ...selected.defaults };
  for (const key of Object.keys(values)) {
    const rule = catalog.overrides[key],
      raw = values[key];
    if (!rule) {
      errors[key] = `Unsupported override: ${key}.`;
      continue;
    }
    if (rule.optional && (raw == null || String(raw).trim() === '')) continue;
    try {
      const parsed = parseValue(key, raw, rule);
      effective[key] = parsed;
      if (parsed !== selected.defaults[key]) overrides[key] = parsed;
    } catch (error) {
      errors[key] = error.message;
    }
  }
  if (effective['migration.enabled']) {
    if (effective['migration.topology'] === 'torus' && effective.num_islands !== 6) errors['migration.topology'] = 'A torus needs 6 islands.';
    if (effective['migration.interval'] > effective.target_generations)
      errors['migration.interval'] = 'Migration interval must not exceed target generations.';
  }
  const config = {};
  for (const key of ['lsh', 'birch', 'denstream']) {
    if (typeof clustering?.[key] !== 'boolean') errors[key] = `Choose whether ${key} runs.`;
    config[key] = clustering?.[key];
  }
  if (!config.lsh && !config.birch && !config.denstream) errors.stages = 'Enable at least one clustering stage.';
  for (const key of Object.keys(clustering || {}))
    if (!(key in CLUSTER_FIELDS) && !['lsh', 'birch', 'denstream'].includes(key)) errors[key] = `Unsupported clustering setting: ${key}.`;
  for (const [key, rule] of Object.entries(CLUSTER_FIELDS)) {
    const raw = clustering?.[key] === undefined ? (rule.auto ? null : rule.default) : clustering[key];
    if (rule.auto && (raw == null || (rule.stage && !config[rule.stage] && typeof raw === 'string' && raw.trim() === ''))) {
      config[key] = null;
      continue;
    }
    try {
      config[key] = parseValue(rule.label, raw, rule);
    } catch (error) {
      errors[key] = error.message;
    }
  }
  if (typeof stream !== 'boolean') errors.stream = 'Choose live updates or final result only.';
  if (Object.keys(errors).length) throw new FormError(errors);
  return { preset, overrides, stream, clustering: config };
}
