import { describe, expect, it } from 'vitest';

import { makeResult } from '@/test/fixtures.ts';

import { historyByIsland } from '@/pages/run-workspace/history.ts';

import { convergenceVerdict, describeDiversity } from './convergence.ts';

const rows = makeResult().generation_history;

describe('generation history', () => {
  it('groups rows by island in generation order, however the backend sorted them', () => {
    const histories = historyByIsland([...rows].reverse());

    expect(histories.map((h) => h.island)).toEqual([0, 1, 2]);
    expect(histories[0]!.generation).toEqual([0, 1, 2, 3, 4]);
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
