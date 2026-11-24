import { describe, expect, it } from 'vitest';

import type { IslandHistory } from '@/pages/run-workspace/history.ts';

import { changeText, crossing, improvementOf, laneOf, progressCurve } from './overview.ts';

const island = (id: number, evaluations: number[], bestSoFar: number[]): IslandHistory => ({
  island: id,
  generation: evaluations.map((_, i) => i),
  evaluations,
  best: bestSoFar,
  bestSoFar,
  mean: bestSoFar,
  diversity: bestSoFar.map(() => null),
});

describe('progressCurve', () => {
  it('takes the best any island had reached by each x, as islands run side by side', () => {
    const histories = [island(0, [0, 10, 20], [100, 60, 60]), island(1, [0, 15, 30], [80, 80, 20])];
    const improvement = improvementOf(histories, false)!;
    expect(improvement).toMatchObject({ start: 80, final: 20 });
    const linear = { ...improvement, log: false };
    // + 0 turns the -0 a falling scale gives at the start into 0.
    expect(progressCurve(histories, 'evaluations', linear).map(({ x, share }) => ({ x, share: share + 0 }))).toEqual([
      { x: 0, share: 0 },
      { x: 10, share: 20 / 60 },
      // Island 1 still sits at 80 here, but the run already had 60 from island 0.
      { x: 15, share: 20 / 60 },
      { x: 20, share: 20 / 60 },
      { x: 30, share: 1 },
    ]);
    expect(crossing(progressCurve(histories, 'evaluations', linear), 0.5)).toBe(30);
  });

  it('counts orders of magnitude on a log scale, and works when maximising', () => {
    const minimising = [island(0, [0, 1, 2], [1000, 10, 1])];
    const log = improvementOf(minimising, false)!;
    expect(log.log).toBe(true);
    // 1000 -> 10 is two of the three orders of magnitude, not 99% of the way.
    expect(progressCurve(minimising, 'evaluations', log)[1]!.share).toBeCloseTo(2 / 3);

    const maximising = [island(0, [0, 1, 2], [10, 15, 30])];
    const up = improvementOf(maximising, true)!;
    expect(up).toMatchObject({ start: 10, final: 30, log: false });
    expect(progressCurve(maximising, 'evaluations', up).map((point) => point.share)).toEqual([0, 0.25, 1]);
  });
});

it('laneOf keeps only the steps that improved the island, sized against the whole run', () => {
  const history = island(0, [0, 5, 10, 15], [100, 100, 40, 40]);
  const lane = laneOf(history, 'evaluations', { start: 100, final: 20, log: false })!;
  expect(lane.steps).toEqual([{ x: 10, size: 0.75 }]);
  expect(lane).toMatchObject({ start: 0, end: 15, lastImproved: 10 });
});

it('changeText reads as a ratio only for large changes between positive values', () => {
  expect(changeText(12495.5, 34.244)).toBe('365× lower');
  expect(changeText(146989, 22755)).toBe('85% lower');
  expect(changeText(34015, 35413)).toBe('4.1% higher');
  expect(changeText(-10, -1000)).toBe('9900% lower');
  expect(changeText(-2, 3)).toBe('5 higher');
});
