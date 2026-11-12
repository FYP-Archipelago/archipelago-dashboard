import React from 'react';
import { test, expect, vi } from 'vitest';
import { render, click, button, runId, act } from '../test/test-utils.js';
import Page from './ExplainabilityPage.jsx';
const otherRunId = 'run-20261102T120001Z-11223344';

const shapley = {
  status: 'ready',
  baseline_fitness: 10,
  observed_best_fitness: 5,
  supported_best_fitness: 5,
  coverage: { evaluations: 2, supported: 2 },
  warnings: [],
  islands: {
    empty_value: 0,
    full_value: 5,
    sampled_orders: null,
    players: [{ player: 0, value: 5, standard_error: null }],
    coalitions: [
      { players: [], value: 0 },
      { players: [0], value: 5 },
    ],
    orders: [[{ player: 0, before: 0, after: 5 }]],
  },
  routes: { empty_value: 5, full_value: 5, sampled_orders: null, players: [], coalitions: [{ players: [], value: 5 }], orders: [] },
};

const resultFor = (id, explainability = { shapley }) => ({
  run: { run_id: id, algorithm: 'de', benchmark: 'sphere', migration_topology: 'ring', islands: [0], maximising: false },
  explainability,
});
const result = resultFor(runId);
const notFound = (detail) => Object.assign(new Error(detail), { status: 404 });
const attribution = () => document.querySelector('[data-attribution]');

test('renders attribution from the run result, switches games and explores coalitions', async () => {
  await render(<Page runId={runId} api={{ result: async () => result }} />);
  expect(document.body.textContent).toMatch(/Backend analysis · de · sphere · ring/);
  expect(document.body.textContent).toMatch(/Island 0/);
  expect(document.querySelector('[data-coalition-value]').textContent).toMatch(/0/);
  await click(document.querySelector('input[type="checkbox"]'));
  expect(document.querySelector('[data-coalition-value]').textContent).toMatch(/5/);
  await click(button('Migration routes'));
  expect(document.body.textContent).toMatch(/No cross-island dependencies/);
});

test('an unfinished run polls every two seconds until its result exists', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  let calls = 0;
  const api = {
    result: async () => {
      calls += 1;
      if (calls === 1) throw notFound('No result: run is running');
      return result;
    },
  };
  await render(<Page runId={runId} api={api} />);
  expect(document.body.textContent).toMatch(/computed when clustering finishes/);
  await act(async () => vi.advanceTimersByTime(1999));
  expect(calls).toBe(1);
  await act(async () => vi.advanceTimersByTime(1));
  expect(calls).toBe(2);
  expect(attribution()).toBeTruthy();
  await act(async () => vi.advanceTimersByTime(6000));
  expect(calls).toBe(2);
});

test('a failed or cancelled run is unavailable without polling', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  for (const detail of ['No result: run failed', 'no result: run cancelled']) {
    let calls = 0;
    const api = {
      result: async () => {
        calls += 1;
        throw notFound(detail);
      },
    };
    const view = await render(<Page runId={runId} api={api} />);
    expect(document.body.textContent).toMatch(/stopped before clustering finished/);
    await act(async () => vi.advanceTimersByTime(10000));
    expect(calls).toBe(1);
    view.unmount();
  }
});

test('request failures and unknown runs show an error with retry', async () => {
  const failures = [
    () => {
      throw new Error('Backend unavailable');
    },
    () => {
      throw notFound('Run not found');
    },
  ];
  for (const fail of failures) {
    let calls = 0;
    const api = { result: async () => (++calls === 1 ? fail() : result) };
    const view = await render(<Page runId={runId} api={api} />);
    expect(document.querySelector('[role="alert"]')).toBeTruthy();
    expect(attribution()).toBe(null);
    await click(button('Retry'));
    expect(attribution()).toBeTruthy();
    view.unmount();
  }
});

test('changing run aborts the old request and ignores its late result', async () => {
  let resolveOld, oldSignal;
  const api = {
    result: (id, { signal }) => {
      if (id === otherRunId) return Promise.resolve(resultFor(otherRunId, { shapley: { status: 'unavailable', detail: 'Not this one.' } }));
      oldSignal = signal;
      return new Promise((resolve) => {
        resolveOld = resolve;
      });
    },
  };
  const props = { runId, api };
  const root = await render(<Page {...props} />);
  await root.rerender(<Page {...props} runId={otherRunId} />);
  expect(oldSignal.aborted).toBe(true);
  await act(async () => resolveOld(result));
  expect(attribution()).toBe(null);
  expect(document.body.textContent).toMatch(/Not this one/);
});

test('unmount cancels the scheduled poll', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  let calls = 0;
  const api = {
    result: async () => {
      calls += 1;
      throw notFound('No result: run is queued');
    },
  };
  const view = await render(<Page runId={runId} api={api} />);
  view.unmount();
  await act(async () => vi.advanceTimersByTime(10000));
  expect(calls).toBe(1);
});
