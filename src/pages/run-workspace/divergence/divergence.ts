import type { Separation } from '@/types.ts';

// Pairs are unordered, so a key puts the lower island first.
export const pairKey = (a: number, b: number) => `${Math.min(a, b)}-${Math.max(a, b)}`;

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
type PairMigration = { x: number; mark: 'up' | 'down' };

// The migrations (every `interval` generations) after which a pair's divergence jumped: its value in the last window
// wholly before the migration against the first window starting at or after it. A window straddling a migration
// mixes before and after, so it is skipped. `values` holds the pair's value per window, in the order of `starts`.
export function notableMigrations(interval: number, lastGeneration: number, starts: number[], values: (number | null)[]): PairMigration[] {
  const present = values.filter((value) => value !== null);
  const range = present.length ? Math.max(...present) - Math.min(...present) : 0;
  if (!(interval >= 1) || range <= 0) return [];
  const guides: PairMigration[] = [];
  let afterIndex = 0;
  for (let generation = interval; generation <= lastGeneration; generation += interval) {
    while (afterIndex < starts.length && starts[afterIndex]! < generation) afterIndex++;
    if (afterIndex === starts.length) break;
    const beforeIndex = afterIndex - (starts[afterIndex] === generation ? 1 : 2);
    const before = values[beforeIndex] ?? null;
    const after = values[afterIndex] ?? null;
    if (before === null || after === null || Math.abs(after - before) < NOTABLE_SHIFT * range) continue;
    guides.push({ x: generation, mark: after < before ? 'down' : 'up' });
  }
  return guides;
}
