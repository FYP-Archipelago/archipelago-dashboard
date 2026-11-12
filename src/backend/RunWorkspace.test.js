import { nodeTable, links, result, delta } from '../../test-support/backend-fixture.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { compile, mount, act, dom, runId, click, button, input } from '../../test-support/dom.js';

const Workspace = await compile('src/backend/RunWorkspace.jsx');
dom.window.HTMLCanvasElement.prototype.getContext = () => null;

class FakeSource {
  constructor(url) {
    this.url = url;
    this.listeners = new Map();
    this.closed = false;
  }
  addEventListener(name, listener) {
    this.listeners.set(name, listener);
  }
  emit(name, data) {
    this.listeners.get(name)?.({ data: JSON.stringify(data) });
  }
  close() {
    this.closed = true;
  }
}
const pendingApi = () => ({
  url: (path) => path,
  result: async () => {
    throw Object.assign(Error('no result: run is running'), { status: 404 });
  },
});

test('combined Run view keeps request settings beside final results with technical details collapsed', async () => {
  const configuration = {
    preset: 'de_rastrigin',
    stream: false,
    overrides: { seed: 0, migration: { enabled: true, interval: 3 } },
    clustering: { birch: true, birch_threshold: null, lsh_hashes: 6 },
  };
  const final = structuredClone(result);
  final.clustering.elapsed_seconds = 7.501225799991516;
  final.run.benchmark = 'shifted_rotated';
  final.graph.nodes.overall_best = [true, false];
  final.graph.nodes.best_fitness[0] = 0.00000149109;
  const view = await mount(Workspace, { runId, configuration, api: { result: async () => final }, view: 'run' });
  try {
    assert.equal(document.querySelectorAll('h1').length, 1);
    assert.equal(document.querySelector('h1').textContent, 'Run configurations');
    assert.match(document.querySelector('.run-outcomes').textContent, /200/);
    assert.equal(document.querySelector('.algorithm-badge').textContent, 'DE');
    assert.match(document.querySelector('.run-identity').textContent, /Shifted Rotated/);
    assert.match(document.querySelector('.run-identity').textContent, /Ring/);
    assert.equal(document.querySelectorAll('.run-outcomes dd')[3].textContent, '7.501 s');
    const columns = document.querySelectorAll('.configuration-columns > section');
    assert.match(columns[0].textContent, /Clustering settings/);
    assert.match(columns[1].textContent, /Runner overrides/);
    assert.equal(document.querySelector('.configuration-additional').open, false);
    assert.match(document.querySelector('.run-outcomes').textContent, /0\.00000149109/);
    assert.match(document.querySelector('.run-configuration').textContent, /Final result only/);
    assert.match(columns[1].querySelector('.configuration-fields').textContent, /migration \/ interval3/);
    assert.match(document.querySelector('.run-configuration').textContent, /Automatic/);
    assert.doesNotMatch(document.querySelector('.run-configuration').textContent, /\{"enabled"/);
    assert.equal(document.querySelector('.run-technical').open, false);
    assert.match(document.querySelector('.run-warning-list').textContent, /one malformed row/);
  } finally {
    await view.close();
  }
});

test('Run result counters update from backend events while remembered configuration stays available', async () => {
  let source;
  const configuration = { preset: 'de_rastrigin', stream: true, overrides: {}, clustering: { lsh: true } };
  const view = await mount(Workspace, {
    runId,
    configuration,
    api: pendingApi(),
    view: 'run',
    eventSourceFactory: () => (source = new FakeSource('')),
  });
  try {
    assert.equal(document.querySelector('.run-outcomes dd').textContent, '—');
    assert.match(document.querySelector('.run-configuration').textContent, /Live updates/);
    await act(async () =>
      source.emit('update', {
        status: 'live',
        graph: delta(),
        clustering: { ...result.clustering, counts: { evaluations: 12345, nodes: 42 } },
        malformed_rows: 0,
        warnings: [],
      })
    );
    assert.equal(document.querySelector('.run-outcomes dd').textContent, '12,345');
    assert.equal(document.querySelectorAll('.run-outcomes dd')[1].textContent, '42');
    assert.ok(button('Cancel run'));
    assert.match(document.querySelector('.run-configuration').textContent, /Preset defaults/);
    assert.equal(document.querySelector('.run-warning-list'), null);
  } finally {
    await view.close();
  }
});

test('run details display final and live backend layout diagnostics', async () => {
  const final = await mount(Workspace, { runId, api: { url: (p) => p, result: async () => result }, view: 'run' });
  try {
    assert.match(document.body.textContent, /Layout/);
    assert.match(document.body.textContent, /PCA/);
    assert.match(document.body.textContent, /80%/);
  } finally {
    await final.close();
  }
  let source;
  const live = await mount(Workspace, { runId, api: pendingApi(), view: 'run', eventSourceFactory: () => (source = new FakeSource('')) });
  try {
    await act(async () =>
      source.emit('update', { status: 'live', graph: delta(), layout: { method: 'mds', variance_kept_2d: 0.7, variance_kept_3d: 0.85 } })
    );
    assert.match(document.body.textContent, /MDS/);
    assert.match(document.body.textContent, /85%/);
  } finally {
    await live.close();
  }
});

test('done status does not claim a final result before persisted data is validated', async () => {
  let source,
    resolve,
    calls = 0;
  const waiting = new Promise((r) => {
    resolve = r;
  });
  const api = { url: (p) => p, result: () => (calls++ ? waiting : Promise.reject(Object.assign(Error('no result'), { status: 404 }))) };
  const view = await mount(Workspace, { runId, api, view: 'run', eventSourceFactory: () => (source = new FakeSource('')) });
  try {
    await act(async () => source.emit('status', { status: 'done' }));
    assert.doesNotMatch(document.body.textContent, /Final result loaded/);
    assert.match(document.body.textContent, /Loading final result/);
    await act(async () => resolve({ graph: null }));
    assert.doesNotMatch(document.body.textContent, /Final result loaded/);
    assert.ok(button('Retry connection'));
  } finally {
    await view.close();
  }
});

test('cancellation submits once, retains graph and ignores late successful events', async () => {
  let source,
    resolve,
    calls = 0;
  const response = new Promise((r) => {
    resolve = r;
  });
  const api = {
    ...pendingApi(),
    cancelRun: () => {
      calls++;
      return response;
    },
  };
  const view = await mount(Workspace, { runId, api, view: 'run', eventSourceFactory: () => (source = new FakeSource('')) });
  try {
    await act(async () => source.emit('status', { status: 'running' }));
    await click(button('Cancel run'));
    assert.equal(calls, 1);
    assert.ok(button('Cancelling…').disabled);
    await act(async () => resolve({ run_id: runId, status: 'cancelled' }));
    assert.match(document.body.textContent, /Status: cancelled/);
    assert.ok(source.closed);
    await act(async () => source.emit('final', result));
    assert.doesNotMatch(document.body.textContent, /Final result loaded/);
  } finally {
    await view.close();
  }
});

test('a cancelling run keeps its stream open until the backend confirms the cancellation', async () => {
  let source;
  const api = { ...pendingApi(), cancelRun: async () => ({ run_id: runId, status: 'cancelling' }) };
  const view = await mount(Workspace, { runId, api, view: 'run', eventSourceFactory: () => (source = new FakeSource('')) });
  try {
    await act(async () => source.emit('status', { status: 'running' }));
    await click(button('Cancel run'));
    assert.match(document.body.textContent, /Status: cancelling/);
    assert.doesNotMatch(document.body.textContent, /invalid|not confirmed/i);
    assert.equal(source.closed, false);

    await act(async () => source.emit('status', { status: 'cancelling' }));
    assert.equal(source.closed, false);
    await act(async () => source.emit('status', { status: 'cancelled' }));
    assert.match(document.body.textContent, /Status: cancelled/);
    assert.ok(source.closed);
  } finally {
    await view.close();
  }
});

test('cancellation failure is retryable and a completion race loads the actual result', async () => {
  let source,
    cancels = 0,
    reads = 0;
  const api = {
    url: (p) => p,
    result: async () => {
      if (!reads++) throw Object.assign(Error('no result'), { status: 404 });
      return result;
    },
    cancelRun: async () => {
      if (!cancels++) throw Error('runner offline');
      return { run_id: runId, status: 'done' };
    },
  };
  const view = await mount(Workspace, { runId, api, view: 'run', eventSourceFactory: () => (source = new FakeSource('')) });
  try {
    await act(async () => source.emit('status', { status: 'running' }));
    await click(button('Cancel run'));
    assert.match(document.body.textContent, /runner offline/);
    assert.ok(!button('Cancel run').disabled);
    await click(button('Cancel run'));
    assert.match(document.body.textContent, /Final result loaded/);
    assert.match(document.body.textContent, /Status: done/);
  } finally {
    await view.close();
  }
});

test('cancellation response from a previous run cannot modify the new run', async () => {
  let source, resolve;
  const response = new Promise((r) => {
    resolve = r;
  });
  const api = { ...pendingApi(), cancelRun: () => response };
  const view = await mount(Workspace, { runId, api, view: 'run', eventSourceFactory: () => (source = new FakeSource('')) });
  try {
    await act(async () => source.emit('status', { status: 'running' }));
    await click(button('Cancel run'));
    await view.rerender({ runId: 'run-20261104T120000Z-11223344' });
    await act(async () => source.emit('status', { status: 'running' }));
    await act(async () => resolve({ run_id: runId, status: 'cancelled' }));
    assert.match(document.body.textContent, /Status: running/);
    assert.doesNotMatch(document.body.textContent, /Status: cancelled/);
  } finally {
    await view.close();
  }
});

test('REST cancellation remains available after the event stream closes', async () => {
  let source,
    calls = 0;
  const view = await mount(Workspace, {
    runId,
    api: {
      ...pendingApi(),
      cancelRun: async () => {
        calls++;
        return { run_id: runId, status: 'cancelled' };
      },
    },
    view: 'run',
    eventSourceFactory: () => (source = new FakeSource('')),
  });
  try {
    await act(async () => source.emit('status', { status: 'running' }));
    source.readyState = 2;
    await act(async () => source.listeners.get('error')({}));
    await click(button('Cancel run'));
    assert.equal(calls, 1);
    assert.match(document.body.textContent, /Status: cancelled/);
  } finally {
    await view.close();
  }
});

test('a stream error cannot discard an acknowledged in-flight cancellation', async () => {
  let source, resolve;
  const response = new Promise((r) => {
    resolve = r;
  });
  const view = await mount(Workspace, {
    runId,
    api: { ...pendingApi(), cancelRun: () => response },
    view: 'run',
    eventSourceFactory: () => (source = new FakeSource('')),
  });
  try {
    await act(async () => source.emit('status', { status: 'running' }));
    await click(button('Cancel run'));
    await act(async () => source.emit('update', { status: 'live', graph: { bad: true } }));
    await act(async () => resolve({ run_id: runId, status: 'cancelled' }));
    assert.match(document.body.textContent, /Status: cancelled/);
  } finally {
    await view.close();
  }
});

test('malformed backend error data does not disable REST cancellation', async () => {
  let source,
    calls = 0;
  const view = await mount(Workspace, {
    runId,
    api: {
      ...pendingApi(),
      cancelRun: async () => {
        calls++;
        return { run_id: runId, status: 'cancelled' };
      },
    },
    view: 'run',
    eventSourceFactory: () => (source = new FakeSource('')),
  });
  try {
    await act(async () => source.emit('status', { status: 'running' }));
    await act(async () => source.emit('error', null));
    await click(button('Cancel run'));
    assert.equal(calls, 1);
    assert.match(document.body.textContent, /Status: cancelled/);
  } finally {
    await view.close();
  }
});

test('malformed separation row values are rejected before React diagnostics rendering', async () => {
  let source;
  const view = await mount(Workspace, { runId, api: pendingApi(), view: 'diagnostics', eventSourceFactory: () => (source = new FakeSource('')) });
  try {
    await act(async () => source.emit('final', { ...result, separation: { ...result.separation, pairs: { ...result.separation.pairs, a: [{}] } } }));
    assert.match(document.body.textContent, /invalid separation/);
    assert.ok(button('Retry connection'));
  } finally {
    await view.close();
  }
});

test('malformed updates and statuses produce recoverable errors instead of unmounting the workspace', async () => {
  let source;
  const view = await mount(Workspace, {
    runId,
    api: pendingApi(),
    onBack() {},
    view: 'run',
    eventSourceFactory: () => (source = new FakeSource('')),
  });
  try {
    await act(async () => source.emit('update', { status: 'live', graph: { ...delta(), new_nodes: { id: [1] } }, warnings: [] }));
    assert.match(document.body.textContent, /missing.*island/);
    assert.ok(source.closed);
    await click(button('Retry connection'));
    await act(async () => source.emit('status', {}));
    assert.match(document.body.textContent, /invalid status/);
    assert.ok(button('Retry connection'));
  } finally {
    await view.close();
  }
});
test('live diagnostics use update metadata before a final result exists', async () => {
  let source;
  const view = await mount(Workspace, {
    runId,
    api: pendingApi(),
    onBack() {},
    view: 'diagnostics',
    eventSourceFactory: () => (source = new FakeSource('')),
  });
  try {
    await act(async () =>
      source.emit('update', {
        status: 'live',
        graph: delta(),
        clustering: { ...result.clustering, counts: { evaluations: 12345 } },
        malformed_rows: 0,
        warnings: [],
      })
    );
    assert.match(document.body.textContent, /12,345/);
    assert.match(document.body.textContent, /Island separation is available in the final result/);
  } finally {
    await view.close();
  }
});
test('run switch clears previous data immediately and ignores events from the old connection', async () => {
  let source;
  const api = pendingApi();
  const factory = () => (source = new FakeSource(''));
  const view = await mount(Workspace, { runId, api, onBack() {}, view: 'run', eventSourceFactory: factory });
  try {
    const old = source;
    await act(async () => old.emit('final', result));
    await view.rerender({ runId: 'run-20261103T120000Z-11223344' });
    assert.doesNotMatch(document.body.textContent, /rastrigin/i);
    await act(async () => old.emit('final', result));
    assert.doesNotMatch(document.body.textContent, /rastrigin/i);
  } finally {
    await view.close();
  }
});
test('done status recovers the persisted result when the final event is unavailable', async () => {
  let source,
    calls = 0;
  const api = {
    url: (p) => p,
    result: async () => {
      if (!calls++) throw Object.assign(Error('no result: run is running'), { status: 404 });
      return result;
    },
  };
  const view = await mount(Workspace, { runId, api, onBack() {}, view: 'run', eventSourceFactory: () => (source = new FakeSource('')) });
  try {
    await act(async () => source.emit('status', { status: 'done' }));
    assert.equal(calls, 2);
    assert.match(document.body.textContent, /Final result loaded/);
    assert.ok(source.closed);
  } finally {
    await view.close();
  }
});
test('permanently closed streams offer retry and pending streams close on unmount', async () => {
  let source;
  const factory = () => (source = new FakeSource(''));
  const view = await mount(Workspace, { runId, api: pendingApi(), onBack() {}, view: 'run', eventSourceFactory: factory });
  try {
    source.readyState = 2;
    await act(async () => source.listeners.get('error')({}));
    assert.match(document.body.textContent, /Event stream closed/);
    await click(button('Retry connection'));
    assert.equal(source.closed, false);
  } finally {
    await view.close();
    assert.ok(source.closed);
  }
});
test('cancelled streams close without interpreting later final events as success', async () => {
  let source;
  const view = await mount(Workspace, {
    runId,
    api: pendingApi(),
    onBack() {},
    view: 'run',
    eventSourceFactory: () => (source = new FakeSource('')),
  });
  try {
    await act(async () => source.emit('status', { status: 'cancelled' }));
    await act(async () => source.emit('final', result));
    assert.match(document.body.textContent, /Status: cancelled/);
    assert.doesNotMatch(document.body.textContent, /Final result loaded/);
  } finally {
    await view.close();
  }
});
test('malformed live metadata is recoverable before React renders diagnostics', async () => {
  let source;
  const view = await mount(Workspace, {
    runId,
    api: pendingApi(),
    onBack() {},
    view: 'diagnostics',
    eventSourceFactory: () => (source = new FakeSource('')),
  });
  try {
    await act(async () => source.emit('update', { status: 'live', graph: delta(), clustering: { stages: 'lsh' }, warnings: [] }));
    assert.match(document.body.textContent, /invalid clustering/);
    assert.ok(button('Retry connection'));
    assert.ok(source.closed);
  } finally {
    await view.close();
  }
});
test('failed status blocks late graph updates and finals while retaining backend error details', async () => {
  let source;
  const view = await mount(Workspace, {
    runId,
    api: pendingApi(),
    onBack() {},
    view: 'run',
    eventSourceFactory: () => (source = new FakeSource('')),
  });
  try {
    await act(async () => source.emit('status', { status: 'failed' }));
    await act(async () => source.emit('update', { status: 'live', graph: delta(), warnings: [] }));
    await act(async () => source.emit('final', result));
    assert.match(document.body.textContent, /Status: failed/);
    assert.doesNotMatch(document.body.textContent, /Final result loaded/);
    await act(async () => source.emit('error', { phase: 'runner', message: 'time limit' }));
    assert.match(document.body.textContent, /runner: time limit/);
    assert.ok(source.closed);
  } finally {
    await view.close();
  }
});
test('failed status closes within a bounded wait if error details never arrive', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let source;
  const view = await mount(Workspace, {
    runId,
    api: pendingApi(),
    onBack() {},
    view: 'run',
    eventSourceFactory: () => (source = new FakeSource('')),
  });
  try {
    await act(async () => source.emit('status', { status: 'failed' }));
    await act(async () => t.mock.timers.tick(5000));
    assert.ok(source.closed);
    assert.match(document.body.textContent, /No additional error details/);
  } finally {
    await view.close();
    t.mock.timers.reset();
  }
});
test('malformed final separation metadata is reported without rendering a broken diagnostics page', async () => {
  const view = await mount(Workspace, {
    runId,
    api: { url: (p) => p, result: async () => ({ ...result, separation: {} }) },
    onBack() {},
    view: 'diagnostics',
  });
  try {
    assert.match(document.body.textContent, /invalid separation metadata/);
    assert.ok(button('Retry connection'));
  } finally {
    await view.close();
  }
});

test('live status, graph delta, network retry state and final event render in the workspace', async () => {
  let source;
  const api = {
    url: (path) => '/backend' + path,
    result: async () => {
      throw Object.assign(Error('no result: run is running'), { status: 404 });
    },
  };
  const view = await mount(Workspace, { runId, api, onBack() {}, eventSourceFactory: (url) => (source = new FakeSource(url)) });
  try {
    assert.equal(source.url, `/backend/runs/${runId}/events`);
    await act(async () => source.emit('status', { status: 'running' }));
    assert.match(document.body.textContent, /Status: running/);
    await act(async () =>
      source.emit('update', {
        status: 'live',
        layout: result.layout,
        clustering: result.clustering,
        malformed_rows: 1,
        warnings: result.warnings,
        graph: {
          ...delta(),
          new_nodes: nodeTable([10, 20]),
          new_edges: links([1], [10], [20], 'weight'),
          new_migrations: links([2], [10], [20], 'count'),
          island_best: [10],
          overall_best: 20,
          overlap: 1.1,
        },
      })
    );
    assert.ok(document.querySelector('[aria-label="Archipelago backend graph"] #gl'));
    assert.match(document.body.textContent, /WEBGL2 UNAVAILABLE/);
    await act(async () => source.listeners.get('error')({}));
    assert.match(document.body.textContent, /Events: reconnecting/);
    await act(async () => source.emit('final', result));
    assert.match(document.body.textContent, /Final result loaded/);
    assert.equal(source.closed, true);
  } finally {
    await view.close();
  }
});

test('saved result drives diagnostics and separation without an SSE connection', async () => {
  let opened = 0;
  const api = { result: async () => result, url: () => '/backend/events' };
  const view = await mount(Workspace, {
    runId,
    api,
    onBack() {},
    view: 'diagnostics',
    eventSourceFactory: () => {
      opened++;
      return new FakeSource('');
    },
  });
  try {
    assert.equal(opened, 0);
    assert.ok(document.querySelector('.page-head').contains(button('← Back to Runs')));
    assert.ok(document.querySelector('.page-head').contains(document.querySelector('.run-status')));
    assert.equal(document.querySelectorAll('.run-status').length, 1);
    assert.equal(document.querySelector('.run-status').children.length, 3);
    assert.ok(document.querySelector('.clustering-overview').contains(document.querySelector('.clustering-summary')));
    assert.match(document.querySelector('.clustering-summary').textContent, /200.*2/s);
    assert.doesNotMatch(document.querySelector('.clustering-summary').textContent, /What happened|Solutions evaluated/);
    assert.equal(document.querySelectorAll('.clustering-stages li').length, 2);
    assert.match(document.querySelector('.clustering-stages').textContent, /LSH.*BIRCH/s);
    assert.match(document.querySelector('.clustering-stages').textContent, /Threshold.*0.3/s);
    assert.doesNotMatch(document.querySelector('.clustering-stages').textContent, /DenStream/);
    assert.equal(document.querySelectorAll('.island-pair').length, 0);
    const details = document.querySelector('.clustering-technical');
    assert.equal(details.tagName, 'SECTION');
    assert.equal(document.querySelectorAll('.stage-run-values').length, 1);
    assert.match(document.querySelector('.metric-column').textContent, /BIRCH run values.*Whole run/s);
    assert.match(document.querySelector('.clustering-counts').textContent, /rows clustered.*200.*Elapsed time.*1.20 s/s);
    assert.doesNotMatch(details.textContent, /Resolved settings/);
    assert.match(details.textContent, /rows clustered/i);
    assert.match(details.textContent, /0.01/);
    assert.match(details.textContent, /Generation window/);
    assert.equal(details.querySelectorAll('table').length, 0);
  } finally {
    await view.close();
  }
});

test('enabled stages show backend-resolved settings under the matching stage', async () => {
  const data = structuredClone(result);
  data.clustering.stages = ['lsh', 'birch', 'denstream'];
  data.clustering.resolved = { lsh_bucket_width: 0.25, birch_threshold: 0.3, denstream_epsilon: 0.01, denstream_half_life: 2.5 };
  data.clustering.diagnostics = { lsh: { family: 'p_stable' }, birch: { clusters: 2 }, denstream: { clusters: 1 } };
  const view = await mount(Workspace, { runId, api: { result: async () => data, url: () => '/backend/events' }, view: 'diagnostics' });
  try {
    const stages = [...document.querySelectorAll('.clustering-stages li')].map((stage) => stage.textContent);
    assert.equal(stages.length, 3);
    assert.match(stages[0], /LSH.*Family.*p_stable.*Bucket width.*0.25/s);
    assert.match(stages[1], /BIRCH.*Threshold.*0.3/s);
    assert.match(stages[2], /DenStream.*Epsilon.*0.01.*Half life.*2.5/s);
  } finally {
    await view.close();
  }
});

test('island matrices preserve small exact values and switch generation windows', async () => {
  const data = structuredClone(result);
  data.run.islands = [0, 1, 2];
  data.separation.pairs = { a: [0, 0, 1], b: [1, 2, 2], mmd2: [0.000012345, 0.001, 0.002], p: [0.0033222591362126247, 0.02, 0.04] };
  data.separation.windows = { from_generation: [0, 10], typical_distance: [0.6, 0.8] };
  data.separation.window_pairs = { window: [0, 1], a: [0, 0], b: [1, 1], mmd2: [0.3, 0.9] };
  const view = await mount(Workspace, { runId, api: { result: async () => data, url: () => '/backend/events' }, view: 'diagnostics' });
  try {
    const whole = document.querySelector('[aria-label="Whole-run island comparisons"]');
    assert.match(whole.querySelector('.matrix-legend').textContent, /MMD² colour scale.*Lower.*Higher/s);
    assert.match(whole.textContent, /0.000012345/);
    assert.match(whole.textContent, /0.0033222591362126247/);
    assert.equal(whole.querySelectorAll('.matrix-cell').length, 6);
    assert.equal(whole.querySelectorAll('.matrix-diagonal').length, 3);
    assert.equal(
      whole.querySelector('[aria-label^="Island 0 and island 1:"]').style.getPropertyValue('--heat-opacity'),
      whole.querySelector('[aria-label^="Island 1 and island 0:"]').style.getPropertyValue('--heat-opacity')
    );
    assert.equal(
      whole.querySelector('[aria-label^="Island 0 and island 1:"]').style.getPropertyValue('--heat-opacity'),
      String(0.5 * (0.000012345 / 0.002))
    );
    assert.equal(whole.querySelector('[aria-label^="Island 1 and island 2:"]').style.getPropertyValue('--heat-opacity'), '0.5');
    await click(whole.querySelector('[aria-label^="Island 0 and island 2:"]'));
    assert.match(whole.querySelector('.matrix-selection').textContent, /0.001.*0.02/s);
    const windows = document.querySelector('[aria-label="Generation-window island comparisons"]');
    assert.match(windows.textContent, /Generation 0/);
    assert.match(windows.textContent, /0.3/);
    assert.ok(windows.querySelectorAll('.matrix-missing').length > 0);
    assert.doesNotMatch(windows.querySelector('.matrix-cell').getAttribute('aria-label'), /p value/);
    assert.ok(button('← Previous').disabled);
    await click(button('Next →'));
    assert.match(windows.textContent, /Generation 10/);
    assert.match(windows.textContent, /0.9/);
    assert.doesNotMatch(windows.querySelector('.matrix-selection').textContent, /0.3/);
    assert.ok(button('Next →').disabled);
    await click(button('← Previous'));
    assert.match(windows.textContent, /Generation 0/);
    await input('separation-window', '1');
    assert.match(windows.textContent, /Generation 10/);
  } finally {
    await view.close();
  }
});

test('Back to Runs is visible above the run heading and returns to Runs', async () => {
  let returned = 0;
  const view = await mount(Workspace, {
    runId,
    api: { result: async () => result, url: () => '/backend/events' },
    onBack() {
      returned++;
    },
    view: 'archipelago',
  });
  try {
    assert.equal(document.querySelector('.backend-run-workspace').firstElementChild.className, 'run-back');
    assert.ok(document.querySelector('.page-head').contains(document.querySelector('.run-status')));
    await click(button('← Back to Runs'));
    assert.equal(returned, 1);
  } finally {
    await view.close();
  }
});

test('backend failure phase is shown and a pending event stream closes on unmount', async () => {
  let source;
  const api = {
    url: (path) => '/backend' + path,
    result: async () => {
      throw Object.assign(Error('no result: run is running'), { status: 404 });
    },
  };
  const view = await mount(Workspace, { runId, api, onBack() {}, view: 'run', eventSourceFactory: (url) => (source = new FakeSource(url)) });
  try {
    await act(async () => source.emit('error', { phase: 'clustering', message: 'invalid rows' }));
    assert.match(document.body.textContent, /clustering: invalid rows/);
    assert.match(document.body.textContent, /Status: failed/);
    assert.equal(source.closed, true);
  } finally {
    await view.close();
  }
});

test('invalid nested clustering metadata is rejected before diagnostics rendering', async (t) => {
  const cases = [
    ['counts', { counts: { evaluations: { bad: 1 } } }],
    ['resolved settings', { resolved: { birch_threshold: [] } }],
    ['stage diagnostics', { diagnostics: { birch: { radius: { bad: 1 } } } }],
    ['checkpoint arrays', { diagnostics: { denstream: { epsilon_checkpoints: [0.1, {}] } } }],
    ['stage records', { diagnostics: { birch: [] } }],
    ['elapsed time', { elapsed_seconds: 'soon' }],
  ];
  for (const [name, change] of cases)
    await t.test(name, async () => {
      let source;
      const view = await mount(Workspace, { runId, api: pendingApi(), view: 'diagnostics', eventSourceFactory: () => (source = new FakeSource('')) });
      try {
        await act(async () => source.emit('update', { status: 'live', graph: delta(), clustering: { ...result.clustering, ...change } }));
        assert.match(document.body.textContent, /invalid clustering metadata/);
        assert.ok(button('Retry connection'));
        assert.ok(source.closed);
      } finally {
        await view.close();
      }
    });
});

test('run metadata is checked before accepting a saved result', async (t) => {
  for (const [name, run] of [
    ['nested benchmark', { ...result.run, benchmark: { bad: 1 } }],
    ['island shape', { ...result.run, islands: { length: 2 } }],
    ['island values', { ...result.run, islands: [{}] }],
    ['optimisation direction', { ...result.run, maximising: 'false' }],
    ['missing identity', { ...result.run, run_id: '' }],
  ])
    await t.test(name, async () => {
      const view = await mount(Workspace, { runId, api: { url: (p) => p, result: async () => ({ ...result, run }) }, view: 'run' });
      try {
        assert.match(document.body.textContent, /invalid run metadata/);
        assert.doesNotMatch(document.body.textContent, /Final result loaded/);
        assert.ok(button('Retry connection'));
      } finally {
        await view.close();
      }
    });
});

test('metadata validation preserves nullable values and backend diagnostic value types', async () => {
  const data = {
    ...result,
    run: { ...result.run, migration_topology: null },
    clustering: {
      ...result.clustering,
      diagnostics: {
        denstream: { epsilon: 0.2, input_points: 2, family: 'p_stable', summarised: false, prune_period: null, epsilon_checkpoints: [0.1, 0.2] },
      },
    },
    separation: { ...result.separation, typical_distance: null },
  };
  const view = await mount(Workspace, { runId, api: { url: (p) => p, result: async () => data }, view: 'diagnostics' });
  try {
    assert.match(document.body.textContent, /Final result loaded/);
    assert.match(document.body.textContent, /p_stable/);
    assert.deepEqual(
      [...document.querySelectorAll('.metric-series span')].map((item) => item.textContent),
      ['0.1', '0.2']
    );
    assert.match(document.body.textContent, /Unavailable/);
  } finally {
    await view.close();
  }
});

test('final results require complete metadata before declaring success', async (t) => {
  for (const field of ['run', 'layout', 'clustering', 'separation', 'malformed_rows', 'warnings']) {
    for (const missing of [true, false])
      await t.test(`${field} ${missing ? 'missing' : 'null'}`, async () => {
        const data = structuredClone(result);
        if (missing) delete data[field];
        else data[field] = null;
        const view = await mount(Workspace, { runId, api: { url: (p) => p, result: async () => data }, view: 'run' });
        try {
          assert.doesNotMatch(document.body.textContent, /Final result loaded/);
          assert.ok(button('Retry connection'));
        } finally {
          await view.close();
        }
      });
  }
});

test('final clustering metadata requires its declared fields', async (t) => {
  const paths = [
    ['stages'],
    ['counts'],
    ['resolved'],
    ['diagnostics'],
    ['elapsed_seconds'],
    ...['evaluations', 'rows_clustered', 'nodes', 'faded_nodes'].map((key) => ['counts', key]),
    ...['birch_threshold', 'denstream_epsilon', 'denstream_half_life', 'lsh_bucket_width'].map((key) => ['resolved', key]),
  ];
  for (const path of paths)
    await t.test(path.join('.'), async () => {
      const data = structuredClone(result);
      let parent = data.clustering;
      for (const key of path.slice(0, -1)) parent = parent[key];
      delete parent[path.at(-1)];
      const view = await mount(Workspace, { runId, api: { url: (p) => p, result: async () => data }, view: 'run' });
      try {
        assert.doesNotMatch(document.body.textContent, /Final result loaded/);
        assert.ok(button('Retry connection'));
      } finally {
        await view.close();
      }
    });
});

test('invalid scalar result metadata is recoverable', async (t) => {
  for (const [name, change, label] of [
    ['malformed row count', { malformed_rows: {} }, 'malformed row count'],
    ['separation distance', { separation: { ...result.separation, typical_distance: {} } }, 'separation metadata'],
    ['separation method', { separation: { ...result.separation, method: [] } }, 'separation metadata'],
  ])
    await t.test(name, async () => {
      const view = await mount(Workspace, { runId, api: { url: (p) => p, result: async () => ({ ...result, ...change }) }, view: 'run' });
      try {
        assert.match(document.body.textContent, new RegExp('invalid ' + label));
        assert.doesNotMatch(document.body.textContent, /Final result loaded/);
        assert.ok(button('Retry connection'));
      } finally {
        await view.close();
      }
    });
});

test('the final event carries migration routes, so completion needs no second result request', async () => {
  let source;
  let calls = 0;
  const final = { ...result, migration_routes: [{ source: 0, destination: 1, migrants: 2 }] };
  const api = {
    url: (path) => path,
    result: async () => {
      calls += 1;
      throw Object.assign(new Error('no result'), { status: 404 });
    },
  };
  const view = await mount(Workspace, { runId, api, view: 'migration', eventSourceFactory: () => (source = new FakeSource('')) });
  try {
    await act(async () => source.emit('final', final));
    assert.equal(calls, 1);
    assert.ok(document.querySelector('.migration-matrix'));
    assert.equal(document.querySelector('.migration-metrics dd').textContent, '2');
    assert.ok(source.closed);
  } finally {
    await view.close();
  }
});

test('real convergence uses final module history', async () => {
  const final = structuredClone(result);
  final.generation_history = [
    {
      island_id: 0,
      generation: 0,
      best_fitness: 3,
      mean_fitness: 5,
      best_so_far_fitness: 3,
      std_fitness: 1,
      evaluations_total: 10,
      diversity: 0.4,
      diversity_metric: 'euclidean',
    },
    {
      island_id: 0,
      generation: 2,
      best_fitness: 0.00000149109,
      mean_fitness: 2,
      best_so_far_fitness: 0.00000149109,
      std_fitness: null,
      evaluations_total: 30,
      diversity: 0.2,
      diversity_metric: 'euclidean',
    },
  ];
  const view = await mount(Workspace, { runId, api: { result: async () => final }, view: 'convergence' });
  try {
    assert.match(document.body.textContent, /Fitness history/);
    assert.equal(document.querySelectorAll('tbody tr').length, 2);
    assert.equal(document.querySelector('.history-point-value strong').textContent, '0.00000149109');
    assert.equal(document.querySelector('.history-data').open, false);
  } finally {
    await view.close();
  }
});
test('real convergence handles older runs without history', async () => {
  const view = await mount(Workspace, { runId, api: { result: async () => result }, view: 'convergence' });
  try {
    assert.match(document.body.textContent, /No generation history/);
    assert.equal(document.querySelector('.convergence-chart'), null);
  } finally {
    await view.close();
  }
});
