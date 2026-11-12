import { test, expect } from 'vitest';
import { graphAtReplayProgress, replayOrder } from './graph-replay.js';

test('replay starts with one early node per island and reveals links only after both endpoints exist', () => {
  const nodes = new Map([
    [4, { id: 4, island: 1, first_eval: 20 }],
    [2, { id: 2, island: 0, first_eval: 0 }],
    [3, { id: 3, island: 1, first_eval: 0 }],
    [1, { id: 1, island: 0, first_eval: 10 }],
  ]);
  const graph = {
    nodes,
    edges: new Map([
      [10, { id: 10, source: 2, target: 1 }],
      [11, { id: 11, source: 3, target: 4 }],
    ]),
    migrations: new Map([[20, { id: 20, source: 1, target: 4, count: 8 }]]),
    overlap: 1,
  };
  const order = replayOrder(graph);
  expect([...order.initial]).toStrictEqual([2, 3]);
  const start = graphAtReplayProgress(graph, order, 0);
  expect([...start.nodes.keys()]).toStrictEqual([2, 3]);
  expect(start.edges.size).toBe(0);
  expect(start.migrations.size).toBe(0);
  const middle = graphAtReplayProgress(graph, order, 0.5);
  expect([...middle.nodes.keys()]).toStrictEqual([2, 3, 1]);
  expect([...middle.edges.keys()]).toStrictEqual([10]);
  expect(middle.migrations.size).toBe(0);
  expect(graphAtReplayProgress(graph, order, 1)).toBe(graph);
  expect(graph.migrations.get(20).count).toBe(8);
});
