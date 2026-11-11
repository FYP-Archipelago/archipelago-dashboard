import test from 'node:test';
import assert from 'node:assert/strict';
import { compile, mount, click, button, dom, act, React, input, submit } from '../../test-support/dom.js';
import { result } from '../../test-support/backend-fixture.js';
const Page = await compile('src/demo/RecordedDashboard.jsx');
const id = result.run.run_id;
const recording = {
  run_id: id,
  label: 'DE · Rastrigin · ring',
  recorded_at: '2026-09-03T23:08:38Z',
  configuration: { preset: 'Saved ring run', overrides: { num_islands: 4 }, stream: false, clustering: { lsh: true, birch: true } },
};
const api = { isDemo: true, identity: async () => 'recorded-demo:v1', recordings: async () => [recording], result: async () => result };
const Configuration = await compile('src/app/RunConfiguration.jsx');
const Workspace = ({ runId, configuration, view }) =>
  React.createElement(
    React.Fragment,
    null,
    React.createElement('div', null, `Recorded graph ${runId}`),
    view === 'run' && React.createElement(Configuration, { configuration, recorded: true })
  );

test('recorded deployment preloads runs and preserves navigation without exposing live actions', async () => {
  const view = await mount(Page, { api, Workspace });
  try {
    assert.match(document.body.textContent, /Recorded-data demonstration/);
    assert.match(document.body.textContent, /Saved runs/);
    assert.equal(document.querySelector('select[aria-label="Select run"]').options.length, 2);
    assert.equal(button('Start run'), undefined);
    assert.equal(button('New run'), undefined);
    assert.equal(button('Forget'), undefined);
    assert.equal(document.querySelector('.new-run-form'), null);
    await click(button('Open recording'));
    assert.match(window.location.hash, /#archipelago\?run_id=/);
    assert.match(document.body.textContent, /Recorded graph/);
    for (const label of ['Migration', 'Convergence', 'Clustering', 'Run configurations']) {
      await click(button(label));
      assert.match(document.body.textContent, /Recorded graph/);
    }
    await click(button('Run configurations'));
    assert.match(document.body.textContent, /Recorded runner settings/);
    assert.match(document.body.textContent, /Offline clustering/);
    await click(button('About'));
    assert.match(document.body.textContent, /Archipelago/);
    await act(async () => {
      window.history.replaceState(null, '', `#migration?run_id=${id}`);
      window.dispatchEvent(new dom.window.PopStateEvent('popstate'));
    });
    assert.match(document.body.textContent, /Recorded graph/);
  } finally {
    await view.close();
  }
});

test('recording index failure has a working retry instead of falling back to a backend', async () => {
  let failed = true;
  const view = await mount(Page, {
    api: {
      ...api,
      recordings: async () => {
        if (failed) throw Error('Recording data unavailable');
        return [recording];
      },
    },
    Workspace,
  });
  try {
    assert.match(document.body.textContent, /Recording data unavailable/);
    failed = false;
    await click(button('Retry'));
    assert.ok(button('Open recording'));
  } finally {
    await view.close();
  }
});

test('recordings keep their original dates and reject unpublished run IDs without changing the catalog', async () => {
  const view = await mount(Page, { api, Workspace });
  try {
    const date = document.querySelector('.recent-open small').textContent;
    await click(button('Open recording'));
    assert.equal(document.querySelector('.recent-open small').textContent, date);
    await input('run_id', 'run-20261102T120000Z-11223344');
    await submit('.open-run-form');
    assert.match(document.body.textContent, /not included in this demonstration/);
    assert.equal(document.querySelectorAll('.browser-runs li').length, 1);
    assert.match(document.body.textContent, /Recorded graph/);
  } finally {
    await view.close();
  }
});
