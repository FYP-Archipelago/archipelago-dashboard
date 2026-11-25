import { fitness } from '@/format.ts';
import type { RunResult } from '@/types.ts';

type Arrival = {
  key: number;
  from: number;
  to: number;
  fromIsland: number;
  toIsland: number;
  fromBest: number | null;
  toBest: number | null;
  migrants: number;
};

// Each migration link joins the cluster migrants left to the one they arrived in. Rows show the busiest first.
export function arrivalsOf(graph: RunResult['graph']): Arrival[] {
  const index = new Map(graph.nodes.id.map((id, i) => [id, i]));
  return graph.migrations.id
    .flatMap((key, i) => {
      const from = index.get(graph.migrations.source[i]!);
      const to = index.get(graph.migrations.target[i]!);
      if (from === undefined || to === undefined) return [];
      const node = (at: number) => ({ island: graph.nodes.island[at]!, best: graph.nodes.best_fitness[at] ?? null });
      return [
        {
          key,
          from: graph.nodes.id[from]!,
          to: graph.nodes.id[to]!,
          fromIsland: node(from).island,
          toIsland: node(to).island,
          fromBest: node(from).best,
          toBest: node(to).best,
          migrants: graph.migrations.count[i]!,
        },
      ];
    })
    .sort((a, b) => b.migrants - a.migrants);
}

// How the arrival cluster's best compares with the best of the cluster the migrants left.
export function comparison(
  arrival: Arrival,
  maximising: boolean
): { label: string; tone: 'arrival-better' | 'arrival-worse' | 'arrival-same' } | null {
  if (arrival.fromBest === null || arrival.toBest === null) return null;
  const gap = arrival.toBest - arrival.fromBest;
  if (gap === 0) return { label: 'Same', tone: 'arrival-same' };
  const better = maximising ? gap > 0 : gap < 0;
  return { label: `${better ? 'Better' : 'Worse'} by ${fitness(Math.abs(gap))}`, tone: better ? 'arrival-better' : 'arrival-worse' };
}
