import { test, expect, vi } from 'vitest';
import { render, makeApi, runId, input, click, button, submit, find, act } from '../test/test-utils.js';
import { rememberRun, readRecentRuns } from '../runs/recent-runs.js';
import Dashboard from './DashboardApp.jsx';
import Configuration from './RunConfiguration.jsx';
const Workspace = ({ runId, configuration }) => (
  <>
    <p>Selected {runId}</p>
    <Configuration configuration={configuration} />
  </>
);

test('dashboard shows the run browser, About and disabled run tabs before a run is selected', async () => {
  await render(<Dashboard api={makeApi()} Workspace={Workspace} />);
  expect(document.querySelector('aside[aria-label="Run browser"]')).toBeTruthy();
  expect(document.body.textContent).toMatch(/Start a new run/);
  expect(button('About')).toBeTruthy();
  for (const label of ['Migration', 'Convergence', 'Clustering', 'Run configurations']) expect(button(label).disabled).toBeTruthy();
  expect(find('preset').value).toBe('de_rastrigin');
});

test('analysis tabs retain selected run ID and hand each view to the shared workspace', async () => {
  let requests = 0;
  window.history.replaceState(null, '', `#archipelago?run_id=${runId}`);
  await render(
    <Dashboard
      api={makeApi({
        result: async () => {
          requests++;
        },
      })}
      Workspace={Workspace}
    />
  );
  for (const [label, page] of [
    ['Migration', 'migration'],
    ['Convergence', 'convergence'],
    ['Clustering', 'diagnostics'],
    ['Run configurations', 'run'],
  ]) {
    await click(button(label));
    expect(window.location.hash).toBe(`#${page}?run_id=${runId}`);
    expect(document.body.textContent).toMatch(new RegExp(`Selected ${runId}`));
  }
  expect(requests).toBe(0);
});

test('accepted batch run appears in sidebar, opens workspace and retains accepted configuration through refresh', async () => {
  let sent;
  const api = makeApi({
    createRun: async (body) => {
      sent = body;
      return { run_id: runId, status: 'queued', ...body };
    },
  });
  await render(<Dashboard api={api} Workspace={Workspace} />);
  await input('evaluation_budget', '2000');
  await click(find('final-only'));
  await submit();
  expect(sent.stream).toBe(false);
  expect(document.body.textContent).toMatch(new RegExp(`Selected ${runId}`));
  expect(readRecentRuns(window.localStorage, 'http://localhost:8000')[0].configuration.stream).toBe(false);
  await click(button('Run configurations'));
  expect(window.location.hash).toMatch(/#run\?run_id=/);
  expect(document.body.textContent).toMatch(/Final result only/);
  expect(document.body.textContent).toMatch(/2000/);
  await act(async () => window.dispatchEvent(new window.PopStateEvent('popstate')));
  expect(document.body.textContent).toMatch(/2000/);
  await click(button('New run'));
  expect(find('evaluation_budget').value).toBe('2000');
});

test('sidebar opens and removes remembered IDs and preserves current-run tab when switching', async () => {
  const other = 'run-20261102T130000Z-11223344';
  rememberRun(window.localStorage, 'http://localhost:8000', { run_id: runId, preset: 'first', source: 'new' });
  rememberRun(window.localStorage, 'http://localhost:8000', { run_id: other, preset: 'second', source: 'new' });
  window.history.replaceState(null, '', `#configuration?run_id=${runId}`);
  await render(<Dashboard api={makeApi()} Workspace={Workspace} />);
  await click(document.querySelector(`[data-run-id="${other}"]`));
  expect(window.location.hash).toBe(`#run?run_id=${other}`);
  expect(document.body.textContent).toMatch(/Request settings are not saved/);
  await click(document.querySelector(`[aria-label="Forget ${other}"]`));
  expect(readRecentRuns(window.localStorage, 'http://localhost:8000').length).toBe(1);
});

test('manual ID validation and storage failures retain an accepted run handoff', async () => {
  const blocked = {
    getItem: () => null,
    setItem: () => {
      throw Error('quota');
    },
  };
  await render(<Dashboard api={makeApi()} Workspace={Workspace} storage={blocked} />);
  await input('run_id', 'invalid');
  await submit('.open-run-form');
  expect(document.body.textContent).toMatch(/Enter a valid run ID/);
  await submit();
  expect(window.location.hash).toMatch(new RegExp(runId));
  expect(document.body.textContent).toMatch(/could not remember/);
});

test('sidebar history is isolated per backend and handles native storage events', async () => {
  const first = 'http://first:8000',
    second = 'http://second:8000';
  rememberRun(window.localStorage, first, { run_id: runId, preset: 'first', source: 'new' });
  const props = { api: makeApi({ baseUrl: first }), Workspace };
  const view = await render(<Dashboard {...props} />);
  expect(document.querySelector(`[data-run-id="${runId}"]`)).toBeTruthy();
  await view.rerender(<Dashboard {...props} api={makeApi({ baseUrl: second })} />);
  expect(document.querySelector(`[data-run-id="${runId}"]`)).toBe(null);
  rememberRun(window.localStorage, second, { run_id: runId, preset: 'second', source: 'new' });
  await act(async () => window.dispatchEvent(new window.StorageEvent('storage', { key: 'archipelago.backend-runs.v1' })));
  expect(document.querySelector(`[data-run-id="${runId}"]`)).toBeTruthy();
});

test('accepted settings are remembered with the run and shown in its configuration', async () => {
  await render(<Dashboard api={makeApi()} Workspace={Workspace} />);
  await input('evaluation_budget', '3000');
  await submit();
  expect(readRecentRuns(window.localStorage, 'http://localhost:8000')[0].configuration.overrides.evaluation_budget).toBe(3000);
  await click(button('Run configurations'));
  expect(document.body.textContent).toMatch(/3000/);
});

test('a view that crashes shows an error in place while navigation keeps working', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const Crashing = ({ view }) => {
    if (view === 'diagnostics') throw new Error('broken diagnostics');
    return <p>Showing {view}</p>;
  };
  window.history.replaceState(null, '', `#diagnostics?run_id=${runId}`);
  await render(<Dashboard api={makeApi()} Workspace={Crashing} />);
  expect(document.querySelector('[role="alert"]').textContent).toMatch(/This view failed: broken diagnostics/);
  expect(document.querySelector('aside[aria-label="Run browser"]')).toBeTruthy();
  await click(button('Migration'));
  expect(document.querySelector('[role="alert"]')).toBe(null);
  expect(document.body.textContent).toMatch(/Showing migration/);
});
