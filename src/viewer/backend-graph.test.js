import test from 'node:test';
import assert from 'node:assert/strict';
import { backendViewerGraph, remapBackendAnchor } from './backend-graph.js';

test('camera anchors retain stable backend IDs when preceding nodes disappear', () => {
  const old = [{ id: 10 }, { id: 20 }, { id: 30 }];
  const next = new Map([
    [20, 0],
    [30, 1],
  ]);
  assert.equal(remapBackendAnchor(old, next, 2), 1);
  assert.equal(remapBackendAnchor(old, next, 1), 0);
  assert.equal(remapBackendAnchor(old, next, 0), -1);
  assert.equal(remapBackendAnchor(old, next, -1), -1);
});

test('backend graph keeps stable IDs, island labels, best markers and migration counts', () => {
  const nodes = new Map([
    [
      72,
      {
        id: 72,
        island: 5,
        x: 0.2,
        y: 0.3,
        z: 0.4,
        mean_fitness: 8,
        best_fitness: 7,
        fitness_percentile: 0.25,
        progress: 0.8,
        visits: 4,
        members: 3,
        islands_sharing: 2,
        island_best: true,
        overall_best: true,
        genome_hash: 'h72',
      },
    ],
    [
      13,
      {
        id: 13,
        island: 2,
        x: -0.5,
        y: 0.1,
        z: 0,
        mean_fitness: 12,
        best_fitness: 10,
        fitness_percentile: 0.9,
        progress: 0.1,
        visits: 1,
        members: 1,
        islands_sharing: 1,
        island_best: true,
        overall_best: false,
        genome_hash: 'h13',
      },
    ],
  ]);
  const graph = {
    nodes,
    edges: new Map([[1, { id: 1, source: 13, target: 72, weight: 3 }]]),
    migrations: new Map([[2, { id: 2, source: 13, target: 72, count: 9 }]]),
    overlap: 1.5,
  };
  const { G, DS, idIndex } = backendViewerGraph(graph);
  assert.deepEqual(DS.islandIds, [2, 5]);
  assert.equal(idIndex.get(72), 1);
  assert.deepEqual([...G.e], [0, 1]);
  assert.ok(Math.abs(G.pz[1] - 0.4) < 1e-6);
  assert.ok(Math.abs(G.pct[1] - 0.25) < 1e-6);
  assert.deepEqual([...G.bestOfGroup], [0, 1]);
  assert.equal(G.bestOfRun[0], 1);
  assert.equal(G.mig[0].count, 9);
  assert.equal(G.nodes[1].genome_hash, 'h72');
});

test('best fitness height agrees with run best despite worse cluster mean, and preserves ties', () => {
  for (const maximising of [false, true]) {
    const best = maximising ? 100 : 32.236880940830986;
    const worse = maximising ? 80 : 70;
    const nodes = new Map([
      [
        233,
        { id: 233, island: 0, best_fitness: best, mean_fitness: 312.0987587053001, fitness_percentile: 0.666, overall_best: true, island_best: true },
      ],
      [1493, { id: 1493, island: 4, best_fitness: best, mean_fitness: 188.7754364814985, fitness_percentile: 0.572, island_best: true }],
      [1500, { id: 1500, island: 4, best_fitness: worse, mean_fitness: worse, fitness_percentile: 0.1 }],
    ]);
    const { G } = backendViewerGraph({ nodes, edges: new Map(), migrations: new Map() }, { maximising });
    assert.equal(G.bestHeightAvailable, true);
    assert.deepEqual([...G.bestPct], [0, 0, 1]);
    assert.ok(G.pct[0] > G.pct[2], 'Mean ordering remains available independently');
    assert.equal(G.bestOfRun[0], 0);
    assert.equal(G.nodes[0].best_fitness, best, 'Display does not alter supplied fitness');
  }
});

test('best height requires an explicit objective and handles equal or missing fitness', () => {
  const graph = {
    nodes: new Map([
      [0, { id: 0, island: 0, best_fitness: 7 }],
      [1, { id: 1, island: 1, best_fitness: 7 }],
      [2, { id: 2, island: 1, best_fitness: null }],
    ]),
    edges: new Map(),
    migrations: new Map(),
  };
  assert.equal(backendViewerGraph(graph).G.bestHeightAvailable, false);
  assert.deepEqual([...backendViewerGraph(graph, { maximising: false }).G.bestPct], [0, 0, 0.5]);
});
