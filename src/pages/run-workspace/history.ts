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
