import { describe, expect, it } from 'vitest';

import { makeResult } from '@/test/fixtures.ts';

import { describeDiversity, historyByIsland, runBest, runProgress, summarise } from './convergence.ts';

const rows = makeResult().generation_history;

describe('convergence summaries', () => {
  it('groups rows by island in generation order, however the backend sorted them', () => {
    const histories = historyByIsland([...rows].reverse());

    expect(histories.map((h) => h.island)).toEqual([0, 1, 2]);
    expect(histories[0]!.generation).toEqual([0, 1, 2, 3, 4]);
  });

  it("dates an island's best to its last improvement, not to the generations that only kept it", () => {
    const island0 = summarise(historyByIsland(rows)[0]!, false);

    expect(island0).toMatchObject({ finalBest: 60, reachedGeneration: 3, reachedEvaluations: 40 });
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

  it("dates the run's progress to the first island that got close enough to the run's best", () => {
    const histories = historyByIsland(rows);

    // From 100 to 60: within 1% of that 40 is at most 60.4, which island 1 reaches at generation 2 and island 0 at 3.
    expect(runProgress(histories, 'generation', false, 0.01, false)).toEqual({ x: 2, island: 1, value: 60 });
    expect(runProgress(histories, 'evaluations', false, 0.01, false)).toEqual({ x: 30, island: 1, value: 60 });
  });

  it('counts progress in orders of magnitude on a log scale, so it matches where the log chart flattens', () => {
    const falling = rows.filter((row) => row.island_id === 0).map((row, i) => ({ ...row, best_so_far_fitness: [1000, 10, 1, 0.1, 0.1][i]! }));
    const histories = historyByIsland(falling);

    // Linear: 10 is already 99% of the way from 1000 to 0.1. Log: that is only 2 of the 4 decades.
    expect(runProgress(histories, 'generation', false, 0.01, false)?.x).toBe(1);
    expect(runProgress(histories, 'generation', false, 0.01, true)?.x).toBe(3);
  });

  it("names the runner's diversity measure in words", () => {
    expect(describeDiversity(rows)).toBe('Mean pairwise hamming normalised');
    expect(describeDiversity(rows.map((row) => ({ ...row, diversity_metric: null })))).toBeNull();
  });
});
