import {migrationVisible} from '../viewer/visibility.js';

export function visibleGraph(graph,{hiddenIslands=new Set(),showEdges=true,showMigrations=true,includeHiddenPaths=false}={}) {
  const nodes=[...graph.nodes.values()].filter(node=>!hiddenIslands.has(node.island));
  const visible=new Set(nodes.map(node=>node.id));
  const edges=showEdges?[...graph.edges.values()].filter(edge=>visible.has(edge.source)&&visible.has(edge.target)):[];
  const migrations=showMigrations?[...graph.migrations.values()].filter(edge=>migrationVisible({sourceVisible:visible.has(edge.source),targetVisible:visible.has(edge.target),includeHiddenPaths})):[];
  return {nodes,edges,migrations};
}
