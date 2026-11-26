import { describe, expect, it } from 'vitest';

import { makeResult } from '@/test/fixtures.ts';

import { historyByIsland } from '@/pages/run-workspace/history.ts';

import { convergenceVerdict, describeDiversity, runProgress } from './convergence.ts';

const rows = makeResult().generation_history;

describe('convergence summaries', () => {
  it('groups rows by island in generation order, however the backend sorted them', () => {
    const histories = historyByIsland([...rows].reverse());

    expect(histories.map((h) => h.island)).toEqual([0, 1, 2]);
    expect(histories[0]!.generation).toEqual([0, 1, 2, 3, 4]);
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

describe('convergenceVerdict', () => {
  it('judges how the run ended by the strictest level, so a later levelling off is not called still improving', () => {
    // 99% came with 8% of the run left (under the 10% it needs), 99.9% with 5% left (over the 1% it needs).
    const spedUp = convergenceVerdict([
      { label: '99%', remainingShare: 0.01, after: 0.08 },
      { label: '99.9%', remainingShare: 0.001, after: 0.05 },
    ]);
    expect(spedUp.converged.map((level) => level.label)).toEqual(['99.9%']);
    expect(spedUp.spedUpAfter?.label).toBe('99%');
    expect(spedUp.stillImproving).toBeNull();

    const stillGoing = convergenceVerdict([
      { label: '99%', remainingShare: 0.01, after: 0.2 },
      { label: '99.9%', remainingShare: 0.001, after: 0.005 },
    ]);
    expect(stillGoing.converged.map((level) => level.label)).toEqual(['99%']);
    expect(stillGoing.spedUpAfter).toBeNull();
    expect(stillGoing.stillImproving?.label).toBe('99.9%');
  });
});
