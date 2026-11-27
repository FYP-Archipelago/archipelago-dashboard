import type { Graph, GraphDelta, GraphEdges, GraphMigrations, GraphNodes } from '@/types.ts';

type NodeRow = { [K in keyof GraphNodes]: GraphNodes[K] extends (infer V)[] | null ? V : never };
type EdgeRow = { id: number; source: number; target: number; weight: number };
type MigrationRow = { id: number; source: number; target: number; count: number };

// A streamed graph keyed by id, since updates name rows by id and their positions in the columns shift.
type LiveGraph = {
  nodes: Map<number, NodeRow>;
  edges: Map<number, EdgeRow>;
  migrations: Map<number, MigrationRow>;
  overlap: number;
};

export const emptyLiveGraph = (): LiveGraph => ({ nodes: new Map(), edges: new Map(), migrations: new Map(), overlap: 0 });

function rows<T>(table: { id: number[] } & Partial<Record<string, unknown[] | null>>): T[] {
  const fields = Object.keys(table).filter((key) => Array.isArray(table[key]));
  return table.id.map((id, i) => Object.fromEntries([['id', id], ...fields.map((key) => [key, table[key]![i]])]) as T);
}

function overwrite<T extends { id: number }>(map: Map<number, T>, table: { id: number[] } & Partial<Record<string, unknown[] | null>>) {
  for (const row of rows<Partial<T> & { id: number }>(table)) {
    const current = map.get(row.id);
    if (current) map.set(row.id, { ...current, ...row });
  }
}

export function applyDelta(previous: LiveGraph, delta: GraphDelta): LiveGraph {
  const graph: LiveGraph = {
    nodes: new Map(previous.nodes),
    edges: new Map(previous.edges),
    migrations: new Map(previous.migrations),
    overlap: delta.overlap,
  };
  // Without DenStream new nodes carry weight null for the whole column; rows() skips it and the row gets null here.
  for (const row of rows<NodeRow>(delta.new_nodes)) graph.nodes.set(row.id, { ...row, weight: row.weight ?? null });
  overwrite(graph.nodes, delta.updated_nodes);
  overwrite(graph.nodes, delta.percentiles);
  if (delta.weights) overwrite(graph.nodes, delta.weights);
  if (delta.positions) overwrite(graph.nodes, delta.positions);
  for (const id of delta.removed_nodes) graph.nodes.delete(id);
  for (const links of [graph.edges, graph.migrations])
    for (const [id, link] of links) if (!graph.nodes.has(link.source) || !graph.nodes.has(link.target)) links.delete(id);
  for (const row of rows<EdgeRow>(delta.new_edges)) graph.edges.set(row.id, row);
  for (const row of rows<MigrationRow>(delta.new_migrations)) graph.migrations.set(row.id, row);
  overwrite(graph.edges, delta.edge_updates);
  overwrite(graph.migrations, delta.migration_updates);
  // The bests are sent whole each time, so every node's flags are set from this update's lists.
  const islandBest = new Set(delta.island_best);
  for (const [id, row] of graph.nodes) {
    const island_best = islandBest.has(id);
    const overall_best = id === delta.overall_best;
    if (row.island_best !== island_best || row.overall_best !== overall_best) graph.nodes.set(id, { ...row, island_best, overall_best });
  }
  return graph;
}

function columns<T extends object>(list: T[], keys: (keyof T)[]): Record<keyof T, unknown[]> {
  return Object.fromEntries(keys.map((key) => [key, list.map((row) => row[key])])) as Record<keyof T, unknown[]>;
}

const NODE_KEYS: (keyof NodeRow)[] = [
  'id',
  'island',
  'x',
  'y',
  'z',
  'visits',
  'members',
  'mean_fitness',
  'best_fitness',
  'fitness_percentile',
  'progress',
  'first_eval',
  'last_eval',
  'in_degree',
  'out_degree',
  'islands_sharing',
  'island_best',
  'overall_best',
  'faded',
  'migration_endpoint',
  'genome_hash',
  'weight',
];

// The same columns a finished run's result has, so the network draws a live run and a finished one alike.
export function liveGraphColumns(graph: LiveGraph): Graph {
  const byId = <T extends { id: number }>(map: Map<number, T>) => [...map.values()].sort((a, b) => a.id - b.id);
  const nodes = byId(graph.nodes);
  return {
    nodes: columns(nodes, NODE_KEYS) as unknown as GraphNodes,
    edges: columns(byId(graph.edges), ['id', 'source', 'target', 'weight']) as unknown as GraphEdges,
    migrations: columns(byId(graph.migrations), ['id', 'source', 'target', 'count']) as unknown as GraphMigrations,
    overlap: graph.overlap,
  };
}
