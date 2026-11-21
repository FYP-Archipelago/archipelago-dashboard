import type { useRunResult } from '@/api/queries.ts';
import Icon, { type IconName } from '@/components/Icon.tsx';
import type { Run } from '@/types.ts';

export type ResultQuery = ReturnType<typeof useRunResult>;

// A tab with nothing to show: an icon (or a spinner while something is under way) and the status, centred in the space
// below the tabs. `detail` shows on hover.
export function EmptyState({ icon, title, detail }: { icon: IconName | 'spinner'; title: string; detail?: string }) {
  return (
    <div className="empty-state" title={detail}>
      {icon === 'spinner' ? <span className="page-spinner" /> : <Icon name={icon} size={28} stroke={1.5} />}
      <h3>{title}</h3>
    </div>
  );
}

const WAITING: Partial<Record<Run['status'], string>> = {
  queued: 'Waiting for a runner',
  running: 'The run is in progress',
  clustering: 'Clustering the run',
  cancelling: 'Cancelling the run',
};

// What a tab shows while the run has no result: still loading it, or the reason there is none.
export function NoResult({ run, result }: { run: Run; result: ResultQuery }) {
  if (run.status === 'done')
    return result.isError ? (
      <EmptyState icon="cloudOff" title="Couldn't load the result" detail={result.error.message} />
    ) : (
      <div className="page-state compact" aria-label="Loading the result">
        <span className="page-spinner" />
      </div>
    );
  if (run.status === 'failed' || run.status === 'cancelled')
    return <EmptyState icon="alert" title={run.status === 'failed' ? 'The run failed' : 'The run was cancelled'} />;
  return <EmptyState icon="spinner" title={WAITING[run.status] ?? 'Waiting for the result'} />;
}
