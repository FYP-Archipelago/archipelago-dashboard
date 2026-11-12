import React from 'react';
import { test, expect } from 'vitest';
import { fireEvent } from '@testing-library/react';
import { render, click, button } from '../test/test-utils.js';
import { result as base } from '../test/fixtures/backend.js';
import Page from './Convergence.jsx';

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
  await render(<Page result={withHistory(full())} />);
  expect(document.body.textContent).toMatch(/Fitness history/);
  expect(document.querySelectorAll('polyline').length).toBe(4);
  expect(document.querySelectorAll('tbody tr').length).toBe(12);
  expect(document.querySelector('.history-data').open).toBe(false);
});

test('island, metric and generation controls inspect supplied samples', async () => {
  const history = full();
  await render(<Page result={withHistory(history)} />);
  await click(button('Island 2'));
  expect(document.querySelectorAll('polyline').length).toBe(1);
  const metric = document.querySelector('[aria-label="Chart metric"]');
  fireEvent.change(metric, { target: { value: 'diversity' } });
  expect(document.querySelector('.history-axis-label').textContent).toMatch(/Diversity/);
  const slider = document.querySelector('[aria-label="Inspect generation"]');
  fireEvent.input(slider, { target: { value: '0' } });
  expect(document.querySelector('.history-scrubber output').textContent).toBe('0');
  const expected = history.find((row) => row.island_id === 2 && row.generation === 0).diversity;
  expect(document.querySelector('.history-point-value strong').textContent).toBe(
    new Intl.NumberFormat('en', { maximumSignificantDigits: 21 }).format(expected)
  );
  await click(button('All islands'));
  expect(document.querySelectorAll('polyline').length).toBe(4);
});

test('a single island and generation still draws a line and an inspection marker', async () => {
  await render(<Page result={withHistory([sample(0, 0)])} />);
  expect(document.querySelectorAll('polyline').length).toBe(1);
  expect(document.querySelector('[aria-label="Inspect generation"]').max).toBe('0');
  expect(document.querySelector('.history-marker')).toBeTruthy();
});

test('point inspection and generation rows keep module precision and exact evaluation counts', async () => {
  const history = full();
  const last = history.filter((row) => row.island_id === 0).at(-1);
  last.best_so_far_fitness = 1.49109123456789e-6;
  last.evaluations_total = 123456789;
  await render(<Page result={withHistory(history)} />);
  expect(document.querySelector('.history-point-value strong').textContent).toBe('0.00000149109123456789');
  const cells = document.querySelectorAll('tbody tr')[2].querySelectorAll('td');
  expect(cells[2].textContent).toBe('123,456,789');
  expect(cells[4].textContent).toBe('0.00000149109123456789');
});

test('malformed history is reported and a pending result waits for clustering', async () => {
  const props = { result: withHistory([{ island_id: -1, generation: 0 }]) };
  const view = await render(<Page {...props} />);
  expect(document.querySelector('[role="alert"]').textContent).toMatch(/malformed generation history/);
  await view.rerender(<Page {...props} result={null} />);
  expect(document.body.textContent).toMatch(/available when clustering finishes/);
});
