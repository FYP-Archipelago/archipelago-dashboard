import { useMemo, useRef, useState, type PointerEvent } from 'react';

import { heatColor, heatInk, islandColor } from '@/colors.ts';
import Icon from '@/components/Icon.tsx';
import Link from '@/components/Link.tsx';
import { fitness, numberFormat, TOPOLOGIES } from '@/format.ts';
import { EmptyState, IslandSwatch, NoResult, type ResultQuery } from '@/pages/run-workspace/shared.tsx';
import { runHref } from '@/route.ts';
import type { Run, RunResult } from '@/types.ts';

import { arrivalsOf, comparison } from './migration.ts';

import './migration.css';

type Route = RunResult['migration_routes'][number];

const routeKey = (source: number, destination: number) => `${source}-${destination}`;

type OnHover = (key: string | null, event?: PointerEvent) => void;
// Shares under 10% keep a decimal, so a small but real share does not round away to 0%.
const percent = (share: number) => `${share > 0 && share < 0.1 ? (share * 100).toFixed(1) : Math.round(share * 100)}%`;

// Islands sit on a circle, with one curved arrow per route, as wide as its share of the migrants.
// The two directions between a pair bend to opposite sides, so both stay visible.
function FlowDiagram({ islands, routes, hovered, onHover }: { islands: number[]; routes: Route[]; hovered: string | null; onHover: OnHover }) {
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
    <svg className="flow-diagram" viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Migrants between islands">
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
        return (
          <g
            key={key}
            className={`flow-route${hovered && hovered !== key ? ' flow-route-dimmed' : ''}`}
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
          <g key={island} className="flow-island">
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
function RouteMatrix({ islands, routes, hovered, onHover }: { islands: number[]; routes: Route[]; hovered: string | null; onHover: OnHover }) {
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
                className={`heat-cell${hovered === key ? ' heat-cell-selected' : ''}`}
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

function Arrivals({ graph, maximising }: { graph: RunResult['graph']; maximising: boolean }) {
  const arrivals = useMemo(() => arrivalsOf(graph), [graph]);
  const [showAll, setShowAll] = useState(false);
  if (!arrivals.length) return null;
  const better = arrivals.filter((arrival) => comparison(arrival, maximising)?.tone === 'arrival-better').length;
  const shown = showAll ? arrivals : arrivals.slice(0, 10);
  const cluster = (id: number, best: number | null) => (
    <>
      #{id} <span className="muted">· {fitness(best)}</span>
    </>
  );
  return (
    <>
      <h2 className="section-title">Where migrants landed</h2>
      <p className="section-subtitle">
        Migrants moved along {numberFormat.format(arrivals.length)} links between search clusters. {numberFormat.format(better)} of them arrived in a
        cluster whose best beat the one they left.
      </p>
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
      {arrivals.length > shown.length && (
        <div className="table-foot">
          <button className="button" onClick={() => setShowAll(true)}>
            Show all {numberFormat.format(arrivals.length)} links
          </button>
        </div>
      )}
    </>
  );
}

function Migration({ run, result }: { run: Run; result: RunResult }) {
  // The hovered route, and the pointer's place when it is hovered on the map; the matrix only highlights.
  const [hover, setHover] = useState<{ key: string; at: { x: number; y: number; width: number } | null } | null>(null);
  const grid = useRef<HTMLDivElement>(null);
  const onHover: OnHover = (key, event) => {
    const box = grid.current?.getBoundingClientRect();
    setHover(key ? { key, at: event && box ? { x: event.clientX - box.left, y: event.clientY - box.top, width: box.width } : null } : null);
  };
  const islands = result.run.islands;
  const routes = result.migration_routes.filter((route) => route.migrants > 0);
  const total = routes.reduce((sum, route) => sum + route.migrants, 0);
  if (!total) return <EmptyState icon="shuffle" title="No migrants moved" />;

  const busiest = routes.reduce((best, route) => (route.migrants > best.migrants ? route : best));
  const shapley = result.explainability.shapley;
  const routesGame = shapley.status === 'ready' ? shapley.routes : null;
  const topology = result.run.migration_topology ?? run.run_settings['migration.topology'];
  const focus = hover ? routes.find((route) => routeKey(route.source, route.destination) === hover.key) : null;
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
          <FlowDiagram islands={islands} routes={routes} hovered={hover?.key ?? null} onHover={onHover} />
        </section>
        <section className="card">
          <div className="card-header card-heading">
            <h3>Route matrix</h3>
            <span className="muted">Migrants by source and destination</span>
          </div>
          <RouteMatrix islands={islands} routes={routes} hovered={hover?.key ?? null} onHover={onHover} />
        </section>
        {hover?.at && focus && (
          <div
            className="hover-tip"
            style={
              hover.at.x > hover.at.width * 0.7
                ? { right: hover.at.width - hover.at.x + 14, top: hover.at.y + 14 }
                : { left: hover.at.x + 14, top: hover.at.y + 14 }
            }
          >
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

      {routesGame && (
        <Link className="card route-link" href={`${runHref(run.run_id, 'attribution')}?view=routes`}>
          <Icon name="shuffle" size={18} />
          <span>
            <strong>Which migrant routes mattered?</strong>
            <span className="muted">Attribution credits each route with the part of the improvement its migrants made possible.</span>
          </span>
          <span className="route-link-go">
            See Attribution
            <Icon name="arrowR" size={14} />
          </span>
        </Link>
      )}

      <Arrivals graph={result.graph} maximising={result.run.maximising} />
    </>
  );
}

export default function MigrationTab({ run, result }: { run: Run; result: ResultQuery }) {
  if (!run.run_settings['migration.enabled']) return <EmptyState icon="migrationOff" title="Migration was off" />;
  if (!result.data) return <NoResult run={run} result={result} />;
  return <Migration run={run} result={result.data} />;
}
