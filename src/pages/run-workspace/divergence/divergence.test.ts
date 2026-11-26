import { describe, expect, it } from 'vitest';

import { makeResult } from '@/test/fixtures.ts';

import { describeTrend, meanOf, migrationGroups, notableMigrations, pairKey, windowValues } from './divergence.ts';

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

  // Windows of 10 generations start at 0, 10, 20 and 30. The pair's range is 0.6 - 0.1 = 0.5, so a notable move is 0.125.
  it('marks the migrations after which a pair moved by a notable share of its range, one mark per measurement', () => {
    const starts = [0, 10, 20, 30];
    const values = [0.6, 0.55, 0.1, 0.15];

    // Generation 10 compares 0-9 with 10-19 (a small move); 20 compares 10-19 with 20-29 (a big drop); 30 is a small rise.
    const onStarts = migrationGroups([10, 20, 30], starts);
    expect(notableMigrations(onStarts, values)).toEqual({ measured: 3, notable: [{ x: 20, generations: [20], mark: 'down' }] });
    expect(notableMigrations(onStarts, [0.1, 0.15, 0.6, 0.55]).notable).toEqual([{ x: 20, generations: [20], mark: 'up' }]);
    // 12 and 16 sit inside 10-19, so both compare 0-9 with 20-29: one measurement, one mark.
    expect(migrationGroups([12, 16, 16], starts)).toEqual([{ generations: [12, 16], before: 0, after: 2 }]);
    expect(notableMigrations(migrationGroups([12, 16], starts), values).notable).toEqual([{ x: 12, generations: [12, 16], mark: 'down' }]);
    // A migration with no full window before it, or none after it, is not measured.
    expect(migrationGroups([4, 35], starts)).toEqual([]);
  });

  it('marks nothing for a pair that never moves', () => {
    expect(notableMigrations(migrationGroups([10, 20, 30], [0, 10, 20, 30]), [0.3, 0.3, 0.3, 0.3]).notable).toEqual([]);
  });
});
