import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { isNotFound } from '@/api/client.ts';
import { useCancelRun, useRun } from '@/api/queries.ts';
import Icon from '@/components/Icon.tsx';
import Link from '@/components/Link.tsx';
import Unavailable from '@/components/Unavailable.tsx';
import { ago, dateTime, duration, TOPOLOGIES } from '@/format.ts';
import { RUN_TABS, runHref, runsHref, type RunTab } from '@/route.ts';
import type { Run } from '@/types.ts';

import './workspace.css';

const TAB_LABELS: Record<RunTab, string> = {
  overview: 'Overview',
  network: 'Network',
  migration: 'Migration',
  convergence: 'Convergence',
  divergence: 'Divergence',
  attribution: 'Attribution',
  details: 'Details',
};

const FAILED_IN: Record<NonNullable<Run['error']>['phase'], string> = {
  runner: 'The run failed in the runner',
  clustering: 'The run failed while clustering',
  internal: 'The run failed inside the backend',
};

const isFinished = (status: Run['status']) => status === 'done' || status === 'failed' || status === 'cancelled';

// Started but unfinished runs count up every second; others show the time they took, or when they were created.
function RunTime({ run }: { run: Run }) {
  const counting = run.started_at !== null && run.finished_at === null && !isFinished(run.status);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!counting) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [counting]);

  if (!run.started_at) return <span title={dateTime(run.created_at)}>Created {ago(run.created_at)}</span>;
  const started = Date.parse(run.started_at);
  if (run.finished_at)
    return (
      <span>
        {dateTime(run.started_at)} · took {duration(Date.parse(run.finished_at) - started)}
      </span>
    );
  return (
    <span>
      Started {dateTime(run.started_at)}
      {counting && ` · running for ${duration(now - started)}`}
    </span>
  );
}

function CopyId({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1400);
    return () => clearTimeout(timer);
  }, [copied]);
  return (
    <button
      className={`copy-id mono${copied ? ' copied' : ''}`}
      title="Copy run ID"
      onClick={() => navigator.clipboard?.writeText(id).then(() => setCopied(true))}
    >
      {id}
      <Icon name={copied ? 'check' : 'copy'} size={13} />
    </button>
  );
}

// Cancelling takes a second click within a few seconds, so a stray click cannot stop a long run.
function CancelButton({ run }: { run: Run }) {
  const cancel = useCancelRun(run.run_id);
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(timer);
  }, [armed]);

  if (run.status === 'cancelling')
    return (
      <button className="btn" disabled>
        <span className="dot cancelling" />
        Cancelling…
      </button>
    );
  const onClick = () => {
    if (!armed) return setArmed(true);
    setArmed(false);
    cancel.mutate();
  };
  return (
    <>
      {cancel.isError && (
        <span className="action-error" title={cancel.error.message}>
          Couldn&apos;t cancel the run
        </span>
      )}
      <button className={`btn${armed ? ' btn-danger' : ''}`} disabled={cancel.isPending} onClick={onClick}>
        <Icon name="x" size={14} stroke={2} />
        {cancel.isPending ? 'Cancelling…' : armed ? 'Confirm cancel' : 'Cancel run'}
      </button>
    </>
  );
}

// The underline slides between tabs; it is placed without a transition the first time.
function Tabs({ id, tab }: { id: string; tab: RunTab }) {
  const nav = useRef<HTMLElement>(null);
  const [underline, setUnderline] = useState<{ left: number; width: number } | null>(null);
  useLayoutEffect(() => {
    const active = nav.current?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!active) return;
    // Measured again on resize, as the tab's width changes once the web font loads.
    const observer = new ResizeObserver(() => setUnderline({ left: active.offsetLeft + 12, width: active.offsetWidth - 24 }));
    observer.observe(active);
    return () => observer.disconnect();
  }, [tab]);
  return (
    <nav ref={nav} className="run-tabs" aria-label="Run views">
      {RUN_TABS.map((name) => (
        <Link
          key={name}
          className={`run-tab${name === tab ? ' active' : ''}`}
          href={runHref(id, name)}
          aria-current={name === tab ? 'page' : undefined}
        >
          {TAB_LABELS[name]}
        </Link>
      ))}
      {underline && <span className="run-tab-underline" style={{ width: underline.width, transform: `translateX(${underline.left}px)` }} />}
    </nav>
  );
}

function Header({ run, tab }: { run: Run; tab: RunTab }) {
  const settings = run.run_settings;
  const topology = settings['migration.topology'];
  const facts = [
    <span key="preset" className="ink-2">
      {run.preset}
    </span>,
    `${settings.num_islands} islands`,
    settings['migration.enabled'] ? `${TOPOLOGIES[topology] ?? topology} migration` : 'No migration',
    <span key="mode" className="run-mode">
      <Icon name={run.stream ? 'radio' : 'clock'} size={14} />
      {run.stream ? 'Stream' : 'After Run'}
    </span>,
    <RunTime key="time" run={run} />,
  ];
  return (
    <header className="run-head">
      <div className="run-head-inner">
        <nav className="crumbs" aria-label="Breadcrumb">
          <Link href={runsHref}>Runs</Link>
          <Icon name="chevR" size={13} />
          <span className="ink-2">{run.run_name}</span>
        </nav>
        <div className="run-title">
          <h1>{run.run_name}</h1>
          <span className="pill">
            <span className={`dot ${run.status}`} />
            <span className="status">{run.status}</span>
          </span>
          <CopyId id={run.run_id} />
          <div className="run-actions">{!isFinished(run.status) && <CancelButton run={run} />}</div>
        </div>
        <div className="run-facts">
          {facts.map((fact, i) => (
            <span key={i} className="run-fact">
              {fact}
            </span>
          ))}
        </div>
        <Tabs id={run.run_id} tab={tab} />
      </div>
    </header>
  );
}

export default function RunWorkspace({ id, tab }: { id: string; tab: RunTab }) {
  const run = useRun(id);

  if (!run.data)
    return (
      <div className="page">
        <div className="page-state">
          {run.isError && isNotFound(run.error) ? (
            <>
              <h1 className="not-found">Run not found</h1>
              <span className="mono">{id}</span>
              <Link className="btn" href={runsHref}>
                Back to runs
              </Link>
            </>
          ) : run.isError ? (
            <Unavailable />
          ) : (
            <span className="page-spinner" aria-label="Loading the run" />
          )}
        </div>
      </div>
    );

  const data = run.data;
  return (
    <>
      <Header run={data} tab={tab} />
      <div className="page run-page">
        {data.status === 'failed' && data.error && (
          <div className="banner critical">
            <Icon name="alert" size={18} />
            <strong>{FAILED_IN[data.error.phase]}</strong>
            <span>{data.error.message}</span>
          </div>
        )}
      </div>
    </>
  );
}
