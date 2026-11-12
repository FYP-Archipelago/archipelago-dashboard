// Backend graph tables are columnar. IDs are stable across updates; array offsets are not.
function rows(table, fields, { nodeWeight = false } = {}) {
  return Array.from(table.id, (id, index) => {
    const row = { id };
    for (const field of fields) row[field] = field === 'weight' && nodeWeight && table.weight === null ? null : table[field][index];
    return row;
  });
}

const NODE_FIELDS = [
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
  'migration_endpoint',
  'genome_hash',
  'weight',
];
const EDGE_FIELDS = ['source', 'target', 'weight'];
const MIGRATION_FIELDS = ['source', 'target', 'count'];
const UPDATED_NODE_FIELDS = [
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
];

function add(map, table, fields, options) {
  for (const row of rows(table, fields, options)) map.set(row.id, row);
}

export function emptyGraph() {
  return { nodes: new Map(), edges: new Map(), migrations: new Map(), overlap: 0 };
}

export function graphFromResult(result) {
  const { nodes, edges, migrations, overlap } = result.graph;
  const graph = { ...emptyGraph(), overlap };
  add(graph.nodes, nodes, NODE_FIELDS, { nodeWeight: true });
  add(graph.edges, edges, EDGE_FIELDS);
  add(graph.migrations, migrations, MIGRATION_FIELDS);
  return graph;
}

function overwrite(map, table, fields, options) {
  for (const row of rows(table, fields, options)) map.set(row.id, { ...map.get(row.id), ...row });
}

export function applyGraphDelta(previous, delta) {
  const graph = { nodes: new Map(previous.nodes), edges: new Map(previous.edges), migrations: new Map(previous.migrations), overlap: delta.overlap };
  add(graph.nodes, delta.new_nodes, NODE_FIELDS, { nodeWeight: true });
  overwrite(graph.nodes, delta.updated_nodes, UPDATED_NODE_FIELDS);
  overwrite(graph.nodes, delta.percentiles, ['fitness_percentile']);
  if (delta.weights !== null) overwrite(graph.nodes, delta.weights, ['weight']);
  if (delta.positions !== null) overwrite(graph.nodes, delta.positions, ['x', 'y', 'z']);
  for (const id of delta.removed_nodes) graph.nodes.delete(id);
  for (const map of [graph.edges, graph.migrations])
    for (const [id, row] of map) {
      if (!graph.nodes.has(row.source) || !graph.nodes.has(row.target)) map.delete(id);
    }
  add(graph.edges, delta.new_edges, EDGE_FIELDS);
  add(graph.migrations, delta.new_migrations, MIGRATION_FIELDS);
  overwrite(graph.edges, delta.edge_updates, ['weight']);
  overwrite(graph.migrations, delta.migration_updates, ['count']);
  const islandBest = new Set(delta.island_best);
  const previousBest = new Set([...previous.nodes.values()].filter((row) => row.island_best || row.overall_best).map((row) => row.id));
  const nextBest = new Set([...delta.island_best, delta.overall_best]);
  for (const id of new Set([...previousBest, ...nextBest, ...delta.new_nodes.id])) {
    const row = graph.nodes.get(id);
    if (row) graph.nodes.set(id, { ...row, island_best: islandBest.has(id), overall_best: id === delta.overall_best });
  }
  return graph;
}
