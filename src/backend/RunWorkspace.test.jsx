import { test, expect, vi } from 'vitest';
import { render, act, runId, click, button, input } from '../test/test-utils.js';
import { nodeTable, links, result, delta } from '../test/fixtures/backend.js';

import Workspace from './RunWorkspace.jsx';
window.HTMLCanvasElement.prototype.getContext = () => null;

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
  await render(<Workspace runId={runId} configuration={configuration} api={{ result: async () => final }} view="run" />);
  expect(document.querySelectorAll('h1').length).toBe(1);
  expect(document.querySelector('h1').textContent).toBe('Run configurations');
  expect(document.querySelector('.run-outcomes').textContent).toMatch(/200/);
  expect(document.querySelector('.algorithm-badge').textContent).toBe('DE');
  expect(document.querySelector('.run-identity').textContent).toMatch(/Shifted Rotated/);
  expect(document.querySelector('.run-identity').textContent).toMatch(/Ring/);
  expect(document.querySelectorAll('.run-outcomes dd')[3].textContent).toBe('7.501 s');
  const columns = document.querySelectorAll('.configuration-columns > section');
  expect(columns[0].textContent).toMatch(/Clustering settings/);
  expect(columns[1].textContent).toMatch(/Runner overrides/);
  expect(document.querySelector('.configuration-additional').open).toBe(false);
  expect(document.querySelector('.run-outcomes').textContent).toMatch(/0\.00000149109/);
  expect(document.querySelector('.run-configuration').textContent).toMatch(/Final result only/);
  expect(columns[1].querySelector('.configuration-fields').textContent).toMatch(/migration \/ interval3/);
  expect(document.querySelector('.run-configuration').textContent).toMatch(/Automatic/);
  expect(document.querySelector('.run-configuration').textContent).not.toMatch(/\{"enabled"/);
  expect(document.querySelector('.run-technical').open).toBe(false);
  expect(document.querySelector('.run-warning-list').textContent).toMatch(/one malformed row/);
});

test('Run result counters update from backend events while remembered configuration stays available', async () => {
  let source;
  const configuration = { preset: 'de_rastrigin', stream: true, overrides: {}, clustering: { lsh: true } };
  await render(
    <Workspace runId={runId} configuration={configuration} api={pendingApi()} view="run" eventSourceFactory={() => (source = new FakeSource(''))} />
  );
  expect(document.querySelector('.run-outcomes dd').textContent).toBe('—');
  expect(document.querySelector('.run-configuration').textContent).toMatch(/Live updates/);
  await act(async () =>
    source.emit('update', {
      status: 'live',
      graph: delta(),
      clustering: { ...result.clustering, counts: { evaluations: 12345, nodes: 42 } },
      malformed_rows: 0,
      warnings: [],
    })
  );
  expect(document.querySelector('.run-outcomes dd').textContent).toBe('12,345');
  expect(document.querySelectorAll('.run-outcomes dd')[1].textContent).toBe('42');
  expect(button('Cancel run')).toBeTruthy();
  expect(document.querySelector('.run-configuration').textContent).toMatch(/Preset defaults/);
  expect(document.querySelector('.run-warning-list')).toBe(null);
});

test('run details display final and live backend layout diagnostics', async () => {
  await render(<Workspace runId={runId} api={{ url: (p) => p, result: async () => result }} view="run" />);
  expect(document.body.textContent).toMatch(/Layout/);
  expect(document.body.textContent).toMatch(/PCA/);
  expect(document.body.textContent).toMatch(/80%/);
  let source;
  await render(<Workspace runId={runId} api={pendingApi()} view="run" eventSourceFactory={() => (source = new FakeSource(''))} />);
  await act(async () =>
    source.emit('update', { status: 'live', graph: delta(), layout: { method: 'mds', variance_kept_2d: 0.7, variance_kept_3d: 0.85 } })
  );
  expect(document.body.textContent).toMatch(/MDS/);
  expect(document.body.textContent).toMatch(/85%/);
});

test('done status does not claim a final result before persisted data is validated', async () => {
  let source,
    resolve,
    calls = 0;
  const waiting = new Promise((r) => {
    resolve = r;
  });
  const api = { url: (p) => p, result: () => (calls++ ? waiting : Promise.reject(Object.assign(Error('no result'), { status: 404 }))) };
  await render(<Workspace runId={runId} api={api} view="run" eventSourceFactory={() => (source = new FakeSource(''))} />);
  await act(async () => source.emit('status', { status: 'done' }));
  expect(document.body.textContent).not.toMatch(/Final result loaded/);
  expect(document.body.textContent).toMatch(/Loading final result/);
  await act(async () => resolve({ graph: null }));
  expect(document.body.textContent).not.toMatch(/Final result loaded/);
  expect(button('Retry connection')).toBeTruthy();
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
  await render(<Workspace runId={runId} api={api} view="run" eventSourceFactory={() => (source = new FakeSource(''))} />);
  await act(async () => source.emit('status', { status: 'running' }));
  await click(button('Cancel run'));
  expect(calls).toBe(1);
  expect(button('Cancelling…').disabled).toBeTruthy();
  await act(async () => resolve({ run_id: runId, status: 'cancelled' }));
  expect(document.body.textContent).toMatch(/Status: cancelled/);
  expect(source.closed).toBeTruthy();
  await act(async () => source.emit('final', result));
  expect(document.body.textContent).not.toMatch(/Final result loaded/);
});

test('a cancelling run keeps its stream open until the backend confirms the cancellation', async () => {
  let source;
  const api = { ...pendingApi(), cancelRun: async () => ({ run_id: runId, status: 'cancelling' }) };
  await render(<Workspace runId={runId} api={api} view="run" eventSourceFactory={() => (source = new FakeSource(''))} />);
  await act(async () => source.emit('status', { status: 'running' }));
  await click(button('Cancel run'));
  expect(document.body.textContent).toMatch(/Status: cancelling/);
  expect(document.body.textContent).not.toMatch(/invalid|not confirmed/i);
  expect(source.closed).toBe(false);

  await act(async () => source.emit('status', { status: 'cancelling' }));
  expect(source.closed).toBe(false);
  await act(async () => source.emit('status', { status: 'cancelled' }));
  expect(document.body.textContent).toMatch(/Status: cancelled/);
  expect(source.closed).toBeTruthy();
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
  await render(<Workspace runId={runId} api={api} view="run" eventSourceFactory={() => (source = new FakeSource(''))} />);
  await act(async () => source.emit('status', { status: 'running' }));
  await click(button('Cancel run'));
  expect(document.body.textContent).toMatch(/runner offline/);
  expect(!button('Cancel run').disabled).toBeTruthy();
  await click(button('Cancel run'));
  expect(document.body.textContent).toMatch(/Final result loaded/);
  expect(document.body.textContent).toMatch(/Status: done/);
});

test('cancellation response from a previous run cannot modify the new run', async () => {
  let source, resolve;
  const response = new Promise((r) => {
    resolve = r;
  });
  const api = { ...pendingApi(), cancelRun: () => response };
  const props = { runId, api, view: 'run', eventSourceFactory: () => (source = new FakeSource('')) };
  const view = await render(<Workspace {...props} />);
  await act(async () => source.emit('status', { status: 'running' }));
  await click(button('Cancel run'));
  await view.rerender(<Workspace {...props} runId="run-20261104T120000Z-11223344" />);
  await act(async () => source.emit('status', { status: 'running' }));
  await act(async () => resolve({ run_id: runId, status: 'cancelled' }));
  expect(document.body.textContent).toMatch(/Status: running/);
  expect(document.body.textContent).not.toMatch(/Status: cancelled/);
});

test('REST cancellation remains available after the event stream closes', async () => {
  let source,
    calls = 0;
  await render(
    <Workspace
      runId={runId}
      api={{
        ...pendingApi(),
        cancelRun: async () => {
          calls++;
          return { run_id: runId, status: 'cancelled' };
        },
      }}
      view="run"
      eventSourceFactory={() => (source = new FakeSource(''))}
    />
  );
  await act(async () => source.emit('status', { status: 'running' }));
  source.readyState = 2;
  await act(async () => source.listeners.get('error')({}));
  await click(button('Cancel run'));
  expect(calls).toBe(1);
  expect(document.body.textContent).toMatch(/Status: cancelled/);
});

test('a stream error cannot discard an acknowledged in-flight cancellation', async () => {
  let source, resolve;
  const response = new Promise((r) => {
    resolve = r;
  });
  await render(
    <Workspace
      runId={runId}
      api={{ ...pendingApi(), cancelRun: () => response }}
      view="run"
      eventSourceFactory={() => (source = new FakeSource(''))}
    />
  );
  await act(async () => source.emit('status', { status: 'running' }));
  await click(button('Cancel run'));
  await act(async () => source.emit('update', { status: 'live', graph: { bad: true } }));
  await act(async () => resolve({ run_id: runId, status: 'cancelled' }));
  expect(document.body.textContent).toMatch(/Status: cancelled/);
});

test('live diagnostics use update metadata before a final result exists', async () => {
  let source;
  await render(
    <Workspace runId={runId} api={pendingApi()} onBack={() => {}} view="diagnostics" eventSourceFactory={() => (source = new FakeSource(''))} />
  );
  await act(async () =>
    source.emit('update', {
      status: 'live',
      graph: delta(),
      clustering: { ...result.clustering, counts: { evaluations: 12345 } },
      malformed_rows: 0,
      warnings: [],
    })
  );
  expect(document.body.textContent).toMatch(/12,345/);
  expect(document.body.textContent).toMatch(/Island separation is available in the final result/);
});
test('run switch clears previous data immediately and ignores events from the old connection', async () => {
  let source;
  const api = pendingApi();
  const factory = () => (source = new FakeSource(''));
  const props = { runId, api, onBack() {}, view: 'run', eventSourceFactory: factory };
  const view = await render(<Workspace {...props} />);
  const old = source;
  await act(async () => old.emit('final', result));
  await view.rerender(<Workspace {...props} runId="run-20261103T120000Z-11223344" />);
  expect(document.body.textContent).not.toMatch(/rastrigin/i);
  await act(async () => old.emit('final', result));
  expect(document.body.textContent).not.toMatch(/rastrigin/i);
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
  await render(<Workspace runId={runId} api={api} onBack={() => {}} view="run" eventSourceFactory={() => (source = new FakeSource(''))} />);
  await act(async () => source.emit('status', { status: 'done' }));
  expect(calls).toBe(2);
  expect(document.body.textContent).toMatch(/Final result loaded/);
  expect(source.closed).toBeTruthy();
});
test('permanently closed streams offer retry and pending streams close on unmount', async () => {
  let source;
  const factory = () => (source = new FakeSource(''));
  const view = await render(<Workspace runId={runId} api={pendingApi()} onBack={() => {}} view="run" eventSourceFactory={factory} />);
  source.readyState = 2;
  await act(async () => source.listeners.get('error')({}));
  expect(document.body.textContent).toMatch(/Event stream closed/);
  await click(button('Retry connection'));
  expect(source.closed).toBe(false);
  view.unmount();
  expect(source.closed).toBeTruthy();
});
test('cancelled streams close without interpreting later final events as success', async () => {
  let source;
  await render(<Workspace runId={runId} api={pendingApi()} onBack={() => {}} view="run" eventSourceFactory={() => (source = new FakeSource(''))} />);
  await act(async () => source.emit('status', { status: 'cancelled' }));
  await act(async () => source.emit('final', result));
  expect(document.body.textContent).toMatch(/Status: cancelled/);
  expect(document.body.textContent).not.toMatch(/Final result loaded/);
});
test('failed status blocks late graph updates and finals while retaining backend error details', async () => {
  let source;
  await render(<Workspace runId={runId} api={pendingApi()} onBack={() => {}} view="run" eventSourceFactory={() => (source = new FakeSource(''))} />);
  await act(async () => source.emit('status', { status: 'failed' }));
  await act(async () => source.emit('update', { status: 'live', graph: delta(), warnings: [] }));
  await act(async () => source.emit('final', result));
  expect(document.body.textContent).toMatch(/Status: failed/);
  expect(document.body.textContent).not.toMatch(/Final result loaded/);
  await act(async () => source.emit('error', { phase: 'runner', message: 'time limit' }));
  expect(document.body.textContent).toMatch(/runner: time limit/);
  expect(source.closed).toBeTruthy();
});
test('failed status closes within a bounded wait if error details never arrive', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  let source;
  await render(<Workspace runId={runId} api={pendingApi()} onBack={() => {}} view="run" eventSourceFactory={() => (source = new FakeSource(''))} />);
  await act(async () => source.emit('status', { status: 'failed' }));
  await act(async () => vi.advanceTimersByTime(5000));
  expect(source.closed).toBeTruthy();
  expect(document.body.textContent).toMatch(/No additional error details/);
});
test('live status, graph delta, network retry state and final event render in the workspace', async () => {
  let source;
  const api = {
    url: (path) => '/backend' + path,
    result: async () => {
      throw Object.assign(Error('no result: run is running'), { status: 404 });
    },
  };
  await render(<Workspace runId={runId} api={api} onBack={() => {}} eventSourceFactory={(url) => (source = new FakeSource(url))} />);
  expect(source.url).toBe(`/backend/runs/${runId}/events`);
  await act(async () => source.emit('status', { status: 'running' }));
  expect(document.body.textContent).toMatch(/Status: running/);
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
  expect(document.querySelector('[aria-label="Archipelago backend graph"] #gl')).toBeTruthy();
  expect(document.body.textContent).toMatch(/WEBGL2 UNAVAILABLE/);
  await act(async () => source.listeners.get('error')({}));
  expect(document.body.textContent).toMatch(/Events: reconnecting/);
  await act(async () => source.emit('final', result));
  expect(document.body.textContent).toMatch(/Final result loaded/);
  expect(source.closed).toBe(true);
});

test('saved result drives diagnostics and separation without an SSE connection', async () => {
  let opened = 0;
  const api = { result: async () => result, url: () => '/backend/events' };
  await render(
    <Workspace
      runId={runId}
      api={api}
      onBack={() => {}}
      view="diagnostics"
      eventSourceFactory={() => {
        opened++;
        return new FakeSource('');
      }}
    />
  );
  expect(opened).toBe(0);
  expect(document.querySelector('.page-head').contains(button('← Back to Runs'))).toBeTruthy();
  expect(document.querySelector('.page-head').contains(document.querySelector('.run-status'))).toBeTruthy();
  expect(document.querySelectorAll('.run-status').length).toBe(1);
  expect(document.querySelector('.run-status').children.length).toBe(3);
  expect(document.querySelector('.clustering-overview').contains(document.querySelector('.clustering-summary'))).toBeTruthy();
  expect(document.querySelector('.clustering-summary').textContent).toMatch(/200.*2/s);
  expect(document.querySelector('.clustering-summary').textContent).not.toMatch(/What happened|Solutions evaluated/);
  expect(document.querySelectorAll('.clustering-stages li').length).toBe(2);
  expect(document.querySelector('.clustering-stages').textContent).toMatch(/LSH.*BIRCH/s);
  expect(document.querySelector('.clustering-stages').textContent).toMatch(/Threshold.*0.3/s);
  expect(document.querySelector('.clustering-stages').textContent).not.toMatch(/DenStream/);
  expect(document.querySelectorAll('.island-pair').length).toBe(0);
  const details = document.querySelector('.clustering-technical');
  expect(details.tagName).toBe('SECTION');
  expect(document.querySelectorAll('.stage-run-values').length).toBe(1);
  expect(document.querySelector('.metric-column').textContent).toMatch(/BIRCH run values.*Whole run/s);
  expect(document.querySelector('.clustering-counts').textContent).toMatch(/rows clustered.*200.*Elapsed time.*1.20 s/s);
  expect(details.textContent).not.toMatch(/Resolved settings/);
  expect(details.textContent).toMatch(/rows clustered/i);
  expect(details.textContent).toMatch(/0.01/);
  expect(details.textContent).toMatch(/Generation window/);
  expect(details.querySelectorAll('table').length).toBe(0);
});

test('enabled stages show backend-resolved settings under the matching stage', async () => {
  const data = structuredClone(result);
  data.clustering.stages = ['lsh', 'birch', 'denstream'];
  data.clustering.resolved = { lsh_bucket_width: 0.25, birch_threshold: 0.3, denstream_epsilon: 0.01, denstream_half_life: 2.5 };
  data.clustering.diagnostics = { lsh: { family: 'p_stable' }, birch: { clusters: 2 }, denstream: { clusters: 1 } };
  await render(<Workspace runId={runId} api={{ result: async () => data, url: () => '/backend/events' }} view="diagnostics" />);
  const stages = [...document.querySelectorAll('.clustering-stages li')].map((stage) => stage.textContent);
  expect(stages.length).toBe(3);
  expect(stages[0]).toMatch(/LSH.*Family.*p_stable.*Bucket width.*0.25/s);
  expect(stages[1]).toMatch(/BIRCH.*Threshold.*0.3/s);
  expect(stages[2]).toMatch(/DenStream.*Epsilon.*0.01.*Half life.*2.5/s);
});

test('island matrices preserve small exact values and switch generation windows', async () => {
  const data = structuredClone(result);
  data.run.islands = [0, 1, 2];
  data.separation.pairs = { a: [0, 0, 1], b: [1, 2, 2], mmd2: [0.000012345, 0.001, 0.002], p: [0.0033222591362126247, 0.02, 0.04] };
  data.separation.windows = { from_generation: [0, 10], typical_distance: [0.6, 0.8] };
  data.separation.window_pairs = { window: [0, 1], a: [0, 0], b: [1, 1], mmd2: [0.3, 0.9] };
  await render(<Workspace runId={runId} api={{ result: async () => data, url: () => '/backend/events' }} view="diagnostics" />);
  const whole = document.querySelector('[aria-label="Whole-run island comparisons"]');
  expect(whole.querySelector('.matrix-legend').textContent).toMatch(/MMD² colour scale.*Lower.*Higher/s);
  expect(whole.textContent).toMatch(/0.000012345/);
  expect(whole.textContent).toMatch(/0.0033222591362126247/);
  expect(whole.querySelectorAll('.matrix-cell').length).toBe(6);
  expect(whole.querySelectorAll('.matrix-diagonal').length).toBe(3);
  expect(whole.querySelector('[aria-label^="Island 0 and island 1:"]').style.getPropertyValue('--heat-opacity')).toBe(
    whole.querySelector('[aria-label^="Island 1 and island 0:"]').style.getPropertyValue('--heat-opacity')
  );
  expect(whole.querySelector('[aria-label^="Island 0 and island 1:"]').style.getPropertyValue('--heat-opacity')).toBe(
    String(0.5 * (0.000012345 / 0.002))
  );
  expect(whole.querySelector('[aria-label^="Island 1 and island 2:"]').style.getPropertyValue('--heat-opacity')).toBe('0.5');
  await click(whole.querySelector('[aria-label^="Island 0 and island 2:"]'));
  expect(whole.querySelector('.matrix-selection').textContent).toMatch(/0.001.*0.02/s);
  const windows = document.querySelector('[aria-label="Generation-window island comparisons"]');
  expect(windows.textContent).toMatch(/Generation 0/);
  expect(windows.textContent).toMatch(/0.3/);
  expect(windows.querySelectorAll('.matrix-missing').length > 0).toBeTruthy();
  expect(windows.querySelector('.matrix-cell').getAttribute('aria-label')).not.toMatch(/p value/);
  expect(button('← Previous').disabled).toBeTruthy();
  await click(button('Next →'));
  expect(windows.textContent).toMatch(/Generation 10/);
  expect(windows.textContent).toMatch(/0.9/);
  expect(windows.querySelector('.matrix-selection').textContent).not.toMatch(/0.3/);
  expect(button('Next →').disabled).toBeTruthy();
  await click(button('← Previous'));
  expect(windows.textContent).toMatch(/Generation 0/);
  await input('separation-window', '1');
  expect(windows.textContent).toMatch(/Generation 10/);
});

test('Back to Runs is visible above the run heading and returns to Runs', async () => {
  let returned = 0;
  await render(
    <Workspace
      runId={runId}
      api={{ result: async () => result, url: () => '/backend/events' }}
      onBack={() => {
        returned++;
      }}
      view="archipelago"
    />
  );
  expect(document.querySelector('.backend-run-workspace').firstElementChild.className).toBe('run-back');
  expect(document.querySelector('.page-head').contains(document.querySelector('.run-status'))).toBeTruthy();
  await click(button('← Back to Runs'));
  expect(returned).toBe(1);
});

test('backend failure phase is shown and a pending event stream closes on unmount', async () => {
  let source;
  const api = {
    url: (path) => '/backend' + path,
    result: async () => {
      throw Object.assign(Error('no result: run is running'), { status: 404 });
    },
  };
  await render(<Workspace runId={runId} api={api} onBack={() => {}} view="run" eventSourceFactory={(url) => (source = new FakeSource(url))} />);
  await act(async () => source.emit('error', { phase: 'clustering', message: 'invalid rows' }));
  expect(document.body.textContent).toMatch(/clustering: invalid rows/);
  expect(document.body.textContent).toMatch(/Status: failed/);
  expect(source.closed).toBe(true);
});

test('nullable values and backend diagnostic value types render', async () => {
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
  await render(<Workspace runId={runId} api={{ url: (p) => p, result: async () => data }} view="diagnostics" />);
  expect(document.body.textContent).toMatch(/Final result loaded/);
  expect(document.body.textContent).toMatch(/p_stable/);
  expect([...document.querySelectorAll('.metric-series span')].map((item) => item.textContent)).toStrictEqual(['0.1', '0.2']);
  expect(document.body.textContent).toMatch(/Unavailable/);
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
  await render(<Workspace runId={runId} api={api} view="migration" eventSourceFactory={() => (source = new FakeSource(''))} />);
  await act(async () => source.emit('final', final));
  expect(calls).toBe(1);
  expect(document.querySelector('.migration-matrix')).toBeTruthy();
  expect(document.querySelector('.migration-metrics dd').textContent).toBe('2');
  expect(source.closed).toBeTruthy();
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
  await render(<Workspace runId={runId} api={{ result: async () => final }} view="convergence" />);
  expect(document.body.textContent).toMatch(/Fitness history/);
  expect(document.querySelectorAll('tbody tr').length).toBe(2);
  expect(document.querySelector('.history-point-value strong').textContent).toBe('0.00000149109');
  expect(document.querySelector('.history-data').open).toBe(false);
});
test('real convergence handles older runs without history', async () => {
  await render(<Workspace runId={runId} api={{ result: async () => result }} view="convergence" />);
  expect(document.body.textContent).toMatch(/No generation history/);
  expect(document.querySelector('.convergence-chart')).toBe(null);
});
