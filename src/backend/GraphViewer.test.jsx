import { test, expect } from 'vitest';
import { render, runId, click, button, input } from '../test/test-utils.js';
import { emptyGraph } from './graph-model.js';
import Viewer from './GraphViewer.jsx';
test('empty and switched runs destroy old geometry, while live updates retain the viewer', async () => {
  let created = 0,
    destroyed = 0,
    updates = 0;
  const mountViewer = () => {
    created++;
    return {
      destroy() {
        destroyed++;
      },
      setBackendGraph() {
        updates++;
      },
    };
  };
  const full = { ...emptyGraph(), nodes: new Map([[1, { id: 1 }]]) };
  const props = { runId, graph: full, mountViewer };
  const view = await render(<Viewer {...props} />);
  expect(created).toBe(1);
  await view.rerender(<Viewer {...props} graph={{ ...full }} />);
  expect(created).toBe(1);
  await view.rerender(<Viewer {...props} graph={emptyGraph()} />);
  expect(destroyed).toBe(1);
  expect(document.body.textContent).toMatch(/No graph nodes/);
  await view.rerender(<Viewer {...props} graph={full} />);
  expect(created).toBe(2);
  await view.rerender(<Viewer {...props} runId="other" />);
  expect(destroyed).toBe(2);
  expect(created).toBe(3);
  expect(updates >= 3).toBeTruthy();
});
test('saved result can be replayed from initial island nodes and returned to the full graph', async () => {
  const shown = [],
    objectives = [];
  const mountViewer = (root) => {
    root.innerHTML = '<div class="rail-foot"><button>Reset all</button><button>Save image</button></div>';
    return {
      destroy() {
        root.innerHTML = '';
      },
      setBackendGraph(graph, options) {
        shown.push(graph);
        objectives.push(options.maximising);
      },
    };
  };
  const graph = {
    ...emptyGraph(),
    nodes: new Map([
      [1, { id: 1, island: 0, first_eval: 0 }],
      [2, { id: 2, island: 1, first_eval: 0 }],
      [3, { id: 3, island: 0, first_eval: 12 }],
    ]),
    edges: new Map([[10, { id: 10, source: 1, target: 3 }]]),
    migrations: new Map([[20, { id: 20, source: 2, target: 3, count: 4 }]]),
  };
  await render(<Viewer runId={runId} graph={graph} canReplay={true} maximising={true} mountViewer={mountViewer} />);
  expect(objectives.at(-1)).toBe(true);
  expect(document.querySelector('.run-replay').classList.contains('idle')).toBeTruthy();
  const footer = document.querySelector('.rail-foot');
  expect(footer.contains(button('Replay run'))).toBeTruthy();
  expect(footer.lastElementChild.contains(button('Replay run'))).toBeTruthy();
  await click(button('Replay run'));
  expect(document.querySelector('.run-replay').classList.contains('active')).toBeTruthy();
  expect([...shown.at(-1).nodes.keys()]).toStrictEqual([1, 2]);
  expect(shown.at(-1).migrations.size).toBe(0);
  expect(document.body.textContent).toMatch(/migration timing is unavailable/);
  await input('replay-progress', '100');
  expect(shown.at(-1).migrations.size).toBe(1);
  await input('replay-progress', '0');
  expect(shown.at(-1).migrations.size).toBe(0);
  await input('replay-speed', '2');
  expect(document.querySelector('[name="replay-speed"]').value).toBe('2');
  await click(button('Play'));
  expect(button('Pause')).toBeTruthy();
  await click(button('Pause'));
  expect(button('Play')).toBeTruthy();
  await click(button('Show full graph'));
  expect(shown.at(-1)).toBe(graph);
  expect(button('Replay run')).toBeTruthy();
  expect(document.querySelector('.run-replay').classList.contains('idle')).toBeTruthy();
});
