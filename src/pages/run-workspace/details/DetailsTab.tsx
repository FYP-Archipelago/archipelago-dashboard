import type { ReactNode } from 'react';

import { usePresets } from '@/api/queries.ts';
import { dateTime, duration, numberFormat, TOPOLOGIES } from '@/format.ts';
import { NoResult, type ResultQuery } from '@/pages/run-workspace/shared.tsx';
import type { Run, RunResult } from '@/types.ts';

import './details.css';

const significant = new Intl.NumberFormat('en', { maximumSignificantDigits: 3 });

const STAGE_NAMES: Record<string, string> = { lsh: 'LSH', birch: 'BIRCH', denstream: 'DenStream' };

// micro_clusters_created -> Micro clusters created
const humanise = (key: string) => key.charAt(0).toUpperCase() + key.slice(1).replaceAll('_', ' ').replaceAll('.', ' ');

type Row = { label: string; value: ReactNode; off?: string };

function Settings({ title, note, rows }: { title: string; note?: string; rows: Row[] }) {
  return (
    <section className="card settings-card">
      <div className="card-head card-heading">
        <h3>{title}</h3>
        {note && <span className="muted">{note}</span>}
      </div>
      <dl className="settings-list">
        {rows.map((row) => (
          <div key={row.label} className={row.off ? 'off' : undefined} title={row.off}>
            <dt>{row.label}</dt>
            <dd>{row.off ? '—' : row.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

// The settings shown by name above; any other setting the runner reported is listed after them.
const KNOWN_SETTINGS = new Set<string>([
  'num_islands',
  'evaluation_budget',
  'target_generations',
  'migration.enabled',
  'migration.topology',
  'migration.interval',
  'migration.num_migrants',
  'seed',
]);

function searchRows(run: Run): Row[] {
  const settings = run.run_settings;
  const migrationOff = settings['migration.enabled'] ? undefined : 'Not used: migration is off';
  const rows: Row[] = [
    { label: 'Preset', value: <span className="mono">{run.preset}</span> },
    { label: 'Islands', value: settings.num_islands },
    { label: 'Evaluation budget', value: numberFormat.format(settings.evaluation_budget) },
    { label: 'Target generations', value: numberFormat.format(settings.target_generations) },
    {
      label: 'Migration topology',
      value: TOPOLOGIES[settings['migration.topology']] ?? settings['migration.topology'],
      off: migrationOff,
    },
    {
      label: 'Migration schedule',
      value: `${settings['migration.num_migrants']} migrants every ${settings['migration.interval']} generations`,
      off: migrationOff,
    },
    { label: 'Runner seed', value: settings.seed ?? 'Random' },
  ];
  // The backend stores every setting the runner reported, so ones the dashboard has no label for still show.
  for (const [key, value] of Object.entries(settings))
    if (!KNOWN_SETTINGS.has(key)) rows.push({ label: humanise(key), value: typeof value === 'boolean' ? (value ? 'On' : 'Off') : String(value) });
  rows.push({ label: 'Updates', value: run.stream ? 'Stream' : 'After Run' });
  return rows;
}

function clusteringRows(run: Run, result: RunResult | undefined): Row[] {
  const config = run.clustering;
  const resolved = result?.clustering.resolved;
  // Once there is a result, its stage list is what actually ran.
  const ran = (stage: 'lsh' | 'birch' | 'denstream') => (result ? result.clustering.stages.includes(stage) : config[stage]);
  const used = (['lsh', 'birch', 'denstream'] as const).filter(ran);
  const notUsed = (stage: 'lsh' | 'birch' | 'denstream') => (ran(stage) ? undefined : `Not used: ${STAGE_NAMES[stage]} was off`);
  // A null distance is picked automatically from the data; the result says which value was used.
  const distance = (value: number | null, picked: number | null | undefined, unit = '') =>
    value !== null ? (
      `${significant.format(value)}${unit}`
    ) : (
      <>
        <span className="muted">Auto</span>
        {picked != null && ` → ${significant.format(picked)}${unit}`}
      </>
    );
  return [
    { label: 'Stages', value: used.length ? used.map((stage) => STAGE_NAMES[stage]).join(' → ') : 'None' },
    { label: 'Detail', value: config.detail.toFixed(1) },
    { label: 'LSH hashes', value: config.lsh_hashes, off: notUsed('lsh') },
    { label: 'BIRCH threshold', value: distance(config.birch_threshold, resolved?.birch_threshold), off: notUsed('birch') },
    { label: 'DenStream epsilon', value: distance(config.denstream_epsilon, resolved?.denstream_epsilon), off: notUsed('denstream') },
    { label: 'DenStream half-life', value: distance(config.denstream_half_life, resolved?.denstream_half_life, ' s'), off: notUsed('denstream') },
    { label: 'DenStream μ / β', value: `${config.denstream_mu} / ${config.denstream_beta}`, off: notUsed('denstream') },
    { label: 'Clustering seed', value: config.seed },
  ];
}

const clusteringDuration = (seconds: number) => (seconds >= 60 ? duration(seconds * 1000) : `${seconds.toFixed(1)} s`);

function Timing({ run, result }: { run: Run; result: RunResult | undefined }) {
  const created = Date.parse(run.created_at);
  const started = run.started_at ? Date.parse(run.started_at) : null;
  const finished = run.finished_at ? Date.parse(run.finished_at) : null;
  const items: [string, string, string?][] = [
    ['Created', dateTime(run.created_at)],
    ['Waited for a runner', started !== null ? duration(started - created) : run.status === 'queued' ? 'Still waiting' : '—'],
    [
      'Elapsed time',
      started !== null && finished !== null ? duration(finished - started) : started !== null ? 'Still running' : '—',
      'Start to finish, including clustering',
    ],
    [
      'Clustering time',
      result ? clusteringDuration(result.clustering.elapsed_seconds) : '—',
      'Time spent clustering, which overlaps the run when it streams',
    ],
  ];
  return (
    <section className="card stat-strip compact">
      {items.map(([label, value, hint]) => (
        <div key={label} title={hint}>
          <span className="muted">{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </section>
  );
}

export default function DetailsTab({ run, result }: { run: Run; result: ResultQuery }) {
  const presets = usePresets();
  const description = presets.data?.presets.find((preset) => preset.preset === run.preset)?.description;
  return (
    <>
      <Timing run={run} result={result.data} />
      <div className="settings-grid">
        <Settings title="Search settings" note={description} rows={searchRows(run)} />
        <Settings title="Clustering settings" rows={clusteringRows(run, result.data)} />
      </div>
      {/* Settings stand on their own while a done run's result loads. */}
      {!result.data && run.status === 'done' && (
        <div className="details-pending">
          <NoResult run={run} result={result} />
        </div>
      )}
    </>
  );
}
