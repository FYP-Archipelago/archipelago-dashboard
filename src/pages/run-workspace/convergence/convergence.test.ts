import { describe, expect, it } from 'vitest';

import { makeResult } from '@/test/fixtures.ts';

import { describeDiversity, historyByIsland, runBest, summarise } from './convergence.ts';

const rows = makeResult().generation_history;

describe('convergence summaries', () => {
  it('groups rows by island in generation order, however the backend sorted them', () => {
    const histories = historyByIsland([...rows].reverse());

    expect(histories.map((h) => h.island)).toEqual([0, 1, 2]);
    expect(histories[0]!.generation).toEqual([0, 1, 2, 3, 4]);
  });

  it("dates an island's best to its last improvement, not to the generations that only kept it", () => {
    const island0 = summarise(historyByIsland(rows)[0]!, false);

    expect(island0).toMatchObject({ finalBest: 60, reachedGeneration: 3, reachedEvaluations: 40, stagnantGenerations: 1, stagnantShare: 0.2 });
  });

  it('reads better as higher for a maximising run', () => {
    const rising = rows.filter((row) => row.island_id === 0).map((row, i) => ({ ...row, best_so_far_fitness: [5, 9, 7, 9, 8][i]! }));

    expect(summarise(historyByIsland(rising)[0]!, true)).toMatchObject({ finalBest: 9, reachedGeneration: 1 });
  });

  it('skips generations logged without a value', () => {
    const gappy = rows
      .filter((row) => row.island_id === 0)
      .map((row) => (row.generation === 4 ? { ...row, best_so_far_fitness: null, diversity: null } : row));

    expect(summarise(historyByIsland(gappy)[0]!, false)).toMatchObject({ finalBest: 60, reachedGeneration: 3, finalDiversity: 0.2 });
  });

  it('gives the run best to the island that reached a shared best first', () => {
    const summaries = historyByIsland(rows).map((h) => summarise(h, false));

    expect(runBest(summaries, false)?.island).toBe(1);
    expect(runBest(summaries, true)?.island).toBe(2);
  });

  it("names the runner's diversity measure in words", () => {
    expect(describeDiversity(rows)).toBe('Mean pairwise hamming normalised');
    expect(describeDiversity(rows.map((row) => ({ ...row, diversity_metric: null })))).toBeNull();
  });
});
