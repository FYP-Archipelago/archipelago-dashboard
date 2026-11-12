import React from 'react';
import { test, expect } from 'vitest';
import { render, click } from '../test/test-utils.js';
import { result as base, nodeTable, links } from '../test/fixtures/backend.js';
import { graphFromResult } from './graph-model.js';
import { migrationSummary } from './migration-summary.js';

import Page from './MigrationOverview.jsx';
const result = {
  ...base,
  run: { ...base.run, islands: [0, 1, 2, 3] },
  graph: {
    nodes: nodeTable([10, 20, 30, 40]),
    edges: links([], [], [], 'weight'),
    migrations: links([1, 2, 3, 4], [10, 20, 30, 40], [20, 30, 40, 10], 'count'),
    overlap: 1,
  },
  migration_routes: [
    { source: 0, destination: 1, migrants: 5 },
    { source: 1, destination: 2, migrants: 3 },
    { source: 2, destination: 3, migrants: 2 },
    { source: 3, destination: 0, migrants: 1 },
  ],
};
const summary = migrationSummary(result);

test('migration matrix keeps directions, island totals and closed route details accessible', async () => {
  await render(<Page session={{ graph: graphFromResult(result), result }} />);
  const matrix = document.querySelector('.migration-matrix');
  expect(matrix).toBeTruthy();
  expect(matrix.querySelectorAll('tbody tr').length).toBe(4);
  const row = matrix.querySelector('tbody tr');
  expect(row.querySelector('th').textContent).toBe('Island 0');
  expect(row.querySelectorAll('td')[1].textContent).toBe(String(summary.rows[0].cells[1].count));
  expect(matrix.querySelector('thead th').textContent).toMatch(/Source ↓ \/ Destination →/);
  expect(document.querySelector('.migration-metrics dt').textContent).toBe('Arrivals');
  expect(document.querySelector('.migration-metrics dd').textContent).toBe(summary.total.toLocaleString());
  expect(document.querySelector('.migration-details').open).toBe(false);
  await click(document.querySelector('.migration-details summary'));
  expect(document.querySelector('.migration-details').open).toBe(true);
  expect(document.querySelectorAll('.migration-details tbody tr').length).toBe(result.graph.migrations.id.length);
  expect(document.querySelectorAll('.migration-bar-group').length).toBe(4);
});

test('legacy and live graphs retain route details without inventing island totals', async () => {
  await render(<Page session={{ graph: graphFromResult(result), result: null }} />);
  expect(document.querySelector('.migration-matrix')).toBe(null);
  expect(document.body.textContent).toMatch(/Waiting for the final migration summary/);
  expect(document.querySelector('.migration-details').open).toBe(false);
});
