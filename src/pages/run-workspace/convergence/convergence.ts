import type { GenerationSummary } from '@/types.ts';

// One island's generation history as columns, one entry per logged generation.
export type IslandHistory = {
  island: number;
  generation: number[];
  evaluations: (number | null)[];
  best: (number | null)[];
  bestSoFar: (number | null)[];
  mean: (number | null)[];
  diversity: (number | null)[];
};

export type IslandSummary = {
  island: number;
  finalBest: number | null;
  // The generation (and evaluation count) whose best-so-far was the island's final best: when it last improved.
  reachedGeneration: number | null;
  reachedEvaluations: number | null;
  // Generations logged after that without improving, and that as a share of all the island's generations.
  stagnantGenerations: number | null;
  stagnantShare: number | null;
  finalMean: number | null;
  finalDiversity: number | null;
};

export function historyByIsland(rows: GenerationSummary[]): IslandHistory[] {
  const islands = new Map<number, IslandHistory>();
  for (const row of [...rows].sort((a, b) => a.island_id - b.island_id || a.generation - b.generation)) {
    let history = islands.get(row.island_id);
    if (!history) {
      history = { island: row.island_id, generation: [], evaluations: [], best: [], bestSoFar: [], mean: [], diversity: [] };
      islands.set(row.island_id, history);
    }
    history.generation.push(row.generation);
    history.evaluations.push(row.evaluations_total);
    history.best.push(row.best_fitness);
    history.bestSoFar.push(row.best_so_far_fitness);
    history.mean.push(row.mean_fitness);
    history.diversity.push(row.diversity);
  }
  return [...islands.values()];
}

const lastOf = (values: (number | null)[]) => values.filter((value) => value !== null).at(-1) ?? null;

export function summarise(history: IslandHistory, maximising: boolean): IslandSummary {
  const better = (a: number, b: number) => (maximising ? a > b : a < b);
  let bestAt = -1;
  history.bestSoFar.forEach((value, i) => {
    if (value !== null && (bestAt < 0 || better(value, history.bestSoFar[bestAt]!))) bestAt = i;
  });
  const first = history.generation[0];
  const last = history.generation.at(-1);
  const reached = bestAt < 0 ? null : history.generation[bestAt]!;
  const stagnant = reached === null || last === undefined ? null : last - reached;
  return {
    island: history.island,
    finalBest: bestAt < 0 ? null : history.bestSoFar[bestAt]!,
    reachedGeneration: reached,
    reachedEvaluations: bestAt < 0 ? null : (history.evaluations[bestAt] ?? null),
    stagnantGenerations: stagnant,
    stagnantShare: stagnant === null || first === undefined || last === undefined ? null : stagnant / (last - first + 1),
    finalMean: lastOf(history.mean),
    finalDiversity: lastOf(history.diversity),
  };
}

// The island holding the run's best value. When several islands end on the same value, the one that got there first,
// by evaluations when they were logged, otherwise by generation.
export function runBest(summaries: IslandSummary[], maximising: boolean): IslandSummary | null {
  const finished = summaries.filter((s) => s.finalBest !== null);
  if (!finished.length) return null;
  const values = finished.map((s) => s.finalBest!);
  const best = maximising ? Math.max(...values) : Math.min(...values);
  const reachedAt = (s: IslandSummary) => s.reachedEvaluations ?? s.reachedGeneration ?? Infinity;
  return finished.filter((s) => s.finalBest === best).sort((a, b) => reachedAt(a) - reachedAt(b))[0]!;
}

// The runner names its diversity measure in snake case, e.g. mean_pairwise_hamming_normalised.
export function describeDiversity(rows: GenerationSummary[]): string | null {
  const metric = rows.find((row) => row.diversity_metric)?.diversity_metric;
  if (!metric) return null;
  const words = metric.replaceAll('_', ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}
