import test from 'node:test';
import assert from 'node:assert/strict';
import { compile, mount, makeApi, runId, input, click, button, submit, find, act, dom, React } from '../../test-support/dom.js';
import { rememberRun, readRecentRuns } from '../runs/recent-runs.js';
const Dashboard = await compile('src/app/DashboardApp.jsx');
const Configuration = await compile('src/app/RunConfiguration.jsx');
const Workspace = ({ runId, configuration }) =>
  React.createElement(
    React.Fragment,
    null,
    React.createElement('p', null, `Selected ${runId}`),
    React.createElement(Configuration, { configuration })
  );

test('dashboard shows the run browser, About and disabled run tabs before a run is selected', async () => {
  const view = await mount(Dashboard, { api: makeApi(), Workspace });
  try {
    assert.ok(document.querySelector('aside[aria-label="Run browser"]'));
    assert.match(document.body.textContent, /Start a new run/);
    assert.ok(button('About'));
    for (const label of ['Migration', 'Convergence', 'Clustering', 'Run configurations']) assert.ok(button(label).disabled);
    assert.equal(find('preset').value, 'de_rastrigin');
  } finally {
    await view.close();
  }
});

test('analysis tabs retain selected run ID and hand each view to the shared workspace', async () => {
  let requests = 0;
  const view = await mount(
    Dashboard,
    {
      api: makeApi({
        result: async () => {
          requests++;
        },
      }),
      Workspace,
    },
    () => window.history.replaceState(null, '', `#archipelago?run_id=${runId}`)
  );
  try {
    for (const [label, page] of [
      ['Migration', 'migration'],
      ['Convergence', 'convergence'],
      ['Clustering', 'diagnostics'],
      ['Run configurations', 'run'],
    ]) {
      await click(button(label));
      assert.equal(window.location.hash, `#${page}?run_id=${runId}`);
      assert.match(document.body.textContent, new RegExp(`Selected ${runId}`));
    }
    assert.equal(requests, 0);
  } finally {
    await view.close();
  }
});

test('accepted batch run appears in sidebar, opens workspace and retains accepted configuration through refresh', async () => {
  let sent;
  const api = makeApi({
    createRun: async (body) => {
      sent = body;
      return { run_id: runId, status: 'queued', ...body };
    },
  });
  const view = await mount(Dashboard, { api, Workspace });
  try {
    await input('evaluation_budget', '2000');
    await click(find('final-only'));
    await submit();
    assert.equal(sent.stream, false);
    assert.match(document.body.textContent, new RegExp(`Selected ${runId}`));
    assert.equal(readRecentRuns(window.localStorage, 'http://localhost:8000')[0].configuration.stream, false);
    await click(button('Run configurations'));
    assert.match(window.location.hash, /#run\?run_id=/);
    assert.match(document.body.textContent, /Final result only/);
    assert.match(document.body.textContent, /2000/);
    await act(async () => window.dispatchEvent(new dom.window.PopStateEvent('popstate')));
    assert.match(document.body.textContent, /2000/);
    await click(button('New run'));
    assert.equal(find('evaluation_budget').value, '2000');
  } finally {
    await view.close();
  }
});

test('sidebar opens and removes remembered IDs and preserves current-run tab when switching', async () => {
  const other = 'run-20261102T130000Z-11223344';
  const view = await mount(Dashboard, { api: makeApi(), Workspace }, () => {
    rememberRun(window.localStorage, 'http://localhost:8000', { run_id: runId, preset: 'first', source: 'new' });
    rememberRun(window.localStorage, 'http://localhost:8000', { run_id: other, preset: 'second', source: 'new' });
    window.history.replaceState(null, '', `#configuration?run_id=${runId}`);
  });
  try {
    await click(document.querySelector(`[data-run-id="${other}"]`));
    assert.equal(window.location.hash, `#run?run_id=${other}`);
    assert.match(document.body.textContent, /Request settings are not saved/);
    await click(document.querySelector(`[aria-label="Forget ${other}"]`));
    assert.equal(readRecentRuns(window.localStorage, 'http://localhost:8000').length, 1);
  } finally {
    await view.close();
  }
});

test('manual ID validation and storage failures retain an accepted run handoff', async () => {
  const blocked = {
    getItem: () => null,
    setItem: () => {
      throw Error('quota');
    },
  };
  const view = await mount(Dashboard, { api: makeApi(), Workspace, storage: blocked });
  try {
    await input('run_id', 'invalid');
    await submit('.open-run-form');
    assert.match(document.body.textContent, /Enter a valid run ID/);
    await submit();
    assert.match(window.location.hash, new RegExp(runId));
    assert.match(document.body.textContent, /could not remember/);
  } finally {
    await view.close();
  }
});

test('sidebar history is isolated per backend and handles native storage events', async () => {
  const first = 'http://first:8000',
    second = 'http://second:8000';
  const view = await mount(Dashboard, { api: makeApi({ baseUrl: first }), Workspace }, () =>
    rememberRun(window.localStorage, first, { run_id: runId, preset: 'first', source: 'new' })
  );
  try {
    assert.ok(document.querySelector(`[data-run-id="${runId}"]`));
    await view.rerender({ api: makeApi({ baseUrl: second }) });
    assert.equal(document.querySelector(`[data-run-id="${runId}"]`), null);
    rememberRun(window.localStorage, second, { run_id: runId, preset: 'second', source: 'new' });
    await act(async () => window.dispatchEvent(new dom.window.StorageEvent('storage', { key: 'archipelago.backend-runs.v1' })));
    assert.ok(document.querySelector(`[data-run-id="${runId}"]`));
  } finally {
    await view.close();
  }
});

test('accepted settings are remembered with the run and shown in its configuration', async () => {
  const view = await mount(Dashboard, { api: makeApi(), Workspace });
  try {
    await input('evaluation_budget', '3000');
    await submit();
    assert.equal(readRecentRuns(window.localStorage, 'http://localhost:8000')[0].configuration.overrides.evaluation_budget, 3000);
    await click(button('Run configurations'));
    assert.match(document.body.textContent, /3000/);
  } finally {
    await view.close();
  }
});
