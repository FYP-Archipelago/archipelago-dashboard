import { describe, expect, it } from 'vitest';

import { makeResult } from '@/test/fixtures.ts';

import { describeTrend, meanOf, pairKey, windowValues } from './divergence.ts';

describe('divergence', () => {
  it('keys a pair the same whichever island comes first', () => {
    expect(pairKey(2, 0)).toBe(pairKey(0, 2));
  });

  it('leaves out pairs a window has no value for instead of counting them as 0', () => {
    const windows = windowValues(makeResult().separation);

    expect([...windows[1]!.entries()]).toEqual([
      ['0-1', 0.6],
      ['1-2', 0.15],
    ]);
    expect(meanOf(windows[1]!)).toBeCloseTo(0.375);
  });

  it('tells of a mid-run peak that the first and last windows alone would hide', () => {
    expect(describeTrend([0.08, 0.7, 0.9, 0.001], [0, 10, 20, 30])).toBe('Peak around gen 20 · closer vs start');
    expect(describeTrend([0.08, 0.9, 0.2], [0, 10, 20])).toBe('Peak around gen 10 · then fell');
    expect(describeTrend([0.08, 0.9, 0.08], [0, 10, 20])).toBe('Peak around gen 10 · then fell');
    expect(describeTrend([0.2, 0.25, 0.3], [0, 10, 20])).toBe('Islands drifted apart');
    expect(describeTrend([0.3, null], [0, 10])).toBeNull();
  });
});
