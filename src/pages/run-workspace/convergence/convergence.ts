import { humanise } from '@/format.ts';
import type { Convergence, ConvergencePoint, GenerationSummary } from '@/types.ts';

// The worker's crossing point for a share of the improvement along the axis, if the run had one.
export function pointAt(convergence: Convergence | null, share: number, axis: 'generation' | 'evaluations'): ConvergencePoint | null {
  return convergence?.levels.find((level) => level.share === share)?.[axis] ?? null;
}

// The runner names its diversity measure in snake case, e.g. mean_pairwise_hamming_normalised.
export function describeDiversity(rows: GenerationSummary[]): string | null {
  const metric = rows.find((row) => row.diversity_metric)?.diversity_metric;
  return metric ? humanise(metric) : null;
}

// A level counts as convergence only if the improvement left came at most this fast against the run's average pace.
// At 0.1, the 99% point counts only if at least 10% of the run came after it.
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
