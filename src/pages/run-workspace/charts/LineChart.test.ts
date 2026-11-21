import { describe, expect, it } from 'vitest';

import { logTicks, niceTicks } from './LineChart.tsx';

describe('chart ticks', () => {
  it('steps by round values inside the range', () => {
    expect(niceTicks(3, 97, 5)).toEqual([20, 40, 60, 80]);
    expect(niceTicks(0.12, 0.58, 5)).toEqual([0.2, 0.3, 0.4, 0.5]);
  });

  // Log axis ends and ticks are powers of ten, so whole decades are whole numbers.
  it('puts a log axis on whole decades when it spans several, and thins out a very wide one', () => {
    expect(logTicks(-2.5, 3.2)).toEqual([-2, -1, 0, 1, 2, 3]);

    const wide = logTicks(-6, 8);
    expect(wide.length).toBeLessThanOrEqual(7);
    expect(wide.every(Number.isInteger)).toBe(true);
  });

  it('still gives a narrow log axis at least three ticks, all inside it', () => {
    const [lo, hi] = [Math.log10(6300), Math.log10(26000)];

    const ticks = logTicks(lo, hi);

    expect(ticks.length).toBeGreaterThanOrEqual(3);
    expect(ticks.every((t) => t >= lo && t <= hi)).toBe(true);
  });
});
