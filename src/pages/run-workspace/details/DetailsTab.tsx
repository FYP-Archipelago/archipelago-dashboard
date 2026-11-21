import type { ReactNode } from 'react';

import { usePresets } from '@/api/queries.ts';
import Icon from '@/components/Icon.tsx';
import { compactNumber, dateTime, duration, numberFormat, TOPOLOGIES } from '@/format.ts';
import { Sparkline } from '@/pages/run-workspace/charts/LineChart.tsx';
import { NoResult, type ResultQuery } from '@/pages/run-workspace/shared.tsx';
import type { Run, RunResult, StageDiagnostic } from '@/types.ts';

import Budget from './Budget.tsx';

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

// Stage values the pipeline shows elsewhere (settings, flow totals) or that only matter inside the stage.
const SHOWN_ELSEWHERE = new Set([
  'family',
  'threshold',
  'epsilon',
  'half_life',
  'bucket_width',
  'prune_period',
  'time_span',
  'rows_hashed',
  'rows_clustered',
  'input_points',
  'clusters_after',
]);

function stageTag(stage: string, diagnostics: Record<string, StageDiagnostic>): string | null {
  const value = (key: string) => (typeof diagnostics[key] === 'number' ? significant.format(diagnostics[key]) : null);
  if (stage === 'lsh') return typeof diagnostics.family === 'string' ? diagnostics.family : null;
  if (stage === 'birch') return value('threshold') && `θ ${value('threshold')}`;
  if (stage === 'denstream') return value('epsilon') && `ε ${value('epsilon')}`;
  return null;
}

function Stage({ stage, diagnostics }: { stage: string; diagnostics: Record<string, StageDiagnostic> }) {
  const tag = stageTag(stage, diagnostics);
  const out = diagnostics.clusters_after;
  const counts = Object.entries(diagnostics).filter(
    (entry): entry is [string, number] => typeof entry[1] === 'number' && !SHOWN_ELSEWHERE.has(entry[0])
  );
  const trends = Object.entries(diagnostics).filter((entry): entry is [string, number[]] => Array.isArray(entry[1]) && entry[1].length > 1);
  return (
    <div className="flow-stage">
      <h4>
        {STAGE_NAMES[stage] ?? stage.toUpperCase()}
        {tag && <span className="tag">{tag}</span>}
      </h4>
      {typeof out === 'number' && (
        <p className="stage-out">
          <strong>{numberFormat.format(out)}</strong> clusters out
        </p>
      )}
      <dl className="kv">
        {counts.map(([key, value]) => (
          <div key={key}>
            <dt>{humanise(key)}</dt>
            <dd>{Number.isInteger(value) ? numberFormat.format(value) : significant.format(value)}</dd>
          </div>
        ))}
      </dl>
      {trends.map(([key, values]) => (
        <div key={key} className="stage-trend">
          <span className="muted">
            {humanise(key)} · {significant.format(values[0]!)} → {significant.format(values.at(-1)!)}
          </span>
          <Sparkline values={values} color="var(--ink-2)" label={`${humanise(key)} per checkpoint`} />
        </div>
      ))}
    </div>
  );
}

function Pipeline({ result }: { result: RunResult }) {
  const { counts, stages, diagnostics } = result.clustering;
  return (
    <>
      <h2 className="section-title">Clustering pipeline</h2>
      <section className="card flow">
        <div className="flow-inner">
          <div className="flow-end">
            <strong>{compactNumber.format(counts.evaluations)}</strong>
            <span className="muted">evaluations</span>
          </div>
          {stages.map((stage) => (
            <div key={stage} className="flow-step">
              <span className="flow-arrow">
                <Icon name="arrowR" />
              </span>
              <Stage stage={stage} diagnostics={diagnostics[stage] ?? {}} />
            </div>
          ))}
          <div className="flow-step">
            <span className="flow-arrow">
              <Icon name="arrowR" />
            </span>
            <div className="flow-end">
              <strong>{numberFormat.format(counts.nodes)}</strong>
              <span className="muted">search clusters</span>
              {counts.faded_nodes !== null && <span className="muted">{numberFormat.format(counts.faded_nodes)} faded</span>}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

function Quality({ result }: { result: RunResult }) {
  const { layout, graph, clustering, malformed_rows: malformed, warnings } = result;
  const shapley = result.explainability.shapley;
  const clean = malformed === 0 && warnings.length === 0;
  const issues = warnings.length + (malformed ? 1 : 0);
  return (
    <>
      <h2 className="section-title">Layout and data quality</h2>
      <div className="quality-grid">
        <section className="card">
          <div className="card-head">
            <h3>Layout</h3>
            <span className="tag">{layout.method.toUpperCase()}</span>
          </div>
          {(
            [
              ['Variance kept in 2D', layout.variance_kept_2d],
              ['Variance kept in 3D', layout.variance_kept_3d],
            ] as const
          ).map(([label, share]) => (
            <div key={label} className="meter-row">
              <div>
                <span className="ink-2">{label}</span>
                <strong>{(share * 100).toFixed(1)}%</strong>
              </div>
              <div className="meter">
                <i style={{ width: `${share * 100}%` }} />
              </div>
            </div>
          ))}
          <p className="hint">Note that distances in the network are approximate.</p>
        </section>
        <section className="card">
          <div className="card-head">
            <h3>Graph</h3>
          </div>
          <dl className="kv">
            <div>
              <dt>Search clusters</dt>
              <dd>{numberFormat.format(clustering.counts.nodes)}</dd>
            </div>
            <div>
              <dt>Search paths</dt>
              <dd>{numberFormat.format(graph.edges.id.length)}</dd>
            </div>
            <div>
              <dt>Migration links</dt>
              <dd>{numberFormat.format(graph.migrations.id.length)}</dd>
            </div>
            <div title="Mean number of islands that visited each cluster">
              <dt>Islands per cluster</dt>
              <dd>{graph.overlap.toFixed(2)}</dd>
            </div>
          </dl>
        </section>
        <section className="card">
          <div className="card-head">
            <h3>Data quality</h3>
            <span className="pill">
              <span className={`dot ${clean ? 'done' : 'warning'}`} />
              {clean ? 'Clean' : issues === 1 ? '1 issue' : `${issues} issues`}
            </span>
          </div>
          <dl className="kv">
            <div>
              <dt>Rows clustered</dt>
              <dd>{numberFormat.format(clustering.counts.rows_clustered)}</dd>
            </div>
            <div>
              <dt>Malformed rows</dt>
              <dd>{numberFormat.format(malformed)}</dd>
            </div>
            <div>
              <dt>Warnings</dt>
              <dd>{numberFormat.format(warnings.length)}</dd>
            </div>
            <div title={shapley.status === 'unavailable' ? shapley.detail : 'Evaluations whose whole ancestry was logged'}>
              <dt>Ancestry coverage</dt>
              <dd>
                {shapley.status === 'ready' && shapley.coverage.evaluations
                  ? `${((100 * shapley.coverage.supported) / shapley.coverage.evaluations).toFixed(1)}%`
                  : '—'}
              </dd>
            </div>
          </dl>
          {warnings.length > 0 && (
            <ul className="warnings">
              {warnings.map((warning, i) => (
                <li key={i}>{warning}</li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}

export default function DetailsTab({ run, result }: { run: Run; result: ResultQuery }) {
  const presets = usePresets();
  const description = presets.data?.presets.find((preset) => preset.preset === run.preset)?.description;
  return (
    <>
      <Timing run={run} result={result.data} />
      {result.data && <Budget run={run} result={result.data} />}
      <div className="settings-grid">
        <Settings title="Search settings" note={description} rows={searchRows(run)} />
        <Settings title="Clustering settings" rows={clusteringRows(run, result.data)} />
      </div>
      {result.data ? (
        <>
          <Pipeline result={result.data} />
          <Quality result={result.data} />
        </>
      ) : (
        // Settings stand on their own; only a done run's result is worth waiting for here.
        run.status === 'done' && (
          <div className="details-pending">
            <NoResult run={run} result={result} />
          </div>
        )
      )}
    </>
  );
}
