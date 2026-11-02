// Backend graph tables are columnar. IDs are stable across updates; array offsets are not.
function rows(table, fields) {
  if (!table || !Array.isArray(table.id)) throw Error('Backend graph is missing IDs.');
  return table.id.map((id, index) => {
    const row = {id};
    for (const field of fields) {
      if (field === 'weight' && table.weight === null) { row.weight = null; continue; }
      if (!Array.isArray(table[field]) || index >= table[field].length) throw Error(`Backend graph is missing ${field}.`);
      row[field] = table[field][index];
    }
    return row;
  });
}

export const NODE_FIELDS = ['island','x','y','z','visits','members','mean_fitness','best_fitness','fitness_percentile','progress','first_eval','last_eval','in_degree','out_degree','islands_sharing','island_best','overall_best','migration_endpoint','genome_hash','weight'];
const EDGE_FIELDS = ['source','target','weight'];
const MIGRATION_FIELDS = ['source','target','count'];

export function emptyGraph() { return {nodes:new Map(),edges:new Map(),migrations:new Map(),overlap:0}; }

export function graphFromResult(result) {
  if (!result?.graph) throw Error('Backend result has no graph.');
  const {nodes,edges,migrations,overlap} = result.graph;
  return {
    nodes:new Map(rows(nodes,NODE_FIELDS).map(row=>[row.id,row])),
    edges:new Map(rows(edges,EDGE_FIELDS).map(row=>[row.id,row])),
    migrations:new Map(rows(migrations,MIGRATION_FIELDS).map(row=>[row.id,row])),
    overlap,
  };
}

function overwrite(map, table, fields) {
  for (const row of rows(table,fields)) {
    const old = map.get(row.id);
    if (old) map.set(row.id,{...old,...row});
  }
}

export function applyGraphDelta(previous, delta) {
  if (!delta) throw Error('Backend update has no graph delta.');
  const graph = {nodes:new Map(previous.nodes),edges:new Map(previous.edges),migrations:new Map(previous.migrations),overlap:delta.overlap};
  for (const row of rows(delta.new_nodes,NODE_FIELDS)) graph.nodes.set(row.id,row);
  overwrite(graph.nodes,delta.updated_nodes,['x','y','z','visits','members','mean_fitness','best_fitness','progress','first_eval','last_eval','in_degree','out_degree','islands_sharing','migration_endpoint']);
  overwrite(graph.nodes,delta.percentiles,['fitness_percentile']);
  if (delta.weights) overwrite(graph.nodes,delta.weights,['weight']);
  if (delta.positions) overwrite(graph.nodes,delta.positions,['x','y','z']);
  for (const id of delta.removed_nodes) graph.nodes.delete(id);
  for (const map of [graph.edges,graph.migrations]) for (const [id,row] of map) {
    if (!graph.nodes.has(row.source) || !graph.nodes.has(row.target)) map.delete(id);
  }
  for (const row of rows(delta.new_edges,EDGE_FIELDS)) graph.edges.set(row.id,row);
  for (const row of rows(delta.new_migrations,MIGRATION_FIELDS)) graph.migrations.set(row.id,row);
  overwrite(graph.edges,delta.edge_updates,['weight']);
  overwrite(graph.migrations,delta.migration_updates,['count']);
  const previousBest = new Set([...previous.nodes.values()].filter(row=>row.island_best||row.overall_best).map(row=>row.id));
  const nextBest = new Set([...delta.island_best,delta.overall_best]);
  for (const id of new Set([...previousBest,...nextBest,...delta.new_nodes.id])) {
    const row=graph.nodes.get(id);
    if(row) graph.nodes.set(id,{...row,island_best:delta.island_best.includes(id),overall_best:id===delta.overall_best});
  }
  return graph;
}
