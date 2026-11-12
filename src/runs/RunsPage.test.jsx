import { test, expect } from 'vitest';
import { render, makeApi, runId, input, click, button, submit, find, act, catalog } from '../test/test-utils.js';
import RunsPage from './RunsPage.jsx';
const renderPage = async (client = makeApi()) => {
  const opened = [];
  const view = await render(<RunsPage api={client} onOpenRun={(id, meta) => opened.push({ id, ...meta })} />);
  return { ...view, opened };
};

test('preset form submits published override types and forwards the accepted backend configuration', async () => {
  let body;
  const view = await renderPage(
    makeApi({
      createRun: async (value) => {
        body = value;
        return { run_id: runId, status: 'queued', ...value };
      },
    })
  );
  expect(document.body.textContent).toMatch(/Backend connected/);
  expect(find('num_islands').tagName).toBe('SELECT');
  expect([...find('num_islands').options].map((option) => option.value)).toStrictEqual(['4', '5', '6']);
  await input('seed', '0');
  await submit();
  expect(body.overrides).toStrictEqual({ seed: 0 });
  expect(body.stream).toBe(true);
  expect(view.opened[0].run.run_id).toBe(runId);
  expect(view.opened[0].run.clustering.birch).toBe(true);
});
test('stages and backend errors are validated without losing edited values', async () => {
  let calls = 0;
  await renderPage(
    makeApi({
      createRun: async () => {
        calls++;
        throw Error('Runner rejected this combination.');
      },
    })
  );
  await input('evaluation_budget', '2000');
  for (const key of ['lsh', 'birch', 'denstream']) await click(find(key));
  await submit();
  expect(calls).toBe(0);
  expect(document.body.textContent).toMatch(/Enable at least one clustering stage/);
  await click(find('birch'));
  await submit();
  expect(calls).toBe(1);
  expect(find('evaluation_budget').value).toBe('2000');
  expect(document.body.textContent).toMatch(/Runner rejected/);
});
test('pending creation cannot submit a second run', async () => {
  let done,
    calls = 0;
  const pending = new Promise((resolve) => (done = resolve));
  const view = await renderPage(
    makeApi({
      createRun: () => {
        calls++;
        return pending;
      },
    })
  );
  await submit();
  await submit();
  expect(calls).toBe(1);
  expect(button('Starting…').disabled).toBeTruthy();
  await act(async () => done({ run_id: runId, status: 'queued', preset: 'de_rastrigin' }));
  expect(view.opened[0].id).toBe(runId);
});
test('catalog retry preserves form values', async () => {
  let calls = 0;
  await renderPage(
    makeApi({
      presets: async () => {
        if (!calls++) throw Error('Runner unavailable.');
        return catalog;
      },
    })
  );
  expect(document.body.textContent).toMatch(/Runner unavailable/);
  await click(button('Retry connection'));
  await input('evaluation_budget', '3000');
  await click(button('Retry connection'));
  expect(find('evaluation_budget').value).toBe('3000');
});
test('batch mode sends stream false and leaves the compute request with the backend', async () => {
  let body;
  await renderPage(
    makeApi({
      createRun: async (value) => {
        body = value;
        return { run_id: runId, status: 'queued', ...value };
      },
    })
  );
  await click(find('final-only'));
  await submit();
  expect(body.stream).toBe(false);
  expect(Object.keys(body).sort()).toStrictEqual(['clustering', 'overrides', 'preset', 'stream']);
});

test('setup dropdowns preserve backend numeric, boolean and automatic values', async () => {
  const bodies = [];
  await renderPage(
    makeApi({
      createRun: async (body) => {
        bodies.push(body);
        return { run_id: runId, status: 'queued', ...body };
      },
    })
  );
  expect(find('preset').selectedOptions[0].textContent).toMatch(/Shifted Rotated/);
  expect(document.body.textContent).not.toMatch(/Five islands explore Rastrigin/);
  expect(document.querySelectorAll('[role="radiogroup"] input[type="radio"]').length).toBe(2);
  await input('num_islands', '6');
  await input('migration.enabled', 'false');
  await input('migration.topology', 'torus');
  await input('detail', '1.4');
  expect(document.querySelector('.advanced-clustering').open).toBe(false);
  await click(document.querySelector('.advanced-clustering summary'));
  expect(find('clustering.birch_threshold').disabled).toBeTruthy();
  await input('cluster-mode-birch_threshold', 'manual');
  expect(find('clustering.birch_threshold').disabled).toBe(false);
  await submit();
  expect(bodies.length).toBe(0);
  expect(document.body.textContent).toMatch(/BIRCH threshold is required/);
  await input('clustering.birch_threshold', '0.37');
  await click(find('final-only'));
  await submit();
  expect(bodies[0].overrides).toStrictEqual({ num_islands: 6, 'migration.enabled': false, 'migration.topology': 'torus' });
  expect(bodies[0].clustering.detail).toBe(1.4);
  expect(bodies[0].clustering.birch_threshold).toBe(0.37);
  expect(bodies[0].stream).toBe(false);
  await input('cluster-mode-birch_threshold', 'auto');
  expect(find('clustering.birch_threshold').disabled).toBeTruthy();
  await submit();
  expect(bodies[1].clustering.birch_threshold).toBe(null);
});
test('unhealthy backend blocks create and stale preset responses cannot replace a retry', async () => {
  let done,
    calls = 0;
  const pending = new Promise((resolve) => (done = resolve));
  await renderPage(
    makeApi({
      health: async () => ({ status: 'unavailable', db: false, redis: true }),
      presets: () => (++calls === 1 ? pending : Promise.resolve(catalog)),
    })
  );
  await click(button('Retry connection'));
  await act(async () => done({ ...catalog, presets: [{ ...catalog.presets[0], description: 'STALE DESCRIPTION' }] }));
  expect(document.body.textContent).not.toMatch(/STALE DESCRIPTION/);
  expect(button('Start run').disabled).toBeTruthy();
});
test('changing presets restores each draft and uses the selected preset defaults', async () => {
  const second = {
    ...catalog.presets[0],
    preset: 'de_sphere',
    benchmark: 'sphere',
    defaults: { ...catalog.presets[0].defaults, evaluation_budget: 20000 },
  };
  await renderPage(makeApi({ presets: async () => ({ ...catalog, presets: [...catalog.presets, second] }) }));
  await input('evaluation_budget', '3000');
  await input('preset', 'de_sphere');
  expect(find('evaluation_budget').value).toBe('20000');
  await input('evaluation_budget', '4000');
  await input('preset', 'de_rastrigin');
  expect(find('evaluation_budget').value).toBe('3000');
});
