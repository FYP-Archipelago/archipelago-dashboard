import test from 'node:test';
import assert from 'node:assert/strict';
import { compile, mount, click, button, act, dom } from '../../test-support/dom.js';
import { result as base } from '../../test-support/backend-fixture.js';
const Page = await compile('src/backend/Convergence.jsx');

const sample = (island_id, generation) => ({
  island_id,
  generation,
  best_fitness: 10 - generation - island_id / 10,
  mean_fitness: 20 - generation,
  best_so_far_fitness: 10 - generation - island_id / 10,
  std_fitness: 1,
  evaluations_total: (generation + 1) * 50,
  diversity: 0.5 - generation / 10 + island_id / 100,
  diversity_metric: 'euclidean',
});
const withHistory = (history) => ({ ...base, generation_history: history });
const full = () => [0, 1, 2, 3].flatMap((island) => [0, 1, 2].map((generation) => sample(island, generation)));

test('module history renders one line per island and its generation rows', async () => {
  const view = await mount(Page, { result: withHistory(full()) });
  try {
    assert.match(document.body.textContent, /Fitness history/);
    assert.equal(document.querySelectorAll('polyline').length, 4);
    assert.equal(document.querySelectorAll('tbody tr').length, 12);
    assert.equal(document.querySelector('.history-data').open, false);
  } finally {
    await view.close();
  }
});

test('island, metric and generation controls inspect supplied samples', async () => {
  const history = full();
  const view = await mount(Page, { result: withHistory(history) });
  try {
    await click(button('Island 2'));
    assert.equal(document.querySelectorAll('polyline').length, 1);
    const metric = document.querySelector('[aria-label="Chart metric"]');
    await act(async () => {
      metric.value = 'diversity';
      metric.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    });
    assert.match(document.querySelector('.history-axis-label').textContent, /Diversity/);
    const slider = document.querySelector('[aria-label="Inspect generation"]');
    await act(async () => {
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(slider, '0');
      slider.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
      slider.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    });
    assert.equal(document.querySelector('.history-scrubber output').textContent, '0');
    const expected = history.find((row) => row.island_id === 2 && row.generation === 0).diversity;
    assert.equal(
      document.querySelector('.history-point-value strong').textContent,
      new Intl.NumberFormat('en', { maximumSignificantDigits: 21 }).format(expected)
    );
    await click(button('All islands'));
    assert.equal(document.querySelectorAll('polyline').length, 4);
  } finally {
    await view.close();
  }
});

test('a single island and generation still draws a line and an inspection marker', async () => {
  const view = await mount(Page, { result: withHistory([sample(0, 0)]) });
  try {
    assert.equal(document.querySelectorAll('polyline').length, 1);
    assert.equal(document.querySelector('[aria-label="Inspect generation"]').max, '0');
    assert.ok(document.querySelector('.history-marker'));
  } finally {
    await view.close();
  }
});

test('point inspection and generation rows keep module precision and exact evaluation counts', async () => {
  const history = full();
  const last = history.filter((row) => row.island_id === 0).at(-1);
  last.best_so_far_fitness = 1.49109123456789e-6;
  last.evaluations_total = 123456789;
  const view = await mount(Page, { result: withHistory(history) });
  try {
    assert.equal(document.querySelector('.history-point-value strong').textContent, '0.00000149109123456789');
    const cells = document.querySelectorAll('tbody tr')[2].querySelectorAll('td');
    assert.equal(cells[2].textContent, '123,456,789');
    assert.equal(cells[4].textContent, '0.00000149109123456789');
  } finally {
    await view.close();
  }
});

test('malformed history is reported and a pending result waits for clustering', async () => {
  const view = await mount(Page, { result: withHistory([{ island_id: -1, generation: 0 }]) });
  try {
    assert.match(document.querySelector('[role="alert"]').textContent, /malformed generation history/);
    await view.rerender({ result: null });
    assert.match(document.body.textContent, /available when clustering finishes/);
  } finally {
    await view.close();
  }
});
