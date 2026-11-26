import { maxOf } from '@/math.ts';

import type { ViewSettings } from './renderer.ts';
import type { Scene } from './scene.ts';

type Positions = { x: Float32Array; y: Float32Array; h: Float32Array };

// Where each cluster glides from and to while uMove runs from 0 to 1, and when it appeared (in seconds since the
// renderer started), by cluster index.
export type Glide = { from: Positions; to: Positions; born: Float32Array };

// Each island's place on the ring it moves out to when grouped, by island slot.
export type Ring = (readonly [number, number])[];

export function islandRing(count: number): Ring {
  return Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
    return [Math.cos(angle) * 0.86, Math.sin(angle) * 0.86] as const;
  });
}

// The vertex layouts the shaders read, as [attribute, floats] in buffer order.
export const GRAPH_ATTRIBUTES: [string, number][] = [
  ['aFromXY', 2],
  ['aFromH', 1],
  ['aToXY', 2],
  ['aToH', 1],
  ['aOff', 2],
  ['aSlot', 1],
  ['aSize', 1],
  ['aShared', 1],
  ['aReveal', 1],
  ['aWeight', 1],
  ['aBorn', 1],
  ['aFaded', 1],
];
export const ARC_ATTRIBUTES: [string, number][] = [
  ['aAFrom', 3],
  ['aATo', 3],
  ['aAOff', 2],
  ['aBFrom', 3],
  ['aBTo', 3],
  ['aBOff', 2],
  ['aStep', 4],
  ['aShow', 3],
  ['aFlow', 2],
];
const GRAPH_FLOATS = GRAPH_ATTRIBUTES.reduce((sum, [, size]) => sum + size, 0);
const ARC_FLOATS = ARC_ATTRIBUTES.reduce((sum, [, size]) => sum + size, 0);
// Each migration is a ribbon of this many segments, two triangles each.
const ARC_SEGMENTS = 10;
const QUAD = [
  [0, -1],
  [0, 1],
  [1, -1],
  [1, -1],
  [0, 1],
  [1, 1],
] as const;

// One vertex per cluster for the points, and two per search path for the lines.
export function graphVertices(scene: Scene, { from, to, born }: Glide, ring: Ring) {
  const write = (out: Float32Array, at: number, i: number, reveal: number, weight: number, bornAt: number) => {
    const [ox, oy] = ring[scene.slot[i]!]!;
    out.set(
      [
        from.x[i]!,
        from.y[i]!,
        from.h[i]!,
        to.x[i]!,
        to.y[i]!,
        to.h[i]!,
        ox,
        oy,
        scene.slot[i]!,
        scene.size[i]!,
        scene.shared[i]!,
        reveal,
        weight,
        bornAt,
        scene.faded[i]!,
      ],
      at
    );
  };
  const nodes = new Float32Array(scene.count * GRAPH_FLOATS);
  // Clusters are never filtered by traversals, so they get a weight above any threshold.
  for (let i = 0; i < scene.count; i++) write(nodes, i * GRAPH_FLOATS, i, scene.reveal[i]!, 1e9, born[i]!);
  const { a, b, reveal, weight } = scene.edges;
  const edges = new Float32Array(a.length * 2 * GRAPH_FLOATS);
  for (let k = 0; k < a.length; k++) {
    const bornAt = Math.max(born[a[k]!]!, born[b[k]!]!);
    write(edges, k * 2 * GRAPH_FLOATS, a[k]!, reveal[k]!, weight[k]!, bornAt);
    write(edges, (k * 2 + 1) * GRAPH_FLOATS, b[k]!, reveal[k]!, weight[k]!, bornAt);
  }
  return { nodes, edges };
}

// A ribbon of triangles per migration. A migration on a hidden route or touching a hidden island stays in the buffer,
// marked not visible, so the shader can fade it.
export function arcVertices(
  scene: Scene,
  view: Pick<ViewSettings, 'layers' | 'hiddenRoutes' | 'hiddenIslands'>,
  { from, to, born }: Glide,
  ring: Ring
): { data: Float32Array; vertices: number } {
  const hiddenRoutes = new Set(view.hiddenRoutes);
  const hiddenIslands = new Set(view.hiddenIslands);
  const visibleSlot = (slot: number) => !hiddenIslands.has(scene.islands[slot]!);
  const count = view.layers.migrations ? scene.migrations.a.length : 0;
  const vertices = count * ARC_SEGMENTS * QUAD.length;
  const data = new Float32Array(vertices * ARC_FLOATS);
  const busiest = maxOf(Array.from(scene.migrations.count), 1);
  let at = 0;
  for (let m = 0; m < count; m++) {
    const [a, b] = [scene.migrations.a[m]!, scene.migrations.b[m]!];
    const [sa, sb] = [scene.slot[a]!, scene.slot[b]!];
    const visible = !hiddenRoutes.has(scene.migrations.route[m]!) && visibleSlot(sa) && visibleSlot(sb) ? 1 : 0;
    const head = [from.x[a]!, from.y[a]!, from.h[a]!, to.x[a]!, to.y[a]!, to.h[a]!, ring[sa]![0], ring[sa]![1]];
    const tail = [from.x[b]!, from.y[b]!, from.h[b]!, to.x[b]!, to.y[b]!, to.h[b]!, ring[sb]![0], ring[sb]![1]];
    const reveal = Math.max(scene.reveal[a]!, scene.reveal[b]!);
    const bornAt = Math.max(born[a]!, born[b]!);
    const traffic = Math.sqrt(scene.migrations.count[m]! / busiest);
    // A fixed pseudo-random phase per link, so links never flow in step and a rebuild does not reshuffle them.
    const phase = (Math.sin(m * 12.9898) * 43758.5453) % 1;
    for (let segment = 0; segment < ARC_SEGMENTS; segment++)
      for (const [step, side] of QUAD) {
        data.set([...head, ...tail, (segment + step) / ARC_SEGMENTS, side, sa, sb, reveal, visible, bornAt, traffic, phase], at);
        at += ARC_FLOATS;
      }
  }
  return { data, vertices };
}
