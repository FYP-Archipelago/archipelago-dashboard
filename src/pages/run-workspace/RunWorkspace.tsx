import { useState } from 'react';

import { isNotFound } from '@/api/client.ts';
import { useRun, useRunResult } from '@/api/queries.ts';
import Icon from '@/components/Icon.tsx';
import Link from '@/components/Link.tsx';
import Unavailable from '@/components/Unavailable.tsx';
import { runsHref, type RunTab } from '@/route.ts';
import type { Run } from '@/types.ts';

import AttributionTab from './attribution/AttributionTab.tsx';
import ConvergenceTab from './convergence/ConvergenceTab.tsx';
import DetailsTab from './details/DetailsTab.tsx';
import DivergenceTab from './divergence/DivergenceTab.tsx';
import Header from './Header.tsx';
import MigrationTab from './migration/MigrationTab.tsx';

import './workspace.css';
import './shared.css';

const FAILED_IN: Record<NonNullable<Run['error']>['phase'], string> = {
  runner: 'The run failed in the runner',
  clustering: 'The run failed while clustering',
  internal: 'The run failed inside the backend',
};

export default function RunWorkspace({ id, tab }: { id: string; tab: RunTab }) {
  const run = useRun(id);
  const result = useRunResult(id, run.data?.status === 'done');
  const [showStagnationMarkers, setShowStagnationMarkers] = useState(false);

  if (!run.data)
    return (
      <div className="page">
        <div className="page-state">
          {run.isError && isNotFound(run.error) ? (
            <>
              <h1 className="run-not-found">Run not found</h1>
              <span className="monospace">{id}</span>
              <Link className="button" href={runsHref}>
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
          <div className="run-banner run-banner-critical">
            <Icon name="alert" size={18} />
            <strong>{FAILED_IN[data.error.phase]}</strong>
            <span>{data.error.message}</span>
          </div>
        )}
        {tab === 'convergence' && (
          <ConvergenceTab
            run={data}
            result={result}
            showStagnationMarkers={showStagnationMarkers}
            onToggleStagnationMarkers={() => setShowStagnationMarkers((show) => !show)}
          />
        )}
        {tab === 'migration' && <MigrationTab run={data} result={result} />}
        {tab === 'divergence' && <DivergenceTab run={data} result={result} />}
        {tab === 'attribution' && <AttributionTab run={data} result={result} />}
        {tab === 'details' && <DetailsTab run={data} result={result} />}
      </div>
    </>
  );
}
