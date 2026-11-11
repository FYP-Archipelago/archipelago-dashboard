import test from 'node:test';
import assert from 'node:assert/strict';
import { compile, mount, click, button, runId, act } from '../../test-support/dom.js';

const Page = await compile('src/explainability/ExplainabilityPage.jsx');
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
  const root = await mount(Page, { runId, api: { result: async () => result } });
  try {
    assert.match(document.body.textContent, /Backend analysis · de · sphere · ring/);
    assert.match(document.body.textContent, /Island 0/);
    assert.match(document.querySelector('[data-coalition-value]').textContent, /0/);
    await click(document.querySelector('input[type="checkbox"]'));
    assert.match(document.querySelector('[data-coalition-value]').textContent, /5/);
    await click(button('Migration routes'));
    assert.match(document.body.textContent, /No cross-island dependencies/);
  } finally {
    await root.close();
  }
});

test('an unfinished run polls every two seconds until its result exists', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let calls = 0;
  const api = {
    result: async () => {
      calls += 1;
      if (calls === 1) throw notFound('No result: run is running');
      return result;
    },
  };
  const root = await mount(Page, { runId, api });
  try {
    assert.match(document.body.textContent, /computed when clustering finishes/);
    await act(async () => t.mock.timers.tick(1999));
    assert.equal(calls, 1);
    await act(async () => t.mock.timers.tick(1));
    assert.equal(calls, 2);
    assert.ok(attribution());
    await act(async () => t.mock.timers.tick(6000));
    assert.equal(calls, 2);
  } finally {
    await root.close();
    t.mock.timers.reset();
  }
});

test('a failed or cancelled run is unavailable without polling', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  for (const detail of ['No result: run failed', 'no result: run cancelled']) {
    let calls = 0;
    const api = {
      result: async () => {
        calls += 1;
        throw notFound(detail);
      },
    };
    const root = await mount(Page, { runId, api });
    try {
      assert.match(document.body.textContent, /stopped before clustering finished/);
      await act(async () => t.mock.timers.tick(10000));
      assert.equal(calls, 1);
    } finally {
      await root.close();
    }
  }
  t.mock.timers.reset();
});

test('request failures, unknown runs and malformed results show an error with retry', async () => {
  const failures = [
    () => {
      throw new Error('Backend unavailable');
    },
    () => {
      throw notFound('Run not found');
    },
    () => resultFor(otherRunId),
  ];
  for (const fail of failures) {
    let calls = 0;
    const api = { result: async () => (++calls === 1 ? fail() : result) };
    const root = await mount(Page, { runId, api });
    try {
      assert.ok(document.querySelector('[role="alert"]'));
      assert.equal(attribution(), null);
      await click(button('Retry'));
      assert.ok(attribution());
    } finally {
      await root.close();
    }
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
  const root = await mount(Page, { runId, api });
  try {
    await root.rerender({ runId: otherRunId });
    assert.equal(oldSignal.aborted, true);
    await act(async () => resolveOld(result));
    assert.equal(attribution(), null);
    assert.match(document.body.textContent, /Not this one/);
  } finally {
    await root.close();
  }
});

test('unmount cancels the scheduled poll', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let calls = 0;
  const api = {
    result: async () => {
      calls += 1;
      throw notFound('No result: run is queued');
    },
  };
  const root = await mount(Page, { runId, api });
  await root.close();
  await act(async () => t.mock.timers.tick(10000));
  assert.equal(calls, 1);
  t.mock.timers.reset();
});
