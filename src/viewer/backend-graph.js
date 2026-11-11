// Adapt the backend's already clustered graph to the original WebGL viewer.
// IDs stay in `nodes` so a live rebuild can restore the selected node.
export function remapBackendAnchor(previousNodes, nextIndex, offset) {
  const id = previousNodes?.[offset]?.id;
  return id === undefined ? -1 : (nextIndex.get(id) ?? -1);
}

export function backendViewerGraph(graph, { maximising } = {}) {
  const nodes = [...graph.nodes.values()].sort((a, b) => a.id - b.id);
  const islandIds = [...new Set(nodes.map((node) => node.island))].sort((a, b) => a - b);
  const groups = new Map(islandIds.map((id, index) => [id, index]));
  const idIndex = new Map(nodes.map((node, index) => [node.id, index]));
  const n = nodes.length,
    ng = islandIds.length;
  // Display scaling only: retain the backend's fitness values and best flags.
  let lo = Infinity,
    hi = -Infinity;
  for (const node of nodes)
    if (Number.isFinite(node.best_fitness)) {
      lo = Math.min(lo, node.best_fitness);
      hi = Math.max(hi, node.best_fitness);
    }
  const bestPct = new Float32Array(n);
  const bestHeightAvailable = typeof maximising === 'boolean' && Number.isFinite(lo);
  const span = hi - lo;
  const px = new Float32Array(n),
    py = new Float32Array(n),
    pz = new Float32Array(n);
  const pf = new Float32Array(n),
    pct = new Float32Array(n),
    pg = new Float32Array(n);
  const pGrp = new Uint8Array(n),
    pVis = new Float32Array(n),
    pShared = new Float32Array(n);
  const pIn = new Int32Array(n),
    pOut = new Int32Array(n);
  const bestOfGroup = new Int32Array(ng).fill(-1),
    bestOfRun = new Int32Array(1).fill(-1);
  for (let i = 0; i < n; i++) {
    const node = nodes[i],
      g = groups.get(node.island);
    px[i] = node.x;
    py[i] = node.y;
    pz[i] = node.z;
    pf[i] = node.mean_fitness ?? NaN;
    pct[i] = node.fitness_percentile ?? 0.5;
    pg[i] = node.progress ?? 0;
    bestPct[i] =
      Number.isFinite(node.best_fitness) && bestHeightAvailable
        ? span === 0
          ? 0
          : maximising
            ? (hi - node.best_fitness) / span
            : (node.best_fitness - lo) / span
        : 0.5;
    pGrp[i] = g;
    pVis[i] = node.visits || 0;
    pShared[i] = ng > 1 ? Math.max(0, (node.islands_sharing - 1) / (ng - 1)) : 0;
    pIn[i] = node.in_degree || 0;
    pOut[i] = node.out_degree || 0;
    if (node.island_best) bestOfGroup[g] = i;
    if (node.overall_best) bestOfRun[0] = i;
  }
  const edges = [...graph.edges.values()].filter((edge) => idIndex.has(edge.source) && idIndex.has(edge.target));
  const e = new Int32Array(edges.length * 2),
    ew = new Float32Array(edges.length);
  let maxW = 1;
  edges.forEach((edge, i) => {
    e[i * 2] = idIndex.get(edge.source);
    e[i * 2 + 1] = idIndex.get(edge.target);
    ew[i] = edge.weight || 0;
    maxW = Math.max(maxW, ew[i]);
  });
  const routes = [],
    routeIndex = new Map(),
    mig = [];
  for (const migration of graph.migrations.values()) {
    const a = idIndex.get(migration.source),
      b = idIndex.get(migration.target);
    if (a === undefined || b === undefined) continue;
    const sg = pGrp[a],
      dg = pGrp[b],
      key = `${sg}:${dg}`;
    if (!routeIndex.has(key)) {
      routeIndex.set(key, routes.length);
      routes.push({ sg, dg });
    }
    mig.push({ a, b, sg, dg, route: routeIndex.get(key), count: migration.count || 0 });
  }
  const G = {
    nodeCount: n,
    edgeCount: edges.length,
    px,
    py,
    pz,
    pf,
    pct,
    pg,
    pGrp,
    pVis,
    pShared,
    bestPct,
    bestHeightAvailable,
    pIn,
    pOut,
    e,
    ew,
    maxW,
    mig,
    routes,
    bestOfGroup,
    bestOfRun,
    overlap: graph.overlap || 0,
    nodes,
  };
  const DS = {
    isl: ng,
    islandIds,
    gIsl: Uint8Array.from(islandIds.map((_, i) => i)),
  };
  return { G, DS, idIndex };
}
