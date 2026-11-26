import { useMemo, useRef, useState, type PointerEvent } from 'react';

import { heatColor, heatInk, islandColor } from '@/colors.ts';
import Link from '@/components/Link.tsx';
import { fitness, numberFormat, TOPOLOGIES } from '@/format.ts';
import { EmptyState, IslandSwatch, NoResult, routeKey, type ResultQuery } from '@/pages/run-workspace/shared.tsx';
import { runHref } from '@/route.ts';
import type { Run, RunResult } from '@/types.ts';

import { arrivalsOf, comparison } from './migration.ts';

import './migration.css';

type Route = RunResult['migration_routes'][number];

type OnHover = (key: string | null, event?: PointerEvent) => void;
type OnIsland = (island: number | null, event?: PointerEvent) => void;
// Shares under 10% keep a decimal, so a small but real share does not round away to 0%.
const percent = (share: number) => `${share > 0 && share < 0.1 ? (share * 100).toFixed(1) : Math.round(share * 100)}%`;

// Islands sit on a circle, with one curved arrow per route, as wide as its share of the migrants.
// The two directions between a pair bend to opposite sides, so both stay visible.
// Hovering an island brings out its routes until the pointer reaches another island or route, or leaves the diagram.
function FlowDiagram({
  islands,
  routes,
  hovered,
  focusIsland,
  onHover,
  onIsland,
  onLeave,
}: {
  islands: number[];
  routes: Route[];
  hovered: string | null;
  focusIsland: number | null;
  onHover: OnHover;
  onIsland: OnIsland;
  onLeave: () => void;
}) {
  const touches = (route: Route, island: number) => route.source === island || route.destination === island;
  const linked = new Set(focusIsland === null ? [] : routes.filter((route) => touches(route, focusIsland)).flatMap((r) => [r.source, r.destination]));
  const size = 400;
  const centre = size / 2;
  const radius = size * 0.34;
  const node = 20;
  const position = new Map(
    islands.map((island, i) => {
      const angle = (2 * Math.PI * i) / islands.length - Math.PI / 2;
      return [island, [centre + radius * Math.cos(angle), centre + radius * Math.sin(angle)] as const];
    })
  );
  const most = Math.max(1, ...routes.map((route) => route.migrants));
  return (
    <svg className="flow-diagram" viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Migrants between islands" onPointerLeave={onLeave}>
      {routes.map((route) => {
        const [x1, y1] = position.get(route.source)!;
        const [x2, y2] = position.get(route.destination)!;
        const length = Math.hypot(x2 - x1, y2 - y1);
        const [ux, uy] = [(x2 - x1) / length, (y2 - y1) / length];
        // A sideways nudge, to the left of the direction of travel.
        const [ox, oy] = [uy * 9, -ux * 9];
        const width = 1.5 + 6 * (route.migrants / most);
        // The head is always wider than its line, and the line stops where the head begins so it never shows through.
        const headWidth = width / 2 + 3.5;
        const headLength = headWidth * 2;
        const start = [x1 + ux * (node + 6) + ox, y1 + uy * (node + 6) + oy];
        const end = [x2 - ux * (node + 5 + headLength) + ox, y2 - uy * (node + 5 + headLength) + oy];
        const control = [(start[0]! + end[0]!) / 2 + ox * 1.6, (start[1]! + end[1]!) / 2 + oy * 1.6];
        const angle = (Math.atan2(end[1]! - control[1]!, end[0]! - control[0]!) * 180) / Math.PI;
        const curve = `M${start[0]},${start[1]} Q${control[0]},${control[1]} ${end[0]},${end[1]}`;
        const key = routeKey(route.source, route.destination);
        const colour = islandColor(route.source);
        const dimmed = hovered ? hovered !== key : focusIsland !== null && !touches(route, focusIsland);
        return (
          <g
            key={key}
            className={`flow-route${dimmed ? ' flow-route-dimmed' : ''}`}
            onPointerMove={(event) => onHover(key, event)}
            onPointerLeave={() => onHover(null)}
          >
            <path d={curve} stroke="transparent" strokeWidth={width + 12} fill="none" />
            <path className="flow-route-line" d={curve} stroke={colour} strokeWidth={width} fill="none" pathLength={1} />
            {/* The head is drawn around its base, pointing along +x, then turned to the line's end. */}
            <g transform={`translate(${end[0]} ${end[1]}) rotate(${angle})`}>
              <path className="flow-route-head" d={`M${headLength},0 L0,${-headWidth} L0,${headWidth}Z`} fill={colour} />
            </g>
          </g>
        );
      })}
      {islands.map((island) => {
        const [x, y] = position.get(island)!;
        return (
          <g
            key={island}
            className={`flow-island${focusIsland !== null && !linked.has(island) && island !== focusIsland ? ' flow-island-dimmed' : ''}`}
            onPointerMove={(event) => onIsland(island, event)}
            onPointerLeave={() => onIsland(null)}
          >
            <circle cx={x} cy={y} r={node} fill={islandColor(island)} />
            <text x={x} y={y} textAnchor="middle" dominantBaseline="central">
              {island}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// Migrants by source (rows) and destination (columns), with each island's totals in the margins.
// A hovered route is highlighted alone, and otherwise every route of the island brought out on the map is.
function RouteMatrix({
  islands,
  routes,
  hovered,
  focusIsland,
  onHover,
}: {
  islands: number[];
  routes: Route[];
  hovered: string | null;
  focusIsland: number | null;
  onHover: OnHover;
}) {
  const lit = (source: number, destination: number) =>
    hovered ? hovered === routeKey(source, destination) : focusIsland !== null && (source === focusIsland || destination === focusIsland);
  const between = new Map(routes.map((route) => [routeKey(route.source, route.destination), route.migrants]));
  const sent = (island: number) => routes.filter((route) => route.source === island).reduce((sum, route) => sum + route.migrants, 0);
  const received = (island: number) => routes.filter((route) => route.destination === island).reduce((sum, route) => sum + route.migrants, 0);
  const most = Math.max(1, ...routes.map((route) => route.migrants));
  return (
    <div className="heat-grid" style={{ gridTemplateColumns: `auto repeat(${islands.length}, minmax(34px, 1fr)) auto` }}>
      <span className="heat-axis heat-axis-corner">From ↓ To →</span>
      {islands.map((island) => (
        <span key={island} className="heat-axis">
          <IslandSwatch island={island} />
          {island}
        </span>
      ))}
      <span className="heat-axis">Sent</span>
      {islands.map((source) => (
        <div key={source} className="heat-row">
          <span className="heat-axis heat-axis-row">Island {source}</span>
          {islands.map((destination) => {
            const key = routeKey(source, destination);
            const migrants = between.get(key) ?? 0;
            if (source === destination) return <span key={key} className="heat-cell heat-cell-same" />;
            if (!migrants)
              return (
                <span key={key} className="heat-cell heat-cell-empty" title={`No migrants from island ${source} to island ${destination}`}>
                  ·
                </span>
              );
            const shade = 0.25 + 0.75 * (migrants / most);
            return (
              <span
                key={key}
                className={`heat-cell${lit(source, destination) ? ' heat-cell-selected' : ''}`}
                style={{ background: heatColor(shade), color: heatInk(shade) }}
                aria-label={`Island ${source} → island ${destination}: ${migrants} migrants`}
                onPointerEnter={() => onHover(key)}
                onPointerLeave={() => onHover(null)}
              >
                {migrants}
              </span>
            );
          })}
          <span className="heat-total">{sent(source)}</span>
        </div>
      ))}
      <span className="heat-axis heat-axis-row">Received</span>
      {islands.map((island) => (
        <span key={island} className="heat-total heat-total-column">
          {received(island)}
        </span>
      ))}
      <span className="heat-total heat-total-column">{routes.reduce((sum, route) => sum + route.migrants, 0)}</span>
    </div>
  );
}

const OUTCOMES = [
  { key: 'all', label: 'All arrivals' },
  { key: 'arrival-better', label: 'Better' },
  { key: 'arrival-same', label: 'Same' },
  { key: 'arrival-worse', label: 'Worse' },
] as const;

function Arrivals({ runId, graph, maximising }: { runId: string; graph: RunResult['graph']; maximising: boolean }) {
  const arrivals = useMemo(() => arrivalsOf(graph), [graph]);
  const [showAll, setShowAll] = useState(false);
  const [outcome, setOutcome] = useState<(typeof OUTCOMES)[number]['key']>('all');
  if (!arrivals.length) return null;
  const toneOf = (arrival: (typeof arrivals)[number]) => comparison(arrival, maximising)?.tone;
  const count = (key: (typeof OUTCOMES)[number]['key']) =>
    key === 'all' ? arrivals.length : arrivals.filter((arrival) => toneOf(arrival) === key).length;
  const better = count('arrival-better');
  const matching = outcome === 'all' ? arrivals : arrivals.filter((arrival) => toneOf(arrival) === outcome);
  const shown = showAll ? matching : matching.slice(0, 10);
  // Each cluster opens in the Network tab, selected and centred.
  const cluster = (id: number, best: number | null) => (
    <>
      <Link className="cluster-link" href={`${runHref(runId, 'network')}?cluster=${id}`} title="Show this cluster in the network">
        #{id}
      </Link>{' '}
      <span className="muted">· {fitness(best)}</span>
    </>
  );
  return (
    <>
      <div className="section-head">
        <div>
          <h2 className="section-title">Where migrants landed</h2>
          <p className="section-subtitle">
            Migrants moved along {numberFormat.format(arrivals.length)} links between search clusters. {numberFormat.format(better)} of them arrived
            in a cluster whose best beat the one they left.
          </p>
        </div>
        <select
          className="input arrival-filter"
          aria-label="Arrival cluster's best"
          value={outcome}
          onChange={(event) => setOutcome(event.target.value as typeof outcome)}
        >
          {OUTCOMES.map(({ key, label }) => (
            <option key={key} value={key}>
              {label} ({numberFormat.format(count(key))})
            </option>
          ))}
        </select>
      </div>
      <section className="card table-card">
        <table className="table">
          <thead>
            <tr>
              <th>Route</th>
              <th>From cluster</th>
              <th>To cluster</th>
              <th className="align-right">Migrants</th>
              <th className="align-right">Arrival cluster&apos;s best</th>
            </tr>
          </thead>
          <tbody>
            {!shown.length && (
              <tr>
                <td colSpan={5} className="muted arrivals-empty">
                  No arrivals like that
                </td>
              </tr>
            )}
            {shown.map((arrival) => {
              const compared = comparison(arrival, maximising);
              return (
                <tr key={arrival.key}>
                  <td>
                    <span className="route-name">
                      <IslandSwatch island={arrival.fromIsland} />
                      {arrival.fromIsland} →
                      <IslandSwatch island={arrival.toIsland} />
                      {arrival.toIsland}
                    </span>
                  </td>
                  <td>{cluster(arrival.from, arrival.fromBest)}</td>
                  <td>{cluster(arrival.to, arrival.toBest)}</td>
                  <td className="align-right">{arrival.migrants}</td>
                  <td className={`align-right ${compared?.tone ?? ''}`}>{compared?.label ?? '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
      {matching.length > shown.length && (
        <div className="table-foot">
          <button className="button" onClick={() => setShowAll(true)}>
            Show all {numberFormat.format(matching.length)} links
          </button>
        </div>
      )}
    </>
  );
}

type At = { x: number; y: number; width: number };

// Beside the pointer, on its left near the right edge.
const tipStyle = (at: At) => (at.x > at.width * 0.7 ? { right: at.width - at.x + 14, top: at.y + 14 } : { left: at.x + 14, top: at.y + 14 });

function Migration({ run, result }: { run: Run; result: RunResult }) {
  // The hovered route or island, and the pointer's place when it is hovered on the map; the matrix only highlights.
  const [hover, setHover] = useState<{ key: string; at: At | null } | { island: number; at: At } | null>(null);
  // The island whose routes stay brought out on the map, from hovering it until another island or route is picked.
  const [focusIsland, setFocusIsland] = useState<number | null>(null);
  const grid = useRef<HTMLDivElement>(null);
  const islands = result.run.islands;
  const routes = result.migration_routes.filter((route) => route.migrants > 0);
  const pointer = (event?: PointerEvent): At | null => {
    const box = grid.current?.getBoundingClientRect();
    return event && box ? { x: event.clientX - box.left, y: event.clientY - box.top, width: box.width } : null;
  };
  const onHover: OnHover = (key, event) => {
    const route = routes.find((r) => routeKey(r.source, r.destination) === key);
    if (route && focusIsland !== null && route.source !== focusIsland && route.destination !== focusIsland) setFocusIsland(null);
    setHover(key ? { key, at: pointer(event) } : null);
  };
  const onIsland: OnIsland = (island, event) => {
    const at = pointer(event);
    if (island !== null) setFocusIsland(island);
    setHover(island !== null && at ? { island, at } : null);
  };
  const hoveredKey = hover && 'key' in hover ? hover.key : null;
  const total = routes.reduce((sum, route) => sum + route.migrants, 0);
  if (!total) return <EmptyState icon="shuffle" title="No migrants moved" />;

  const busiest = routes.reduce((best, route) => (route.migrants > best.migrants ? route : best));
  const shapley = result.explainability.shapley;
  const routesGame = shapley.status === 'ready' ? shapley.routes : null;
  const topology = result.run.migration_topology ?? run.run_settings['migration.topology'];
  const focus = hoveredKey ? routes.find((route) => routeKey(route.source, route.destination) === hoveredKey) : null;
  const islandTip = hover && 'island' in hover ? hover.island : null;
  const flows = (island: number, side: 'source' | 'destination') => {
    const own = routes.filter((route) => route[side] === island);
    return { migrants: own.reduce((sum, route) => sum + route.migrants, 0), islands: own.length };
  };
  const gain = routesGame ? routesGame.full_value - routesGame.empty_value : 0;
  const credit = (route: Route) =>
    routesGame?.players.find((player) => Array.isArray(player.player) && player.player[0] === route.source && player.player[1] === route.destination)
      ?.value;
  const settings = run.run_settings;

  return (
    <>
      <section className="card stat-strip">
        <div>
          <span className="muted">Migrants</span>
          <strong>{numberFormat.format(total)}</strong>
          <span className="stat-note">
            {settings['migration.num_migrants']} per migration event, every {settings['migration.interval']} generations
          </span>
        </div>
        <div>
          <span className="muted">Routes used</span>
          <strong>
            {routes.length}
            <small>of {islands.length * (islands.length - 1)} possible</small>
          </strong>
          <span className="stat-note">{TOPOLOGIES[topology] ?? topology} Topology</span>
        </div>
        <div>
          <span className="muted">Busiest route</span>
          <strong>
            {busiest.source} → {busiest.destination}
          </strong>
          <span className="stat-note">
            {busiest.migrants} migrants · {percent(busiest.migrants / total)} of traffic
          </span>
        </div>
        {routesGame && routesGame.full_value > 0 && (
          <div title="The share of the run's improvement the islands could not reach without migrants">
            <span className="muted">Improvement that needed migrants</span>
            <strong>{percent(Math.max(0, routesGame.full_value - routesGame.empty_value) / routesGame.full_value)}</strong>
            <span className="stat-note">the rest each island evolved on its own</span>
          </div>
        )}
      </section>

      <div ref={grid} className="migration-grid">
        <section className="card">
          <div className="card-header card-heading">
            <h3>Flow between islands</h3>
            <span className="muted">Arrow width ∝ Number of migrants</span>
          </div>
          <FlowDiagram
            islands={islands}
            routes={routes}
            hovered={hoveredKey}
            focusIsland={focusIsland}
            onHover={onHover}
            onIsland={onIsland}
            onLeave={() => {
              setFocusIsland(null);
              setHover(null);
            }}
          />
        </section>
        <section className="card">
          <div className="card-header card-heading">
            <h3>Route matrix</h3>
            <span className="muted">Migrants by source and destination</span>
          </div>
          <RouteMatrix islands={islands} routes={routes} hovered={hoveredKey} focusIsland={focusIsland} onHover={onHover} />
        </section>
        {hover?.at && islandTip !== null && (
          <div className="hover-tip" style={tipStyle(hover.at)}>
            <div className="hover-tip-title route-name">
              <IslandSwatch island={islandTip} />
              Island {islandTip}
            </div>
            {(['destination', 'source'] as const).map((side) => {
              const { migrants, islands: count } = flows(islandTip, side);
              return (
                <div key={side} className="hover-tip-row">
                  {side === 'destination' ? 'Migrants in' : 'Migrants out'}
                  <b>
                    {numberFormat.format(migrants)}
                    {count > 0 && (
                      <span className="muted">
                        {' '}
                        · {side === 'destination' ? 'from' : 'to'} {count} {count === 1 ? 'island' : 'islands'}
                      </span>
                    )}
                  </b>
                </div>
              );
            })}
          </div>
        )}
        {hover?.at && focus && (
          <div className="hover-tip" style={tipStyle(hover.at)}>
            <div className="hover-tip-title route-name">
              <IslandSwatch island={focus.source} />
              Island {focus.source} →
              <IslandSwatch island={focus.destination} />
              Island {focus.destination}
            </div>
            <div className="hover-tip-row">
              Migrants
              <b>
                {focus.migrants} <span className="muted">· {percent(focus.migrants / total)} of traffic</span>
              </b>
            </div>
            {routesGame && (
              <div className="hover-tip-row">
                Credited improvement
                <b>
                  {fitness(credit(focus) ?? null)}
                  {gain > 0 && credit(focus) !== undefined && (
                    <span className="muted"> · {percent(Math.max(0, credit(focus)!) / gain)} of migration&apos;s</span>
                  )}
                </b>
              </div>
            )}
          </div>
        )}
      </div>

      <Arrivals runId={run.run_id} graph={result.graph} maximising={result.run.maximising} />
    </>
  );
}

export default function MigrationTab({ run, result }: { run: Run; result: ResultQuery }) {
  if (!run.run_settings['migration.enabled']) return <EmptyState icon="migrationOff" title="Migration was off" />;
  if (!result.data) return <NoResult run={run} result={result} />;
  return <Migration run={run} result={result.data} />;
}
