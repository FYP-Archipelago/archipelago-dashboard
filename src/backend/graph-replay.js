// The saved result has node first-evaluation indices but only aggregate migration
// routes. Replay is an illustrative reveal, not a record of migration timestamps.
export function replayOrder(graph) {
  const nodes=[...graph.nodes.values()].sort((a,b)=>(a.first_eval??Infinity)-(b.first_eval??Infinity)||a.id-b.id);
  const firstByIsland=new Map();
  for(const node of nodes)if(!firstByIsland.has(node.island))firstByIsland.set(node.island,node.id);
  const initial=new Set(firstByIsland.values());
  return {initial,remaining:nodes.filter(node=>!initial.has(node.id)).map(node=>node.id)};
}

export function graphAtReplayProgress(graph,order,progress) {
  if(progress>=1)return graph;
  const fraction=Math.max(0,Math.min(1,progress));
  const visible=new Set(order.initial);
  for(const id of order.remaining.slice(0,Math.floor(fraction*order.remaining.length)))visible.add(id);
  const nodes=new Map([...graph.nodes].filter(([id])=>visible.has(id)));
  const endpoints=([,link])=>visible.has(link.source)&&visible.has(link.target);
  return {...graph,nodes,
    edges:new Map([...graph.edges].filter(endpoints)),
    migrations:new Map([...graph.migrations].filter(endpoints))};
}
