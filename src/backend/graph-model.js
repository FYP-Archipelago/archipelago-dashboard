// Backend graph tables are columnar. IDs are stable across updates; array offsets are not.
const finite = value => typeof value === 'number' && Number.isFinite(value);
const nullableFinite = value => value === null || finite(value);
const identifier = value => Number.isSafeInteger(value) && value >= 0;
const integerFields = new Set(['island','visits','members','first_eval','last_eval','in_degree','out_degree','islands_sharing','count']);
const booleanFields = new Set(['island_best','overall_best','migration_endpoint']);

function ids(values, name) {
  if (!Array.isArray(values)) throw Error(`Backend graph is missing ${name} IDs.`);
  const seen = new Set();
  for (const id of values) {
    if (!identifier(id)) throw Error(`Backend graph has an invalid ${name} ID.`);
    if (seen.has(id)) throw Error(`Backend graph has a duplicate ${name} ID.`);
    seen.add(id);
  }
  return values;
}

function validField(field, value, nodeWeight) {
  if (field === 'source' || field === 'target') return identifier(value);
  if (integerFields.has(field)) return Number.isSafeInteger(value);
  if (booleanFields.has(field)) return typeof value === 'boolean';
  if (field === 'genome_hash') return typeof value === 'string';
  if (field === 'mean_fitness' || field === 'best_fitness' || (field === 'weight' && nodeWeight)) return nullableFinite(value);
  if (field === 'weight') return Number.isSafeInteger(value);
  return finite(value);
}

function rows(table, fields, {nodeWeight = false, weightChanges = false} = {}) {
  if (!table || typeof table !== 'object' || Array.isArray(table)) throw Error('Backend graph has an invalid table.');
  ids(table.id,'table');
  for (const field of fields) {
    if (field === 'weight' && nodeWeight && table.weight === null) continue;
    if (!Array.isArray(table[field]) || table[field].length !== table.id.length) throw Error(`Backend graph has a missing or mismatched ${field} column.`);
  }
  return Array.from(table.id, (id, index) => {
    const row = {id};
    for (const field of fields) {
      const value = field === 'weight' && nodeWeight && table.weight === null ? null : table[field][index];
      if (!(field === 'weight' && weightChanges ? finite(value) : validField(field,value,nodeWeight))) throw Error(`Backend graph has an invalid ${field} value.`);
      row[field] = value;
    }
    return row;
  });
}

export const NODE_FIELDS = ['island','x','y','z','visits','members','mean_fitness','best_fitness','fitness_percentile','progress','first_eval','last_eval','in_degree','out_degree','islands_sharing','island_best','overall_best','migration_endpoint','genome_hash','weight'];
const EDGE_FIELDS = ['source','target','weight'];
const MIGRATION_FIELDS = ['source','target','count'];
const UPDATED_NODE_FIELDS = ['x','y','z','visits','members','mean_fitness','best_fitness','progress','first_eval','last_eval','in_degree','out_degree','islands_sharing','migration_endpoint'];

function requireReference(map, id, name) {
  if (!identifier(id) || !map.has(id)) throw Error(`Backend graph has an unknown ${name} ID.`);
}

function add(map, table, fields, nodes, options) {
  for (const row of rows(table,fields,options)) {
    if (map.has(row.id)) throw Error('Backend graph reuses an existing ID.');
    if (nodes) {
      requireReference(nodes,row.source,'source');
      requireReference(nodes,row.target,'target');
    }
    map.set(row.id,row);
  }
}

export function emptyGraph() { return {nodes:new Map(),edges:new Map(),migrations:new Map(),overlap:0}; }

export function graphFromResult(result) {
  if (!result?.graph) throw Error('Backend result has no graph.');
  const {nodes,edges,migrations,overlap} = result.graph;
  if (!finite(overlap)) throw Error('Backend graph has an invalid overlap.');
  const graph = {...emptyGraph(),overlap};
  add(graph.nodes,nodes,NODE_FIELDS,null,{nodeWeight:true});
  add(graph.edges,edges,EDGE_FIELDS,graph.nodes);
  add(graph.migrations,migrations,MIGRATION_FIELDS,graph.nodes);
  return graph;
}

function overwrite(map, table, fields, options) {
  for (const row of rows(table,fields,options)) {
    requireReference(map,row.id,'updated');
    map.set(row.id,{...map.get(row.id),...row});
  }
}

export function applyGraphDelta(previous, delta) {
  if (!delta) throw Error('Backend update has no graph delta.');
  if (!finite(delta.overlap)) throw Error('Backend graph has an invalid overlap.');
  const graph = {nodes:new Map(previous.nodes),edges:new Map(previous.edges),migrations:new Map(previous.migrations),overlap:delta.overlap};
  add(graph.nodes,delta.new_nodes,NODE_FIELDS,null,{nodeWeight:true});
  overwrite(graph.nodes,delta.updated_nodes,UPDATED_NODE_FIELDS);
  overwrite(graph.nodes,delta.percentiles,['fitness_percentile']);
  if (delta.weights !== null) overwrite(graph.nodes,delta.weights,['weight'],{weightChanges:true});
  if (delta.positions !== null) overwrite(graph.nodes,delta.positions,['x','y','z']);
  for (const id of ids(delta.removed_nodes,'removed')) {
    requireReference(graph.nodes,id,'removed');
    graph.nodes.delete(id);
  }
  for (const map of [graph.edges,graph.migrations]) for (const [id,row] of map) {
    if (!graph.nodes.has(row.source) || !graph.nodes.has(row.target)) map.delete(id);
  }
  add(graph.edges,delta.new_edges,EDGE_FIELDS,graph.nodes);
  add(graph.migrations,delta.new_migrations,MIGRATION_FIELDS,graph.nodes);
  overwrite(graph.edges,delta.edge_updates,['weight']);
  overwrite(graph.migrations,delta.migration_updates,['count']);
  const islandBest = new Set(ids(delta.island_best,'island best'));
  for (const id of islandBest) requireReference(graph.nodes,id,'island best');
  if (delta.overall_best !== null) requireReference(graph.nodes,delta.overall_best,'overall best');
  const previousBest = new Set([...previous.nodes.values()].filter(row=>row.island_best||row.overall_best).map(row=>row.id));
  const nextBest = new Set([...delta.island_best,delta.overall_best]);
  for (const id of new Set([...previousBest,...nextBest,...delta.new_nodes.id])) {
    const row=graph.nodes.get(id);
    if(row) graph.nodes.set(id,{...row,island_best:islandBest.has(id),overall_best:id===delta.overall_best});
  }
  return graph;
}
