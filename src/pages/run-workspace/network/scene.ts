import { maxOf } from '@/math.ts';
import { routeKey } from '@/pages/run-workspace/shared.tsx';
import type { Graph } from '@/types.ts';

export const HEIGHTS = {
  fitness: { label: 'Best fitness', detail: 'Better clusters sit lower', top: 'Worse', bottom: 'Better' },
  mean: { label: 'Mean fitness', detail: 'The average evaluation in the cluster', top: 'Worse', bottom: 'Better' },
  time: { label: 'Search progress', detail: 'How far into its island’s budget', top: 'Later', bottom: 'Earlier' },
  // The genome layout's third axis, so the network is a true 3D map of how alike the genomes are.
  genome: { label: 'Genome depth', detail: 'Similar genomes sit at similar heights', top: null, bottom: null },
  flat: { label: 'Flat', detail: 'Every cluster on one plane', top: null, bottom: null },
} as const;

export type HeightMode = keyof typeof HEIGHTS;

type Route = { source: number; destination: number; migrants: number };

// One graph prepared for drawing: cluster i is position i in every array.
export type Scene = {
  count: number;
  ids: number[];
  index: Map<number, number>;
  islands: number[];
  // Clusters per island, in `islands` order.
  clusters: number[];
  // The island's position in `islands`, which picks its colour and its place on the ring when grouped.
  slot: Uint8Array;
  x: Float32Array;
  y: Float32Array;
  heights: Record<HeightMode, Float32Array>;
  bestFitness: (number | null)[];
  meanFitness: (number | null)[];
  visits: number[];
  // The evaluation on its island at which the cluster was first reached.
  firstEval: number[];
  size: Float32Array;
  // 0 when only one island visited the cluster, 1 when all of them did.
  shared: Float32Array;
  // When the cluster appears in the replay, from 0 to 1. Each island's first cluster is there from the start.
  reveal: Float32Array;
  edges: { a: Int32Array; b: Int32Array; weight: Float32Array; reveal: Float32Array };
  migrations: { a: Int32Array; b: Int32Array; count: Float32Array; route: string[] };
  routes: Route[];
  // Per island, in `islands` order; -1 when the island has none.
  islandBest: number[];
  runBest: number;
  maxTraversals: number;
};

// A live graph does not say which way fitness points, but the run best sits at one end of the clusters' bests.
export function inferMaximising(graph: Graph): boolean {
  const values = graph.nodes.best_fitness.filter((value): value is number => value !== null);
  const best = graph.nodes.best_fitness[graph.nodes.overall_best.indexOf(true)];
  return best !== undefined && best !== null && values.length > 1 && best === Math.max(...values) && best !== Math.min(...values);
}

// Heights run from -0.9 (bottom) to 0.9 (top).
const toHeight = (t: number) => t * 1.8 - 0.9;

// Heights by rank among the distinct values, since one stray cluster at 1e25 would squash the rest flat. Ties share a
// height and missing values sit at the worst end.
function ranks(values: (number | null)[], maximising: boolean): Float32Array {
  const badness = (v: number | null) => (v === null ? Infinity : maximising ? -v : v);
  const distinct = [...new Set(values.map(badness))].sort((a, b) => a - b);
  const place = new Map(distinct.map((v, k) => [v, distinct.length > 1 ? k / (distinct.length - 1) : 0.5]));
  return Float32Array.from(values, (v) => place.get(badness(v))!);
}

export function buildScene(graph: Graph, islands: number[], maximising: boolean): Scene {
  const nodes = graph.nodes;
  const count = nodes.id.length;
  const index = new Map(nodes.id.map((id, i) => [id, i]));
  const slots = new Map(islands.map((island, i) => [island, i]));
  const slot = Uint8Array.from(nodes.island, (island) => slots.get(island) ?? 0);
  const clusters = islands.map(() => 0);
  for (const k of slot) clusters[k] = clusters[k]! + 1;

  const shared = Float32Array.from(nodes.islands_sharing, (n) => (islands.length > 1 ? Math.max(0, (n - 1) / (islands.length - 1)) : 0));
  const heights: Record<HeightMode, Float32Array> = {
    fitness: ranks(nodes.best_fitness, maximising).map(toHeight),
    mean: ranks(nodes.mean_fitness, maximising).map(toHeight),
    time: Float32Array.from(nodes.progress, toHeight),
    genome: Float32Array.from(nodes.z),
    flat: new Float32Array(count),
  };

  const order = nodes.id.map((_, i) => i).sort((a, b) => nodes.first_eval[a]! - nodes.first_eval[b]! || nodes.id[a]! - nodes.id[b]!);
  const firstOfIsland = new Set<number>();
  const seen = new Set<number>();
  for (const i of order)
    if (!seen.has(slot[i]!)) {
      seen.add(slot[i]!);
      firstOfIsland.add(i);
    }
  const rest = order.filter((i) => !firstOfIsland.has(i));
  const reveal = new Float32Array(count);
  for (const i of firstOfIsland) reveal[i] = -1;
  rest.forEach((i, k) => (reveal[i] = (k + 1) / rest.length));

  const edgeList = graph.edges.source.flatMap((source, k) => {
    const a = index.get(source);
    const b = index.get(graph.edges.target[k]!);
    return a === undefined || b === undefined ? [] : [[a, b, graph.edges.weight[k]!] as const];
  });
  const migrationList = graph.migrations.source.flatMap((source, k) => {
    const a = index.get(source);
    const b = index.get(graph.migrations.target[k]!);
    return a === undefined || b === undefined ? [] : [[a, b, graph.migrations.count[k]!] as const];
  });
  const routes = new Map<string, Route>();
  for (const [a, b, migrants] of migrationList) {
    const key = routeKey(nodes.island[a]!, nodes.island[b]!);
    const route = routes.get(key) ?? { source: nodes.island[a]!, destination: nodes.island[b]!, migrants: 0 };
    route.migrants += migrants;
    routes.set(key, route);
  }

  return {
    count,
    ids: nodes.id,
    index,
    islands,
    clusters,
    slot,
    x: Float32Array.from(nodes.x),
    y: Float32Array.from(nodes.y),
    heights,
    bestFitness: nodes.best_fitness,
    meanFitness: nodes.mean_fitness,
    visits: nodes.visits,
    firstEval: nodes.first_eval,
    size: Float32Array.from(nodes.visits, (v) => 1 + Math.log2(1 + v) * 0.85),
    shared,
    reveal,
    edges: {
      a: Int32Array.from(edgeList, (e) => e[0]),
      b: Int32Array.from(edgeList, (e) => e[1]),
      weight: Float32Array.from(edgeList, (e) => e[2]),
      reveal: Float32Array.from(edgeList, (e) => Math.max(reveal[e[0]]!, reveal[e[1]]!)),
    },
    migrations: {
      a: Int32Array.from(migrationList, (m) => m[0]),
      b: Int32Array.from(migrationList, (m) => m[1]),
      count: Float32Array.from(migrationList, (m) => m[2]),
      route: migrationList.map(([a, b]) => routeKey(nodes.island[a]!, nodes.island[b]!)),
    },
    routes: [...routes.values()].sort((a, b) => a.source - b.source || a.destination - b.destination),
    islandBest: islands.map((island) => nodes.id.findIndex((_, i) => nodes.island[i] === island && nodes.island_best[i])),
    runBest: nodes.overall_best.indexOf(true),
    maxTraversals: maxOf(graph.edges.weight, 1),
  };
}
