import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {mountStnViewer} from './stn-viewer.js';
import {applyGraphDelta,emptyGraph,graphFromResult} from '../backend/graph-model.js';
import {delta,nodeTable} from '../../test-support/backend-fixture.js';

test('graph height uses best fitness from the live stream through the final result', t => {
  const {window} = new JSDOM('<main></main>');
  const root = window.document.querySelector('main');
  let frame;
  let vertices;
  let heightMix;
  Object.assign(globalThis, {
    window,
    document: window.document,
    getComputedStyle: window.getComputedStyle.bind(window),
    requestAnimationFrame(callback) { frame = callback; return 1; },
    cancelAnimationFrame() {},
  });
  const gl = new Proxy({
    getShaderParameter: () => true,
    getProgramParameter: (_, param) => param === 'ACTIVE_UNIFORMS' ? 1 : true,
    getActiveUniform: () => ({name: 'uZMix'}),
    getUniformLocation: (_, name) => name,
    getAttribLocation: () => 0,
    bufferData(_, data) {
      if (data instanceof Float32Array && data.length === 30) vertices = data;
    },
    uniform3fv(name, values) {
      if (name === 'uZMix') heightMix = Array.from(values);
    },
  }, {get: (target, key) => target[key] ?? (/^[A-Z]/.test(key) ? key : () => {})});
  window.HTMLCanvasElement.prototype.getContext = () => gl;

  const viewer = mountStnViewer(root, {backend: true});
  t.after(() => { viewer.destroy(); window.close(); });
  const nodes = {...nodeTable([10,20]), z:[.25,-.5], best_fitness:[1,3],
    mean_fitness:[10,5], fitness_percentile:[.9,.2]};
  const update = delta();
  const waiting = applyGraphDelta(emptyGraph(), {...update, new_nodes:nodes});
  const live = applyGraphDelta(waiting, {...update, overall_best:10});
  const final = graphFromResult({graph:{nodes:{...nodes, overall_best:[true,false],
    mean_fitness:[20,4], fitness_percentile:[.8,.1]}, edges:update.new_edges,
    migrations:update.new_migrations, overlap:0}});
  const heights = () => [vertices[6], vertices[21]];
  const heightLabel = root.querySelector('#v-height');

  viewer.setBackendGraph(waiting, 'live-run');
  assert.deepEqual(heights(), [0,0]);
  assert.equal(heightLabel.textContent, 'best fitness pending');
  assert.equal(root.querySelector('#z-mean'), null);

  viewer.setBackendGraph(live, 'live-run');
  frame(0);
  assert.deepEqual(heightMix, [1,0,0]);
  assert.equal(heightLabel.textContent, 'best fitness');
  assert.equal(root.querySelector('#z-fit').getAttribute('aria-pressed'), 'true');
  assert.deepEqual(heights(), [-.9,.9].map(Math.fround));
  const liveVertices = vertices;

  viewer.setBackendGraph(final, 'live-run', {maximising: false});
  frame(16);
  assert.deepEqual(heightMix, [1,0,0]);
  assert.deepEqual(vertices, liveVertices);
  assert.equal(heightLabel.textContent, 'best fitness');
});
