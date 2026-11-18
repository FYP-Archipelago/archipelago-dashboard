import { useRef, useState, type ReactNode } from 'react';
import { api, type Preset, type Run, type RunStatusName } from './api.ts';
import Icon from './Icon.tsx';
import Link from './Link.tsx';
import { navigate, runHref } from './route.ts';
import { ago, duration, isActive } from './runs.ts';
import Unavailable from './Unavailable.tsx';
import { usePoll } from './usePoll.ts';
import './runs.css';

// Cancelling is too brief to be worth a filter of its own.
const STATUS_FILTERS: RunStatusName[] = ['queued', 'running', 'clustering', 'done', 'failed', 'cancelled'];

type Tail = { key: string; runs: Run[]; cursor: string | null; loading: boolean; failed: boolean };

const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });

const matches = (run: Run, q: string) => [run.run_name, run.run_id, run.preset].some((field) => field.toLowerCase().includes(q));

function RunRow({ run }: { run: Run }) {
  const elapsed = !isActive(run.status)
    ? duration(run.created_at, run.updated_at)
    : run.status === 'queued'
      ? '—'
      : duration(run.created_at, new Date().toISOString());
  return (
    <tr className="click" onClick={(event) => !(event.target as Element).closest('a') && navigate(runHref(run.run_id))}>
      <td>
        <span className="status-cell" title={run.error ? `${run.error.phase}: ${run.error.message}` : undefined}>
          <span className={`dot ${run.status}`} />
          <span className="status">{run.status}</span>
        </span>
      </td>
      <td>
        <div className="run-cell">
          <Link href={runHref(run.run_id)} title={run.run_name}>
            {run.run_name}
          </Link>
          <span className="muted">
            <span className="mono">{run.run_id}</span> · {run.preset}
          </span>
        </div>
      </td>
      <td className="r">{run.run_settings.num_islands}</td>
      <td className="r">{compact.format(run.run_settings.evaluation_budget)}</td>
      <td className="ink-2">{run.stream ? 'Yes' : 'No'}</td>
      <td className="ink-2" title={run.created_at}>
        {ago(run.created_at)}
      </td>
      <td className="r ink-2">{elapsed}</td>
      <td className="r muted">
        <Icon name="chevR" size={15} />
      </td>
    </tr>
  );
}

export default function RunsPage({ presets }: { presets: Preset[] }) {
  const [status, setStatus] = useState<RunStatusName | 'all'>('all');
  const [preset, setPreset] = useState('all');
  const [q, setQ] = useState('');
  const query = { status: status === 'all' ? undefined : status, preset: preset === 'all' ? undefined : preset };
  const key = `${status}:${preset}`;
  const head = usePoll(key, (signal) => api.listRuns(query, signal));
  const [stored, setTail] = useState<Tail | null>(null);
  const tail = stored?.key === key ? stored : null;
  const loadSeq = useRef(0);

  const headIds = new Set(head.data?.runs.map((run) => run.run_id));
  const loaded = [...(head.data?.runs ?? []), ...(tail?.runs.filter((run) => !headIds.has(run.run_id)) ?? [])];
  const cursor = tail ? tail.cursor : (head.data?.next_cursor ?? null);
  const needle = q.trim().toLowerCase();
  const shown = needle ? loaded.filter((run) => matches(run, needle)) : loaded;

  const loadMore = async () => {
    if (!cursor) return;
    const seq = ++loadSeq.current;
    const before = tail?.runs ?? [];
    setTail({ key, runs: before, cursor, loading: true, failed: false });
    try {
      const page = await api.listRuns({ ...query, cursor });
      if (seq === loadSeq.current) setTail({ key, runs: [...before, ...page.runs], cursor: page.next_cursor, loading: false, failed: false });
    } catch {
      if (seq === loadSeq.current) setTail({ key, runs: before, cursor, loading: false, failed: true });
    }
  };

  let placeholder: ReactNode = null;
  if (!head.data) placeholder = head.error ? <Unavailable /> : 'Loading runs…';
  else if (!shown.length) placeholder = needle || status !== 'all' || preset !== 'all' ? 'No runs match these filters.' : 'No runs yet.';

  return (
    <div className="page">
      <div className="page-h">
        <h1>Runs</h1>
      </div>
      <div className="filters">
        <label className="search">
          <Icon name="search" size={15} />
          <input className="input" placeholder="Search by name, run ID or preset" value={q} onChange={(event) => setQ(event.target.value)} />
        </label>
        <div className="seg" role="group" aria-label="Status">
          {(['all', ...STATUS_FILTERS] as const).map((value) => (
            <button key={value} className={status === value ? 'on' : ''} aria-pressed={status === value} onClick={() => setStatus(value)}>
              <span className="status">{value}</span>
            </button>
          ))}
        </div>
        <select className="select" aria-label="Preset" value={preset} onChange={(event) => setPreset(event.target.value)}>
          <option value="all">All presets</option>
          {presets.map(({ preset: id }) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>
      </div>
      <div className="card table-card">
        <table className="table">
          <thead>
            <tr>
              <th className="col-status">Status</th>
              <th>Run</th>
              <th className="r">Islands</th>
              <th className="r">Budget</th>
              <th>Stream</th>
              <th>Created</th>
              <th className="r">Duration</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {placeholder ? (
              <tr>
                <td colSpan={8} className="table-note">
                  {placeholder}
                </td>
              </tr>
            ) : (
              shown.map((run) => <RunRow key={run.run_id} run={run} />)
            )}
          </tbody>
        </table>
      </div>
      <div className="table-foot">
        {tail?.failed && <Unavailable />}
        {cursor && (
          <button className="btn" disabled={tail?.loading} onClick={loadMore}>
            {tail?.loading ? 'Loading…' : 'Load more'}
          </button>
        )}
      </div>
    </div>
  );
}
