import { describe, expect, it } from 'vitest';

import type { GraphDelta, GraphNodes } from '@/types.ts';

import { applyDelta, emptyLiveGraph, liveGraphColumns } from './graph.ts';

const nodes = (ids: number[], island = 0): GraphNodes => ({
  id: ids,
  island: ids.map(() => island),
  x: ids.map(() => 0),
  y: ids.map(() => 0),
  z: ids.map(() => 0),
  visits: ids.map(() => 1),
  members: ids.map(() => 1),
  mean_fitness: ids.map(() => 10),
  best_fitness: ids.map(() => 10),
  fitness_percentile: ids.map(() => 0.5),
  progress: ids.map(() => 0),
  first_eval: ids.map(() => 0),
  last_eval: ids.map(() => 0),
  in_degree: ids.map(() => 0),
  out_degree: ids.map(() => 0),
  islands_sharing: ids.map(() => 1),
  island_best: ids.map(() => false),
  overall_best: ids.map(() => false),
  migration_endpoint: ids.map(() => false),
  genome_hash: ids.map(String),
  weight: null,
});

// An empty table of changes; the empty id column means every other column is empty too.
const none = { id: [] } as never;

const delta = (change: Partial<GraphDelta>): GraphDelta => ({
  new_nodes: nodes([]),
  updated_nodes: none,
  percentiles: none,
  weights: null,
  removed_nodes: [],
  positions: null,
  new_edges: { id: [], source: [], target: [], weight: [] },
  edge_updates: none,
  new_migrations: { id: [], source: [], target: [], count: [] },
  migration_updates: none,
  island_best: [],
  overall_best: null,
  overlap: 1,
  ...change,
});

describe('applyDelta', () => {
  it('applies updates in the order the stream defines, so a removed node takes its links with it before new ones arrive', () => {
    let graph = applyDelta(
      emptyLiveGraph(),
      delta({
        new_nodes: nodes([1, 2, 3]),
        new_edges: { id: [10, 11], source: [1, 2], target: [2, 3], weight: [1, 1] },
        new_migrations: { id: [20], source: [3], target: [1], count: [2] },
        island_best: [3],
        overall_best: 3,
      })
    );
    graph = applyDelta(
      graph,
      delta({
        new_nodes: nodes([4]),
        updated_nodes: { id: [2], x: [0.5], y: [0], z: [0], visits: [7] } as unknown as GraphDelta['updated_nodes'],
        removed_nodes: [3],
        // Edge 12 is new in the same update, to a node added in it; edge 11 and migration 20 touched node 3.
        new_edges: { id: [12], source: [2], target: [4], weight: [1] },
        edge_updates: { id: [10], weight: [5] },
        island_best: [4],
        overall_best: 4,
      })
    );
    const columns = liveGraphColumns(graph);

    expect(columns.nodes.id).toEqual([1, 2, 4]);
    expect(columns.nodes.visits).toEqual([1, 7, 1]);
    expect(columns.nodes.x).toEqual([0, 0.5, 0]);
    expect(columns.edges).toEqual({ id: [10, 12], source: [1, 2], target: [2, 4], weight: [5, 1] });
    expect(columns.migrations.id).toEqual([]);
    // The bests come whole with each update: node 4 gains both flags and nothing else keeps one.
    expect(columns.nodes.island_best).toEqual([false, false, true]);
    expect(columns.nodes.overall_best).toEqual([false, false, true]);
  });
});
