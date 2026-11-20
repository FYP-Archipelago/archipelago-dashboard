import { useEffect, useRef, useState } from 'react';

import { api } from '@/api.ts';
import { ago } from '@/format.ts';
import { newRunHref, runHref, runsHref, type Route } from '@/route.ts';
import type { Health } from '@/types.ts';
import { usePoll } from '@/usePoll.ts';

import Icon from './Icon.tsx';
import Link from './Link.tsx';
import Unavailable from './Unavailable.tsx';

import './sidebar.css';

// A reachable backend with Postgres or Redis down cannot serve runs either, so it counts as unavailable.
function backendState(health: Health | undefined, error: string): { dot: string; label: string } {
  if (error) return { dot: 'failed', label: 'Unavailable' };
  if (!health) return { dot: 'queued', label: 'Checking status' };
  if (health.ready) return { dot: 'done', label: 'All Systems Go' };
  if (health.status === 'ok') return { dot: 'warning', label: 'Runner disconnected' };
  return { dot: 'failed', label: 'Unavailable' };
}

export default function Sidebar({ route }: { route: Route }) {
  const recent = usePoll('recent', (signal) => api.listRuns({}, signal));
  const health = usePoll('health', (signal) => api.health(signal));

  const list = useRef<HTMLElement>(null);
  const [fit, setFit] = useState<number | null>(null);
  const hasRuns = Boolean(recent.data?.runs.length);

  useEffect(() => {
    const nav = list.current;
    if (!nav || !hasRuns) return;
    const observer = new ResizeObserver(() => {
      const row = nav.querySelector('a');
      if (!row?.offsetHeight) return;
      const gap = parseFloat(getComputedStyle(nav).rowGap) || 0;
      setFit(Math.floor((nav.clientHeight + gap) / (row.offsetHeight + gap)));
    });
    observer.observe(nav);
    return () => observer.disconnect();
  }, [hasRuns]);

  const runs = fit === null ? recent.data?.runs : recent.data?.runs.slice(0, fit);
  const state = backendState(health.data, health.error);

  return (
    <aside className="sidebar">
      <Link className="brand" href={runsHref}>
        <img src="/favicon.svg" alt="" width="28" height="28" />
        <span>Archipelago</span>
      </Link>
      <Link className="btn btn-primary btn-new" href={newRunHref}>
        <Icon name="plus" size={15} stroke={2} />
        New Run
      </Link>
      <div className="side-section-title">
        <span>Recent</span>
        <Link className={`view-all${route.name === 'runs' ? ' on' : ''}`} href={runsHref}>
          View all
          <Icon name="arrowR" size={12} stroke={2} />
        </Link>
      </div>
      <nav ref={list} className="recent" aria-label="Recent runs">
        {runs?.map((run) => (
          <Link
            key={run.run_id}
            className={`recent-item${route.name === 'run' && route.id === run.run_id ? ' active' : ''}`}
            href={runHref(run.run_id)}
            title={run.run_name}
          >
            <span className={`dot ${run.status}`} />
            <span className="recent-meta">
              <strong>{run.run_name}</strong>
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
