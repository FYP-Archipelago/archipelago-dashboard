import { maxOf, minOf } from '@/math.ts';
import type { Separation } from '@/types.ts';

// Pairs are unordered, so a key puts the lower island first.
export const pairKey = (a: number, b: number) => `${Math.min(a, b)}-${Math.max(a, b)}`;

// The generation-swap test's usual cut-off: below it, the gap is unlikely to come from chance.
export const REAL_DIFFERENCE = 0.05;

export type Pair = { a: number; b: number; key: string; value: number; p: number };

export const wholeRunPairs = (separation: Separation): Pair[] =>
  separation.pairs.a.map((a, i) => {
    const b = separation.pairs.b[i]!;
    return { a, b, key: pairKey(a, b), value: separation.pairs.mmd2[i]!, p: separation.pairs.p[i]! };
  });

// Each window's values by pair. A window only has pairs whose islands both logged generations in it.
export function windowValues(separation: Separation): Map<string, number>[] {
  const windows = separation.windows.from_generation.map(() => new Map<string, number>());
  const { window, a, b, mmd2 } = separation.window_pairs;
  window.forEach((index, i) => windows[index]?.set(pairKey(a[i]!, b[i]!), mmd2[i]!));
  return windows;
}

export const meanOf = (values: Map<string, number>) => (values.size ? [...values.values()].reduce((sum, v) => sum + v, 0) / values.size : null);

// A one-line story of the mean divergence across windows. Endpoints alone hide a mid-run peak, which is common:
// islands spread out while exploring, then meet again on the same optimum.
export function describeTrend(means: (number | null)[], starts: number[]): string | null {
  const points = means.flatMap((mean, i) => (mean === null ? [] : [{ mean, start: starts[i]! }]));
  if (points.length < 2) return null;
  const first = points[0]!.mean;
  const last = points.at(-1)!.mean;
  const peak = points.reduce((best, point) => (point.mean > best.mean ? point : best));
  if (peak.mean > 1.5 * Math.max(first, last)) return `Peak around gen ${peak.start} · ${last < first ? 'closer vs start' : 'then fell'}`;
  return last < first ? 'Islands drew together' : 'Islands drifted apart';
}

// How far a pair's divergence must move across a migration, as a share of its whole range over the run, for the
// migration to be marked on the chart. Lower marks more migrations.
const NOTABLE_SHIFT = 0.25;

// Migrations are judged by the last window wholly before them against the first window starting at or after them.
// Migrations between the same two windows cannot be told apart, so they form one group.
// A window straddling a migration mixes before and after, so it is skipped, and a migration without both windows is left out.
export type MigrationGroup = { generations: number[]; before: number; after: number };

export function migrationGroups(generations: number[], starts: number[]): MigrationGroup[] {
  const groups = new Map<string, MigrationGroup>();
  for (const generation of [...new Set(generations)].sort((a, b) => a - b)) {
    const after = starts.findIndex((start) => start >= generation);
    const before = after - (starts[after] === generation ? 1 : 2);
    if (after < 0 || before < 0) continue;
    const group = groups.get(`${before}-${after}`) ?? { generations: [], before, after };
    group.generations.push(generation);
    groups.set(`${before}-${after}`, group);
  }
  return [...groups.values()];
}

type PairMigration = { x: number; generations: number[]; mark: 'up' | 'down' };

// How many migrations the series can be judged across (measured), and the groups after which it jumped.
// Each jump is placed at its group's first migration, and `values` holds the series' value per window.
export function notableMigrations(groups: MigrationGroup[], values: (number | null)[]): { measured: number; notable: PairMigration[] } {
  const present = values.filter((value) => value !== null);
  const range = present.length ? maxOf(present) - minOf(present) : 0;
  const measured = groups.filter((group) => values[group.before] != null && values[group.after] != null);
  const notable = measured.flatMap((group) => {
    const [before, after] = [values[group.before]!, values[group.after]!];
    if (range <= 0 || Math.abs(after - before) < NOTABLE_SHIFT * range) return [];
    return [{ x: group.generations[0]!, generations: group.generations, mark: after < before ? ('down' as const) : ('up' as const) }];
  });
  return { measured: measured.reduce((sum, group) => sum + group.generations.length, 0), notable };
}
