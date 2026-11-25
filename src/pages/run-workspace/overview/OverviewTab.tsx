import { useMemo } from 'react';

import { NoResult, type ResultQuery } from '@/pages/run-workspace/shared.tsx';
import type { Run, RunResult } from '@/types.ts';

import Contributions from './Contributions.tsx';
import Diversity from './Diversity.tsx';
import Hero from './Hero.tsx';
import Migration from './Migration.tsx';
import NetworkPreview from './NetworkPreview.tsx';
import { overviewData } from './overview.ts';
import RunTimeline from './RunTimeline.tsx';

import './overview.css';

// Hero and timeline full width, then the network beside contributions and migration, then diversity.
function Overview({ run, result }: { run: Run; result: RunResult }) {
  const data = useMemo(() => overviewData(run, result), [run, result]);
  const migrated = run.run_settings['migration.enabled'] && result.migration_routes.some((route) => route.migrants > 0);
  return (
    <div className="overview">
      <div className="hero-slot">
        <Hero data={data} />
      </div>
      <RunTimeline data={data} />
      <div className="overview-grid">
        <div className={`overview-network${migrated ? ' overview-network-tall' : ''}`}>
          <NetworkPreview data={data} />
        </div>
        <Contributions data={data} />
        {migrated && <Migration data={data} />}
      </div>
      <Diversity data={data} />
    </div>
  );
}

export default function OverviewTab({ run, result }: { run: Run; result: ResultQuery }) {
  if (result.data) return <Overview run={run} result={result.data} />;
  return <NoResult run={run} result={result} />;
}
