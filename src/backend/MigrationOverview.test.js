import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compile, mount, click } from '../../test-support/dom.js';
import { graphFromResult } from './graph-model.js';
import { migrationSummary } from './migration-summary.js';

const Page = await compile('src/backend/MigrationOverview.jsx');
const result = JSON.parse(readFileSync(new URL('../../public/recorded-runs/run-20260903T230838Z-4891f68f.json', import.meta.url), 'utf8'));
const summary = migrationSummary(result);

test('migration matrix keeps directions, island totals and closed route details accessible', async () => {
  const view = await mount(Page, { session: { graph: graphFromResult(result), result } });
  try {
    const matrix = document.querySelector('.migration-matrix');
    assert.ok(matrix);
    assert.equal(matrix.querySelectorAll('tbody tr').length, 4);
    const row = matrix.querySelector('tbody tr');
    assert.equal(row.querySelector('th').textContent, 'Island 0');
    assert.equal(row.querySelectorAll('td')[1].textContent, String(summary.rows[0].cells[1].count));
    assert.match(matrix.querySelector('thead th').textContent, /Source ↓ \/ Destination →/);
    assert.equal(document.querySelector('.migration-metrics dt').textContent, 'Arrivals');
    assert.equal(document.querySelector('.migration-metrics dd').textContent, summary.total.toLocaleString());
    assert.equal(document.querySelector('.migration-details').open, false);
    await click(document.querySelector('.migration-details summary'));
    assert.equal(document.querySelector('.migration-details').open, true);
    assert.equal(document.querySelectorAll('.migration-details tbody tr').length, result.graph.migrations.id.length);
    assert.equal(document.querySelectorAll('.migration-bar-group').length, 4);
  } finally {
    await view.close();
  }
});

test('legacy and live graphs retain route details without inventing island totals', async () => {
  const view = await mount(Page, { session: { graph: graphFromResult(result), result: null } });
  try {
    assert.equal(document.querySelector('.migration-matrix'), null);
    assert.match(document.body.textContent, /Waiting for the final migration summary/);
    assert.equal(document.querySelector('.migration-details').open, false);
  } finally {
    await view.close();
  }
});
