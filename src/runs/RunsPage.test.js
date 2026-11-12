import test from 'node:test';
import assert from 'node:assert/strict';
import { compile, mount, makeApi, runId, input, click, button, submit, find, act, catalog } from '../../test-support/dom.js';
const RunsPage = await compile('src/runs/RunsPage.jsx');
const render = async (client = makeApi()) => {
  const opened = [];
  const view = await mount(RunsPage, { api: client, onOpenRun: (id, meta) => opened.push({ id, ...meta }) });
  return { ...view, opened };
};

test('preset form submits published override types and forwards the accepted backend configuration', async () => {
  let body;
  const view = await render(
    makeApi({
      createRun: async (value) => {
        body = value;
        return { run_id: runId, status: 'queued', ...value };
      },
    })
  );
  try {
    assert.match(document.body.textContent, /Backend connected/);
    assert.equal(find('num_islands').tagName, 'SELECT');
    assert.deepEqual(
      [...find('num_islands').options].map((option) => option.value),
      ['4', '5', '6']
    );
    await input('seed', '0');
    await submit();
    assert.deepEqual(body.overrides, { seed: 0 });
    assert.equal(body.stream, true);
    assert.equal(view.opened[0].run.run_id, runId);
    assert.equal(view.opened[0].run.clustering.birch, true);
  } finally {
    await view.close();
  }
});
test('stages and backend errors are validated without losing edited values', async () => {
  let calls = 0;
  const view = await render(
    makeApi({
      createRun: async () => {
        calls++;
        throw Error('Runner rejected this combination.');
      },
    })
  );
  try {
    await input('evaluation_budget', '2000');
    for (const key of ['lsh', 'birch', 'denstream']) await click(find(key));
    await submit();
    assert.equal(calls, 0);
    assert.match(document.body.textContent, /Enable at least one clustering stage/);
    await click(find('birch'));
    await submit();
    assert.equal(calls, 1);
    assert.equal(find('evaluation_budget').value, '2000');
    assert.match(document.body.textContent, /Runner rejected/);
  } finally {
    await view.close();
  }
});
test('pending creation cannot submit a second run', async () => {
  let done,
    calls = 0;
  const pending = new Promise((resolve) => (done = resolve));
  const view = await render(
    makeApi({
      createRun: () => {
        calls++;
        return pending;
      },
    })
  );
  try {
    await submit();
    await submit();
    assert.equal(calls, 1);
    assert.ok(button('Starting…').disabled);
    await act(async () => done({ run_id: runId, status: 'queued', preset: 'de_rastrigin' }));
    assert.equal(view.opened[0].id, runId);
  } finally {
    await view.close();
  }
});
test('catalog retry preserves form values', async () => {
  let calls = 0;
  const view = await render(
    makeApi({
      presets: async () => {
        if (!calls++) throw Error('Runner unavailable.');
        return catalog;
      },
    })
  );
  try {
    assert.match(document.body.textContent, /Runner unavailable/);
    await click(button('Retry connection'));
    await input('evaluation_budget', '3000');
    await click(button('Retry connection'));
    assert.equal(find('evaluation_budget').value, '3000');
  } finally {
    await view.close();
  }
});
test('batch mode sends stream false and leaves the compute request with the backend', async () => {
  let body;
  const view = await render(
    makeApi({
      createRun: async (value) => {
        body = value;
        return { run_id: runId, status: 'queued', ...value };
      },
    })
  );
  try {
    await click(find('final-only'));
    await submit();
    assert.equal(body.stream, false);
    assert.deepEqual(Object.keys(body).sort(), ['clustering', 'overrides', 'preset', 'stream']);
  } finally {
    await view.close();
  }
});

test('setup dropdowns preserve backend numeric, boolean and automatic values', async () => {
  const bodies = [];
  const view = await render(
    makeApi({
      createRun: async (body) => {
        bodies.push(body);
        return { run_id: runId, status: 'queued', ...body };
      },
    })
  );
  try {
    assert.match(find('preset').selectedOptions[0].textContent, /Shifted Rotated/);
    assert.doesNotMatch(document.body.textContent, /Five islands explore Rastrigin/);
    assert.equal(document.querySelectorAll('[role="radiogroup"] input[type="radio"]').length, 2);
    await input('num_islands', '6');
    await input('migration.enabled', 'false');
    await input('migration.topology', 'torus');
    await input('detail', '1.4');
    assert.equal(document.querySelector('.advanced-clustering').open, false);
    await click(document.querySelector('.advanced-clustering summary'));
    assert.ok(find('clustering.birch_threshold').disabled);
    await input('cluster-mode-birch_threshold', 'manual');
    assert.equal(find('clustering.birch_threshold').disabled, false);
    await submit();
    assert.equal(bodies.length, 0);
    assert.match(document.body.textContent, /BIRCH threshold is required/);
    await input('clustering.birch_threshold', '0.37');
    await click(find('final-only'));
    await submit();
    assert.deepEqual(bodies[0].overrides, { num_islands: 6, 'migration.enabled': false, 'migration.topology': 'torus' });
    assert.equal(bodies[0].clustering.detail, 1.4);
    assert.equal(bodies[0].clustering.birch_threshold, 0.37);
    assert.equal(bodies[0].stream, false);
    await input('cluster-mode-birch_threshold', 'auto');
    assert.ok(find('clustering.birch_threshold').disabled);
    await submit();
    assert.equal(bodies[1].clustering.birch_threshold, null);
  } finally {
    await view.close();
  }
});
test('unhealthy backend blocks create and stale preset responses cannot replace a retry', async () => {
  let done,
    calls = 0;
  const pending = new Promise((resolve) => (done = resolve));
  const view = await render(
    makeApi({
      health: async () => ({ status: 'unavailable', db: false, redis: true }),
      presets: () => (++calls === 1 ? pending : Promise.resolve(catalog)),
    })
  );
  try {
    await click(button('Retry connection'));
    await act(async () => done({ ...catalog, presets: [{ ...catalog.presets[0], description: 'STALE DESCRIPTION' }] }));
    assert.doesNotMatch(document.body.textContent, /STALE DESCRIPTION/);
    assert.ok(button('Start run').disabled);
  } finally {
    await view.close();
  }
});
test('changing presets restores each draft and uses the selected preset defaults', async () => {
  const second = {
    ...catalog.presets[0],
    preset: 'de_sphere',
    benchmark: 'sphere',
    defaults: { ...catalog.presets[0].defaults, evaluation_budget: 20000 },
  };
  const view = await render(makeApi({ presets: async () => ({ ...catalog, presets: [...catalog.presets, second] }) }));
  try {
    await input('evaluation_budget', '3000');
    await input('preset', 'de_sphere');
    assert.equal(find('evaluation_budget').value, '20000');
    await input('evaluation_budget', '4000');
    await input('preset', 'de_rastrigin');
    assert.equal(find('evaluation_budget').value, '3000');
  } finally {
    await view.close();
  }
});
