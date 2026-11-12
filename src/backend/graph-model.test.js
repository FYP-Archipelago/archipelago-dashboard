import { test, expect } from 'vitest';
import { applyGraphDelta, emptyGraph, graphFromResult } from './graph-model.js';

const nodes = (ids, islands) => ({
  id: ids,
  island: islands,
  x: ids.map(Number),
  y: ids.map(() => 0),
  z: ids.map(() => 0),
  visits: ids.map(() => 1),
  members: ids.map(() => 2),
  mean_fitness: ids.map(() => 3),
  best_fitness: ids.map(() => 4),
  fitness_percentile: ids.map(() => 50),
  progress: ids.map(() => 0.5),
  first_eval: ids.map(() => 0),
  last_eval: ids.map(() => 1),
  in_degree: ids.map(() => 0),
  out_degree: ids.map(() => 0),
  islands_sharing: ids.map(() => 1),
  island_best: ids.map(() => false),
  overall_best: ids.map(() => false),
  migration_endpoint: ids.map(() => false),
  genome_hash: ids.map((id) => `hash-${id}`),
  weight: null,
});
const edges = (ids, sources, targets) => ({ id: ids, source: sources, target: targets, weight: ids.map(() => 1) });
const migrations = (ids, sources, targets) => ({ id: ids, source: sources, target: targets, count: ids.map(() => 2) });
const changes = (ids, fields) => ({ id: ids, ...fields });
const snapshot = () => ({
  graph: { nodes: nodes([10, 20], [0, 1]), edges: edges([5], [10], [20]), migrations: migrations([7], [10], [20]), overlap: 1.5 },
});
const delta = () => ({
  new_nodes: nodes([], []),
  updated_nodes: changes(
    [],
    Object.fromEntries(
      [
        'x',
        'y',
        'z',
        'visits',
        'members',
        'mean_fitness',
        'best_fitness',
        'progress',
        'first_eval',
        'last_eval',
        'in_degree',
        'out_degree',
        'islands_sharing',
        'migration_endpoint',
      ].map((field) => [field, []])
    )
  ),
  percentiles: changes([], { fitness_percentile: [] }),
  weights: null,
  positions: null,
  removed_nodes: [],
  new_edges: edges([], [], []),
  edge_updates: changes([], { weight: [] }),
  new_migrations: migrations([], [], []),
  migration_updates: changes([], { count: [] }),
  island_best: [10],
  overall_best: 20,
  overlap: 1.5,
});

test('materializes backend columnar result with nullable weights and stable IDs', () => {
  const graph = graphFromResult({
    graph: { nodes: nodes([10, 20], [0, 1]), edges: edges([5], [10], [20]), migrations: migrations([7], [10], [20]), overlap: 1.5 },
  });
  expect(graph.nodes.get(20).genome_hash).toBe('hash-20');
  expect(graph.nodes.get(10).weight).toBe(null);
  expect(graph.edges.get(5).target).toBe(20);
  expect(graph.overlap).toBe(1.5);
});

test('applies delta order, removes incident links and refreshes best markers', () => {
  const start = graphFromResult({
    graph: { nodes: nodes([10, 20], [0, 1]), edges: edges([5], [10], [20]), migrations: migrations([7], [10], [20]), overlap: 1 },
  });
  const delta = {
    new_nodes: nodes([30], [1]),
    updated_nodes: changes([10], {
      x: [6],
      y: [0],
      z: [0],
      visits: [4],
      members: [5],
      mean_fitness: [7],
      best_fitness: [8],
      progress: [0.9],
      first_eval: [0],
      last_eval: [9],
      in_degree: [2],
      out_degree: [3],
      islands_sharing: [1],
      migration_endpoint: [true],
    }),
    percentiles: changes([10], { fitness_percentile: [95] }),
    weights: changes([10], { weight: [0.4] }),
    positions: changes([10], { x: [9], y: [2], z: [1] }),
    removed_nodes: [20],
    new_edges: edges([6], [10], [30]),
    edge_updates: changes([6], { weight: [4] }),
    new_migrations: migrations([8], [10], [30]),
    migration_updates: changes([8], { count: [5] }),
    island_best: [10],
    overall_best: 30,
    overlap: 1.2,
  };
  const next = applyGraphDelta(start, delta);
  expect(start.nodes.size).toBe(2);
  expect(next.nodes.get(10).x).toBe(9);
  expect(next.nodes.get(10).fitness_percentile).toBe(95);
  expect(next.nodes.get(10).weight).toBe(0.4);
  expect(next.nodes.get(10).island_best).toBe(true);
  expect(next.nodes.get(30).overall_best).toBe(true);
  expect(next.nodes.has(20)).toBe(false);
  expect(next.edges.has(5)).toBe(false);
  expect(next.edges.get(6).weight).toBe(4);
  expect(next.migrations.has(7)).toBe(false);
  expect(next.migrations.get(8).count).toBe(5);
});

test('preserves nullable node measurements and arbitrary finite layout coordinates', () => {
  const result = snapshot();
  Object.assign(result.graph.nodes, { x: [-124.5, 1e20], mean_fitness: [null, -12.5], best_fitness: [null, 0], weight: [null, 0.25] });
  const graph = graphFromResult(result);
  expect(graph.nodes.get(10).mean_fitness).toBe(null);
  expect(graph.nodes.get(10).weight).toBe(null);
  expect(graph.nodes.get(20).x).toBe(1e20);
  expect(graph.nodes.get(20).fitness_percentile).toBe(50);
});

test('allows an empty backend delta and nullable overall best on an empty graph', () => {
  const update = delta();
  update.island_best = [];
  update.overall_best = null;
  update.overlap = 0;
  expect(applyGraphDelta(emptyGraph(), update)).toStrictEqual(emptyGraph());
});

test('a delta leaves the previous graph unchanged', () => {
  const previous = graphFromResult(snapshot());
  const update = delta();
  update.positions = changes([10], { x: [-99.5], y: [2], z: [3] });
  update.edge_updates = changes([5], { weight: [10] });
  const next = applyGraphDelta(previous, update);
  expect(next.nodes.get(10).x).toBe(-99.5);
  expect(next.edges.get(5).weight).toBe(10);
  expect(previous.nodes.get(10).x).toBe(10);
  expect(previous.edges.get(5).weight).toBe(1);
});

test('delta preserves nullable fitness and fractional node weights while replacing prior best markers', () => {
  const result = snapshot();
  result.graph.nodes.island_best = [false, true];
  result.graph.nodes.overall_best = [false, true];
  const previous = graphFromResult(result);
  const update = delta();
  update.updated_nodes = changes(
    [10],
    Object.fromEntries(Object.entries(nodes([10], [0])).filter(([field]) => Object.hasOwn(update.updated_nodes, field)))
  );
  update.updated_nodes.mean_fitness = [null];
  update.updated_nodes.best_fitness = [null];
  update.weights = changes([10], { weight: [0.125] });
  update.overall_best = 10;
  const next = applyGraphDelta(previous, update);
  expect(next.nodes.get(10).mean_fitness).toBe(null);
  expect(next.nodes.get(10).best_fitness).toBe(null);
  expect(next.nodes.get(10).weight).toBe(0.125);
  expect(next.nodes.get(10).overall_best).toBe(true);
  expect(next.nodes.get(20).island_best).toBe(false);
  expect(next.nodes.get(20).overall_best).toBe(false);
  expect(previous.nodes.get(20).overall_best).toBe(true);
});
