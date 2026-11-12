import { test, expect } from 'vitest';
import { migrationSummary } from './migration-summary.js';

const result = {
  run: { run_id: 'run-20261102T120000Z-aabbccdd', islands: [0, 1, 2] },
  migration_routes: [
    { source: 0, destination: 1, migrants: 4 },
    { source: 1, destination: 0, migrants: 2 },
    { source: 2, destination: 0, migrants: 1 },
  ],
};

test('builds the island matrix, totals and bar widths from per-route counts', () => {
  const summary = migrationSummary(result);
  expect(summary.islands).toStrictEqual([0, 1, 2]);
  expect(summary.total).toBe(7);
  expect(summary.routes).toBe(3);
  expect(summary.maximum).toBe(4);
  expect(summary.rows[0].cells.map((cell) => [cell.count, cell.intensity])).toStrictEqual([
    [0, 0],
    [4, 1],
    [0, 0],
  ]);
  expect(summary.totals.map((total) => [total.island, total.sent, total.received])).toStrictEqual([
    [0, 4, 3],
    [1, 2, 4],
    [2, 1, 0],
  ]);
  expect(summary.totals.map((total) => total.sent_percent)).toStrictEqual([100, 50, 25]);
});

test('migration switched off gives an empty matrix, and older results give null', () => {
  const off = migrationSummary({ run: { islands: [0, 1] }, migration_routes: [] });
  expect(off.total).toBe(0);
  expect(off.rows.every((row) => row.cells.every((cell) => cell.count === 0 && cell.intensity === 0))).toBeTruthy();
  expect(migrationSummary({ run: { islands: [0] } })).toBe(null);
});
