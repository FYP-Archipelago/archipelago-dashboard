import { useMemo } from 'react';

import { NoResult, type ResultQuery } from '@/pages/run-workspace/shared.tsx';
import type { Run, RunResult } from '@/types.ts';

import Hero from './Hero.tsx';
import { overviewData } from './overview.ts';
import RunTimeline from './RunTimeline.tsx';

import './overview.css';

function Overview({ run, result }: { run: Run; result: RunResult }) {
  const data = useMemo(() => overviewData(run, result), [run, result]);
  return (
    <div className="overview">
      <div className="hero-slot">
        <Hero data={data} />
      </div>
      <RunTimeline data={data} />
    </div>
  );
}

export default function OverviewTab({ run, result }: { run: Run; result: ResultQuery }) {
  if (result.data) return <Overview run={run} result={result.data} />;
  return <NoResult run={run} result={result} />;
}
