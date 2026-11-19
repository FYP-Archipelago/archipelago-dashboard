import { useEffect, useRef, useState, type ReactNode } from 'react';

import { api } from '@/api.ts';
import Icon from '@/components/Icon.tsx';
import Link from '@/components/Link.tsx';
import Unavailable from '@/components/Unavailable.tsx';
import { navigate, runHref } from '@/route.ts';
import { ago } from '@/runs.ts';
import type { Run, RunStatusName } from '@/types.ts';
import { usePoll } from '@/usePoll.ts';

import './runs.css';

// Cancelling is too brief to be worth a filter of its own.
const STATUS_FILTERS: RunStatusName[] = ['queued', 'running', 'clustering', 'done', 'failed', 'cancelled'];

type Tail = { key: string; runs: Run[]; cursor: string | null; loading: boolean; failed: boolean };

// Clustering stages in pipeline order.
const STAGES = [
  ['lsh', 'LSH'],
  ['birch', 'BIRCH'],
  ['denstream', 'DenStream'],
] as const;

const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });

const matches = (run: Run, q: string) => [run.run_name, run.run_id, run.preset].some((field) => field.toLowerCase().includes(q));

function RunRow({ run }: { run: Run }) {
  // Preset names are <algorithm>_<problem>.
  const cut = run.preset.indexOf('_');
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
          <span className="mono muted">{run.run_id}</span>
        </div>
      </td>
      <td className="ink-2">{run.preset.slice(0, cut)}</td>
      <td className="ink-2">{run.preset.slice(cut + 1)}</td>
      <td className="r">{run.run_settings.num_islands}</td>
      <td className="r">{compact.format(run.run_settings.evaluation_budget)}</td>
      <td>
        <span className="mode">
          <Icon name={run.stream ? 'radio' : 'clock'} size={14} />
          {run.stream ? 'Stream' : 'After Run'}
        </span>
      </td>
      <td>
        <div className="stages">
          {STAGES.map(([key, label]) => (
            <span key={key} className={`stage${run.clustering[key] ? '' : ' off'}`} title={run.clustering[key] ? undefined : 'Not used'}>
              {label}
            </span>
          ))}
        </div>
      </td>
      <td className="ink-2" title={run.created_at}>
        {ago(run.created_at)}
      </td>
      <td className="r muted">
        <Icon name="chevR" size={15} />
      </td>
    </tr>
  );
}

export default function RunsPage() {
  const [status, setStatus] = useState<RunStatusName | 'all'>('all');
  const [q, setQ] = useState('');
  const query = { status: status === 'all' ? undefined : status };
  const key = status;
  const head = usePoll(key, (signal) => api.listRuns(query, signal));
  const [stored, setTail] = useState<Tail | null>(null);
  const tail = stored?.key === key ? stored : null;
  const loadSeq = useRef(0);
  const search = useRef<HTMLInputElement>(null);
  // Ctrl+K (Cmd+K on macOS) jumps to the search bar.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'k' || !(event.ctrlKey || event.metaKey)) return;
      event.preventDefault();
      search.current?.focus();
      search.current?.select();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

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
  else if (!shown.length) placeholder = needle || status !== 'all' ? 'No runs match these filters.' : 'No runs yet.';

  return (
    <div className="page">
      <div className="page-h">
        <h1>Runs</h1>
      </div>
      <div className="filters">
        <label className="search">
          <Icon name="search" size={15} />
          <input
            ref={search}
            className="input"
            placeholder="Search by Name, Run ID, Algorithm or Problem"
            value={q}
            onChange={(event) => setQ(event.target.value)}
          />
          <kbd className="search-kbd">Ctrl+K</kbd>
        </label>
        <div className="seg" role="group" aria-label="Status">
          {(['all', ...STATUS_FILTERS] as const).map((value) => (
            <button key={value} className={status === value ? 'on' : ''} aria-pressed={status === value} onClick={() => setStatus(value)}>
              <span className="status">{value}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="card table-card">
        <table className="table">
          <thead>
            <tr>
              <th className="col-status">Status</th>
              <th>Run</th>
              <th>Algorithm</th>
              <th>Problem</th>
              <th className="r">Islands</th>
              <th className="r">Budget</th>
              <th>Mode</th>
              <th>Clustering Stages</th>
              <th>Created</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {placeholder ? (
              <tr>
                <td colSpan={10} className="table-note">
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
        {cursor ? (
          <button className="btn" disabled={tail?.loading} onClick={loadMore}>
            {tail?.loading ? 'Loading…' : 'Load more'}
          </button>
        ) : (
          !placeholder && <p className="table-end">{loaded.length === 1 ? 'All 1 run loaded' : `All ${loaded.length} runs loaded`}</p>
        )}
      </div>
    </div>
  );
}
