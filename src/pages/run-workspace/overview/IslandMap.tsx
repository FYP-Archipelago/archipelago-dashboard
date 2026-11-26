import { useMemo, useRef, useState, type PointerEvent } from 'react';

import { islandColor } from '@/colors.ts';
import { seeded, type Point } from '@/drawing.ts';
import { reducedMotion, vars } from '@/style.ts';

import type { OverviewData } from './overview.ts';

import './island-map.css';

const W = 420;
const H = 330;

type MapIsland = {
  island: number;
  // Share of the positive credit; null without attribution.
  share: number | null;
  // Share of the search clusters, the stand-in without attribution.
  clusterShare: number;
};

// What the map shows of each island, and the routes that carried migrants.
function mapData({ run, result, shapley }: OverviewData) {
  const routes = run.run_settings['migration.enabled'] ? result.migration_routes.filter((route) => route.migrants > 0) : [];
  const credit = new Map(shapley?.islands.players.map((player) => [player.player as number, Math.max(0, player.value)]) ?? []);
  const totalCredit = [...credit.values()].reduce((sum, value) => sum + value, 0);
  const hasCredit = shapley !== null && totalCredit > 0;
  const owners = result.graph.nodes.island;
  const islands: MapIsland[] = result.run.islands.map((island) => ({
    island,
    share: hasCredit ? (credit.get(island) ?? 0) / totalCredit : null,
    clusterShare: owners.length ? owners.filter((owner) => owner === island).length / owners.length : 0,
  }));
  return { islands, routes, hasCredit };
}

// Dots per island out of 100, by largest remainder so they always add up to 100.
function dotCounts(sizes: number[]): number[] {
  const total = sizes.reduce((sum, size) => sum + size, 0) || 1;
  const exact = sizes.map((size) => (size / total) * 100);
  const counts = exact.map(Math.floor);
  const missing = 100 - counts.reduce((sum, count) => sum + count, 0);
  const order = exact.map((value, i) => [value - Math.floor(value), i] as const).sort((a, b) => b[0] - a[0]);
  for (let k = 0; k < missing; k++) counts[order[k % order.length]![1]]! += 1;
  return counts;
}

// Islands on a loose ring, jittered then pushed apart and kept in frame. Seeded by the run, so each run always looks
// the same. `reach` is each island's radius and `below` the room its label needs.
function scatteredRing(seed: string, reach: number[], below: number): Point[] {
  const n = reach.length;
  if (n === 1) return [[W / 2, H / 2]];
  const random = seeded(`${seed}-layout`);
  const turn = random() * Math.PI * 2;
  const squash = 0.86 + random() * 0.18;
  const points = reach.map((_, i): Point => {
    const angle = turn + (i / n) * Math.PI * 2 + (random() - 0.5) * ((Math.PI * 2) / n) * 0.5;
    const spread = 0.76 + random() * 0.32;
    return [W / 2 + Math.cos(angle) * 150 * spread, H / 2 + Math.sin(angle) * 118 * spread * squash];
  });
  const keepInside = (p: Point, r: number): Point => [Math.max(r + 6, Math.min(W - r - 6, p[0])), Math.max(r + 6, Math.min(H - r - below, p[1]))];
  for (let pass = 0; pass < 80; pass++)
    for (let a = 0; a < n; a++)
      for (let b = a + 1; b < n; b++) {
        const [pa, pb] = [points[a]!, points[b]!];
        const [dx, dy] = [pb[0] - pa[0], pb[1] - pa[1]];
        const distance = Math.hypot(dx, dy) || 1;
        const overlap = reach[a]! + reach[b]! + 18 - distance;
        if (overlap <= 0) continue;
        points[a] = keepInside([pa[0] - (dx / distance) * (overlap / 2), pa[1] - (dy / distance) * (overlap / 2)], reach[a]!);
        points[b] = keepInside([pb[0] + (dx / distance) * (overlap / 2), pb[1] + (dy / distance) * (overlap / 2)], reach[b]!);
      }
  return points.map((p, i) => keepInside(p, reach[i]!));
}

// How far a dot is thrown by a passing pointer: further the faster (`speed`, map units per ms) and nearer it passes.
function scatter(dot: Point, pointer: Point | null, speed: number): { dx: number; dy: number } {
  if (!pointer) return { dx: 0, dy: 0 };
  const [dx, dy] = [dot[0] - pointer[0], dot[1] - pointer[1]];
  const distance = Math.hypot(dx, dy) || 1;
  const push = Math.min(90, speed * 70) * Math.max(0, 1 - distance / 80);
  return { dx: (dx / distance) * push, dy: (dy / distance) * push };
}

// A migrant the pointer knocked off its route, and how it goes. It sails again a few seconds later.
type Knocked = { at: Point; way: 'drift' | 'pop' | 'sink'; angle: number; key: number };
const WAYS: Knocked['way'][] = ['drift', 'pop', 'sink'];

// The credit as 100 dots gathered into islands (cluster shares without attribution), with migrants sailing the
// busiest routes. Dots scatter from the pointer, and a brushed migrant may be knocked off its route.
export default function IslandMap({ data }: { data: OverviewData }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const [pointer, setPointer] = useState<Point | null>(null);
  const [speed, setSpeed] = useState(0);
  const [knocked, setKnocked] = useState<Map<string, Knocked>>(new Map());
  const frame = useRef(0);
  const last = useRef<{ point: Point; time: number } | null>(null);
  const calm = useRef(0);
  // Counts knocks, so each knocked migrant gets its own animation.
  const counter = useRef(0);
  const still = reducedMotion();

  const toMap = (clientX: number, clientY: number): Point | null => {
    const box = svg.current?.getBoundingClientRect();
    return box ? [((clientX - box.left) / box.width) * W, ((clientY - box.top) / box.height) * H] : null;
  };
  // The pointer in map units, at most once a frame, and its speed.
  const track = (event: PointerEvent<SVGSVGElement>) => {
    const point = toMap(event.clientX, event.clientY);
    if (!point || still) return;
    const now = event.timeStamp;
    const previous = last.current;
    const moved = previous ? Math.hypot(point[0] - previous.point[0], point[1] - previous.point[1]) / Math.max(1, now - previous.time) : 0;
    last.current = { point, time: now };
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      setPointer(point);
      setSpeed(moved);
    });
    // Once the pointer rests, scattered dots drift home.
    clearTimeout(calm.current);
    calm.current = window.setTimeout(() => setSpeed(0), 140);
  };
  const knock = (route: string, event: PointerEvent<SVGCircleElement>) => {
    const at = toMap(event.clientX, event.clientY);
    if (!at || still || knocked.has(route)) return;
    const key = ++counter.current;
    const roll = seeded(`${route}-${key}`);
    // About one touch in seven knocks a migrant off.
    if (roll() > 0.15) return;
    const hit: Knocked = { at, way: WAYS[Math.floor(roll() * WAYS.length)]!, angle: roll() * Math.PI * 2, key };
    setKnocked((current) => new Map(current).set(route, hit));
    window.setTimeout(
      () =>
        setKnocked((current) => {
          if (current.get(route)?.key !== hit.key) return current;
          const next = new Map(current);
          next.delete(route);
          return next;
        }),
      4000
    );
  };

  const seed = data.run.run_id;
  const bestIsland = data.best?.island_id ?? null;
  const { islands, routes, hasCredit } = useMemo(() => mapData(data), [data]);
  const counts = useMemo(() => dotCounts(islands.map((island) => island.share ?? island.clusterShare)), [islands]);

  const layout = useMemo(() => {
    const random = seeded(seed);
    const extents = counts.map((count) => 5.4 * Math.sqrt(Math.max(1, count)) + 4);
    const centres = scatteredRing(
      seed,
      extents.map((extent) => extent + 14),
      12
    );
    return islands.map((island, i) => {
      const centre = centres[i]!;
      // Sunflower packing keeps each island round and tight however many dots it has.
      const dots = Array.from({ length: counts[i]! }, (_, k): Point => {
        const r = 5.4 * Math.sqrt(k + 0.5) + (random() - 0.5) * 1.2;
        const a = k * 2.39996 + (random() - 0.5) * 0.15;
        return [centre[0] + Math.cos(a) * r, centre[1] + Math.sin(a) * r];
      });
      return { island, centre, dots, extent: extents[i]! };
    });
  }, [islands, counts, seed]);

  const at = new Map(layout.map((entry) => [entry.island.island, entry]));
  const busiest = Math.max(1, ...routes.map((route) => route.migrants));
  // Migrants sail only the busiest routes, so the map stays readable.
  const sailing = [...routes].sort((a, b) => b.migrants - a.migrants).slice(0, 14);
  const lanes = routes.flatMap((route) => {
    const [a, b] = [at.get(route.source), at.get(route.destination)];
    if (!a || !b) return [];
    const [ax, ay] = a.centre;
    const [bx, by] = b.centre;
    const mx = (ax + bx) / 2 + (by - ay) * 0.22;
    const my = (ay + by) / 2 - (bx - ax) * 0.22;
    return [
      {
        route,
        key: `${route.source}-${route.destination}`,
        d: `M${ax.toFixed(1)},${ay.toFixed(1)}Q${mx.toFixed(1)},${my.toFixed(1)} ${bx.toFixed(1)},${by.toFixed(1)}`,
      },
    ];
  });

  return (
    <div className="island-map">
      <svg
        ref={svg}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="The credit as 100 dots gathered into islands, with migrants sailing between them"
        onPointerMove={track}
        onPointerLeave={() => {
          cancelAnimationFrame(frame.current);
          setPointer(null);
          setSpeed(0);
          last.current = null;
        }}
      >
        <g className="island-map-lanes">
          {lanes.map(({ route, key, d }) => {
            const lit = hovered !== null && (route.source === hovered || route.destination === hovered);
            return (
              <path
                key={key}
                d={d}
                stroke={islandColor(route.source)}
                opacity={hovered === null ? 0.1 + 0.25 * (route.migrants / busiest) : lit ? 0.7 : 0.03}
              />
            );
          })}
        </g>
        <g className="island-map-sailors">
          {lanes
            .filter(({ route }) => sailing.includes(route))
            .map(({ route, key, d }, i) => (
              <circle
                key={key}
                className={knocked.has(key) ? 'island-map-gone' : undefined}
                r={2.6}
                fill={islandColor(route.source)}
                opacity={hovered === null || route.source === hovered || route.destination === hovered ? 1 : 0.1}
                onPointerEnter={(event) => knock(key, event)}
                style={vars({
                  offsetPath: `path("${d}")`,
                  '--speed': `${(5.5 - 3 * (route.migrants / busiest)).toFixed(2)}s`,
                  '--delay': `${-i * 0.7}s`,
                })}
              />
            ))}
        </g>
        <g className="island-map-knocked">
          {[...knocked].map(([key, hit]) => {
            const colour = islandColor(Number(key.split('-')[0]));
            const [x, y] = hit.at;
            if (hit.way === 'pop')
              return (
                <g key={hit.key} transform={`translate(${x},${y})`}>
                  {Array.from({ length: 7 }, (_, k) => {
                    const angle = hit.angle + (k / 7) * Math.PI * 2;
                    return (
                      <circle
                        key={k}
                        className="island-map-speck"
                        r={1.3}
                        fill={colour}
                        style={vars({ '--x': `${(Math.cos(angle) * 16).toFixed(1)}px`, '--y': `${(Math.sin(angle) * 16).toFixed(1)}px` })}
                      />
                    );
                  })}
                </g>
              );
            return (
              <circle
                key={hit.key}
                className={`island-map-${hit.way}`}
                cx={x}
                cy={y}
                r={2.6}
                fill={colour}
                style={vars({ '--x': `${(Math.cos(hit.angle) * 320).toFixed(0)}px`, '--y': `${(Math.sin(hit.angle) * 220 - 120).toFixed(0)}px` })}
              />
            );
          })}
        </g>
        {layout.map(({ island, centre, dots, extent }, i) => {
          const best = bestIsland === island.island;
          return (
            <g
              key={island.island}
              className="island-map-island"
              onPointerEnter={() => setHovered(island.island)}
              onPointerLeave={() => setHovered(null)}
            >
              <circle cx={centre[0]} cy={centre[1]} r={extent + 8} fill="transparent" />
              {dots.length ? (
                dots.map(([x, y], k) => {
                  const { dx, dy } = scatter([x, y], pointer, speed);
                  const style = vars({ transform: `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)`, '--d': `${0.1 + i * 0.08 + k * 0.012}s` });
                  // The run's best island has a diamond for its heart dot.
                  return best && k === 0 ? (
                    <g key={k} className="island-map-dot" style={style}>
                      <circle cx={x} cy={y} r={7} className="island-map-best-glow" />
                      <path className="island-map-best" d={`M${x},${y - 4.6}L${x + 4.6},${y}L${x},${y + 4.6}L${x - 4.6},${y}Z`} />
                    </g>
                  ) : (
                    <circle key={k} className="island-map-dot" cx={x} cy={y} r={2.9} fill={islandColor(island.island)} style={style} />
                  );
                })
              ) : (
                <circle cx={centre[0]} cy={centre[1]} r={4} className="island-map-empty" stroke={islandColor(island.island)} />
              )}
              <text className="island-map-name" x={centre[0]} y={centre[1] + extent + 15} textAnchor="middle">
                Island {island.island}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="island-map-keys">
        <span>
          <svg width="18" height="14" viewBox="0 0 18 14" aria-hidden="true">
            {[
              [9, 7],
              [5, 4.5],
              [13, 4.5],
              [4.5, 10],
              [13.5, 10],
              [9, 1.5],
              [9, 12.5],
            ].map(([x, y], k) => (
              <circle key={k} cx={x} cy={y} r={1.5} className="island-map-key-dot" />
            ))}
          </svg>
          {hasCredit ? 'Share of the credit' : 'Share of the clusters'}
        </span>
        {lanes.length > 0 && (
          <span>
            <svg width="26" height="14" viewBox="0 0 26 14" aria-hidden="true">
              <path d="M2,10Q13,0 24,10" className="island-map-key-lane" />
              <circle r={2} className="island-map-key-sailor" style={vars({ offsetPath: 'path("M2,10Q13,0 24,10")' })} />
            </svg>
            Migrants
          </span>
        )}
        {bestIsland !== null && (
          <span>
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <path className="island-map-best" d="M8,3.4L12.6,8L8,12.6L3.4,8Z" />
            </svg>
            Run best
          </span>
        )}
      </div>
    </div>
  );
}
