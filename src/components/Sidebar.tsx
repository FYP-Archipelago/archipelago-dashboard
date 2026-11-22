import { useEffect, useRef, useState } from 'react';

import { useHealth, useRecentRuns } from '@/api/queries.ts';
import { ago } from '@/format.ts';
import { newRunHref, runHref, runsHref, type Route } from '@/route.ts';
import type { Health } from '@/types.ts';

import Icon from './Icon.tsx';
import Link from './Link.tsx';
import Unavailable from './Unavailable.tsx';

import './sidebar.css';

// A reachable backend with Postgres or Redis down cannot serve runs either, so it counts as unavailable.
function backendState(health: Health | undefined, failing: boolean): { dot: string; label: string } {
  if (failing) return { dot: 'failed', label: 'Unavailable' };
  if (!health) return { dot: 'queued', label: 'Checking status' };
  if (health.ready) return { dot: 'done', label: 'All Systems Go' };
  if (health.status === 'ok') return { dot: 'warning', label: 'Runner disconnected' };
  return { dot: 'failed', label: 'Unavailable' };
}

export default function Sidebar({ route }: { route: Route }) {
  const recent = useRecentRuns();
  const health = useHealth();

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

  // The run list polls more often than /health, so a failed req there indicates backend being down.
  const failing = health.isError || recent.isLoadingError || recent.isRefetchError;
  const state = backendState(health.data, failing);

  return (
    <aside className="sidebar">
      <Link className="brand" href={runsHref}>
        <img src="/favicon.svg" alt="" width="28" height="28" />
        <span>Archipelago</span>
      </Link>
      <Link className="button button-primary new-run-button" href={newRunHref}>
        <Icon name="plus" size={15} stroke={2} />
        New Run
      </Link>
      <div className="sidebar-section-title">
        <span>Recent</span>
        <Link className={`view-all${route.name === 'runs' ? ' view-all-on' : ''}`} href={runsHref}>
          View all
          <Icon name="arrowR" size={12} stroke={2} />
        </Link>
      </div>
      <nav ref={list} className="recent" aria-label="Recent runs">
        {runs?.map((run) => (
          <Link
            key={run.run_id}
            className={`recent-item${route.name === 'run' && route.id === run.run_id ? ' recent-item-active' : ''}`}
            href={runHref(run.run_id)}
            title={run.run_name}
          >
            <span className={`dot ${run.status}`} />
            <span className="recent-run-details">
              <strong>{run.run_name}</strong>
              <small>
                {run.preset} · {ago(run.created_at)}
              </small>
            </span>
          </Link>
        ))}
        {runs?.length === 0 && <p className="recent-note">No runs yet.</p>}
        {!runs && recent.isError && (
          <p className="recent-note">
            <Unavailable />
          </p>
        )}
      </nav>
      <div className="sidebar-footer">
        <div className="backend-line">
          <span className={`dot ${state.dot}`} />
          <span>{state.label}</span>
          {health.data && !failing && <span className="monospace">v{health.data.version}</span>}
        </div>
      </div>
    </aside>
  );
}
