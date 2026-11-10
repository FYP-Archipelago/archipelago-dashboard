import test from 'node:test';
import assert from 'node:assert/strict';
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
  assert.deepEqual(summary.islands, [0, 1, 2]);
  assert.equal(summary.total, 7);
  assert.equal(summary.routes, 3);
  assert.equal(summary.maximum, 4);
  assert.deepEqual(summary.rows[0].cells.map(cell => [cell.count, cell.intensity]), [[0, 0], [4, 1], [0, 0]]);
  assert.deepEqual(summary.totals.map(total => [total.island, total.sent, total.received]), [[0, 4, 3], [1, 2, 4], [2, 1, 0]]);
  assert.deepEqual(summary.totals.map(total => total.sent_percent), [100, 50, 25]);
});

test('migration switched off gives an empty matrix, and older results give null', () => {
  const off = migrationSummary({ run: { islands: [0, 1] }, migration_routes: [] });
  assert.equal(off.total, 0);
  assert.ok(off.rows.every(row => row.cells.every(cell => cell.count === 0 && cell.intensity === 0)));
  assert.equal(migrationSummary({ run: { islands: [0] } }), null);
});

test('malformed routes are errors', () => {
  for (const routes of [[{ source: 0, destination: 1 }], [{ source: 0, destination: '1', migrants: 1 }]]) {
    assert.throws(() => migrationSummary({ run: { islands: [0, 1] }, migration_routes: routes }), /malformed/);
  }
});
