import { humanise } from '@/format.ts';
import type { IslandHistory } from '@/pages/run-workspace/history.ts';
import type { GenerationSummary } from '@/types.ts';

// The runner names its diversity measure in snake case, e.g. mean_pairwise_hamming_normalised.
export function describeDiversity(rows: GenerationSummary[]): string | null {
  const metric = rows.find((row) => row.diversity_metric)?.diversity_metric;
  return metric ? humanise(metric) : null;
}

// Where the run as a whole had made all but `remainingShare` of its improvement, from the best starting value to the
// run's best: the first island to get that close, along the given axis. On a log scale the improvement is counted in
// orders of magnitude, so the point sits where the log chart flattens.
export function runProgress(
  histories: IslandHistory[],
  axis: 'generation' | 'evaluations',
  maximising: boolean,
  remainingShare: number,
  log: boolean
): { x: number; island: number; value: number } | null {
  const scale = (value: number) => (log ? Math.log10(value) : value);
  const better = (a: number, b: number) => (maximising ? a > b : a < b);
  const starts = histories.map((history) => history.bestSoFar.find((value) => value !== null)).filter((value) => value != null);
  if (!starts.length) return null;
  const start = starts.reduce((a, b) => (better(a, b) ? a : b));
  const final = histories
    .flatMap((history) => history.bestSoFar)
    .filter((value) => value !== null)
    .reduce((a, b) => (better(a, b) ? a : b));
  const gain = Math.abs(scale(final) - scale(start));
  if (gain === 0) return null;
  const threshold = scale(final) + (maximising ? -gain : gain) * remainingShare;

  let first: { x: number; island: number; value: number } | null = null;
  for (const history of histories) {
    const index = history.bestSoFar.findIndex((value) => value !== null && (maximising ? scale(value) >= threshold : scale(value) <= threshold));
    const x = history[axis][index];
    if (x == null) continue;
    if (!first || x < first.x) first = { x, island: history.island, value: history.bestSoFar[index]! };
  }
  return first;
}

// The share of all islands' generations or evaluations that came after x.
export function shareAfter(histories: IslandHistory[], axis: 'generation' | 'evaluations', x: number): number {
  let after = 0;
  let total = 0;
  for (const history of histories) {
    const xs = (history[axis] as (number | null)[]).filter((value) => value !== null);
    const first = xs[0];
    const last = xs.at(-1);
    if (first === undefined || last === undefined) continue;
    after += Math.max(0, last - Math.max(x, first));
    total += last - first;
  }
  return total ? after / total : 0;
}

// A level counts as convergence only if what improvement was left came at most this fast against the run's average
// pace: at 0.1, the last 1% must have taken at least 10% of the run.
const PLATEAU_PACE = 0.1;

// The ending is judged by the strictest level reached, the one nearest the end: if it counts, the run levelled off
// even if an earlier level did not (`spedUpAfter`); if not, it was still improving.
export function convergenceVerdict<T extends { remainingShare: number; after: number }>(levels: T[]) {
  const counts = (level: T) => level.remainingShare <= PLATEAU_PACE * level.after;
  const strictest = levels.at(-1);
  const levelledOff = strictest !== undefined && counts(strictest);
  return {
    converged: levels.filter(counts),
    spedUpAfter: levelledOff ? (levels.filter((level) => !counts(level)).at(-1) ?? null) : null,
    stillImproving: strictest !== undefined && !levelledOff ? strictest : null,
  };
}
