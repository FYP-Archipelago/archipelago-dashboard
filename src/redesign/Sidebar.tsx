import { useEffect, useState } from 'react';
import type { Api, Health } from './api.ts';
import Icon from './Icon.tsx';
import Link from './Link.tsx';
import { newRunHref, runHref, runsHref, type Route } from './route.ts';
import { ago } from './runs.ts';
import Unavailable from './Unavailable.tsx';
import { usePoll } from './usePoll.ts';
import './sidebar.css';

// How many of the newest runs the sidebar lists.
const RECENT_COUNT = 10;

// A reachable backend with Postgres or Redis down cannot serve runs either, so it counts as unavailable.
function backendState(health: Health | undefined, error: string): { dot: string; label: string } {
  if (error) return { dot: 'failed', label: 'Unavailable' };
  if (!health) return { dot: 'queued', label: 'Checking status' };
  if (health.ready) return { dot: 'done', label: 'All Systems Go' };
  if (health.status === 'ok') return { dot: 'warning', label: 'Runner disconnected' };
  return { dot: 'failed', label: 'Unavailable' };
}

export default function Sidebar({ api, route }: { api: Api; route: Route }) {
  const recent = usePoll('recent', (signal) => api.listRuns({}, signal));
  // Checked once per page load; the polled run list is what shows live changes.
  const [health, setHealth] = useState<{ data?: Health; error: string }>({ error: '' });
  useEffect(() => {
    const controller = new AbortController();
    api.health(controller.signal).then(
      (data) => setHealth({ data, error: '' }),
      (reason: Error) => !controller.signal.aborted && setHealth({ error: reason.message })
    );
    return () => controller.abort();
  }, [api]);
  const runs = recent.data?.runs.slice(0, RECENT_COUNT);
  const state = backendState(health.data, health.error);
  return (
    <aside className="sidebar">
      <Link className="brand" href={runsHref}>
        <img src="/favicon.svg" alt="" width="28" height="28" />
        <span>Archipelago</span>
      </Link>
      <Link className="btn btn-primary btn-new" href={newRunHref}>
        <Icon name="plus" size={15} stroke={2} />
        New run
      </Link>
      <div className="side-section-title">
        <span>Recent</span>
        <Link className={`view-all${route.name === 'runs' ? ' on' : ''}`} href={runsHref}>
          View all
          <Icon name="arrowR" size={12} stroke={2} />
        </Link>
      </div>
      <nav className="recent" aria-label="Recent runs">
        {runs?.map((run) => (
          <Link
            key={run.run_id}
            className={`recent-item${route.name === 'run' && route.id === run.run_id ? ' active' : ''}`}
            href={runHref(run.run_id)}
            title={run.run_id}
          >
            <span className={`dot ${run.status}`} />
            <span className="recent-meta">
              <strong className="mono">{run.run_id}</strong>
              <small>
                {run.preset} · {ago(run.created_at)}
              </small>
            </span>
          </Link>
        ))}
        {runs?.length === 0 && <p className="recent-note">No runs yet.</p>}
        {!runs && recent.error && (
          <p className="recent-note">
            <Unavailable />
          </p>
        )}
      </nav>
      <div className="side-foot">
        <div className="backend-line">
          <span className={`dot ${state.dot}`} />
          <span>{state.label}</span>
          {health.data && !health.error && <span className="mono">v{health.data.version}</span>}
        </div>
      </div>
    </aside>
  );
}
