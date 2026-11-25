import { useState } from 'react';

import { islandColor } from '@/colors.ts';
import { numberFormat } from '@/format.ts';
import { historyByIsland } from '@/pages/run-workspace/history.ts';
import { IslandSwatch } from '@/pages/run-workspace/shared.tsx';
import { budgetPerIsland, reasonPhrase, REASONS, stopText } from '@/pages/run-workspace/stops.ts';
import { vars } from '@/style.ts';
import type { IslandEnd, Run, RunResult, TerminationReason } from '@/types.ts';

import './budget.css';

type IslandUse = { island: number; generations: number; evaluations: number | null; end: IslandEnd | null };

// Islands whose dots stopped close enough to overlap, drawn as one stack at their mean that fans out on hover.
type Cluster = { at: number; islands: IslandUse[] };

const percent = (share: number) => `${Math.floor(share * 100)}%`;
const width = (share: number) => `${Math.min(share, 1) * 100}%`;

function islandUse(result: RunResult): IslandUse[] {
  return historyByIsland(result.generation_history).map((history) => ({
    island: history.island,
    // Generations count from 0.
    generations: (history.generation.at(-1) ?? 0) + 1,
    evaluations: history.evaluations.at(-1) ?? null,
    end: result.island_ends.find((end) => end.island_id === history.island) ?? null,
  }));
}

// An island with no island_end, which the runner skips for one that crashed, gets a striped dot.
const markerOf = (end: IslandEnd | null) => (end ? REASONS[end.termination_reason].marker : 'budget-marker-missing');

// Dots whose islands stopped within 3.5% of the target of a neighbour would overlap, so they form one cluster.
function clustersOf(islands: IslandUse[], target: number): Cluster[] {
  const clusters: IslandUse[][] = [];
  for (const island of [...islands].sort((a, b) => a.generations - b.generations)) {
    const cluster = clusters.at(-1);
    if (cluster && (island.generations - cluster.at(-1)!.generations) / target < 0.035) cluster.push(island);
    else clusters.push([island]);
  }
  return clusters.map((members) => ({
    at: members.reduce((sum, island) => sum + island.generations, 0) / members.length / target,
    islands: members,
  }));
}

const tipClass = (at: number) => `budget-tip${at < 0.12 ? ' budget-tip-left' : at > 0.75 ? ' budget-tip-right' : ''}`;

type Hover = { island: number; on: 'evaluations' | 'generations' | 'legend' };

// How much of the evaluation budget and the generation target the run used, from each island's last logged generation.
// Evaluations are one bar split into the islands' parts; generations are a track with a dot where each island stopped.
// Hovering a part, a dot or an island in the legend picks that island out in both.
export default function Budget({ run, result }: { run: Run; result: RunResult }) {
  const [hover, setHover] = useState<Hover | null>(null);
  // The cluster under the pointer, fanned out even between its dots.
  const [openCluster, setOpenCluster] = useState<number | null>(null);
  const islands = islandUse(result);
  if (!islands.length) return null;

  const { evaluation_budget: budget, target_generations: target } = run.run_settings;
  const share = budgetPerIsland(run, result);
  const used = islands.every((island) => island.evaluations !== null) ? islands.reduce((sum, island) => sum + island.evaluations!, 0) : null;
  const generations = islands.map((island) => island.generations);
  const [fewest, most] = [Math.min(...generations), Math.max(...generations)];
  const shares = islands.map((island) => (island.evaluations ?? 0) / budget);
  const startOf = (index: number) => shares.slice(0, index).reduce((sum, value) => sum + value, 0);
  const clusters = clustersOf(islands, target);
  const reasons = new Map<TerminationReason, number>();
  for (const { end } of islands) if (end) reasons.set(end.termination_reason, (reasons.get(end.termination_reason) ?? 0) + 1);
  const missing = islands.filter((island) => !island.end).length;
  const keyEntries = [
    ...[...reasons]
      .sort((a, b) => b[1] - a[1])
      .map(([reason, count]) => ({ marker: REASONS[reason].marker, count, phrase: reasonPhrase(reason, count) })),
    ...(missing > 0 ? [{ marker: 'budget-marker-missing', count: missing, phrase: 'with no end recorded' }] : []),
  ];

  const dim = (island: number) => (hover && hover.island !== island ? ' budget-dim' : '');
  const hoverProps = (island: number, on: Hover['on']) => ({
    onPointerEnter: () => setHover({ island, on }),
    onPointerLeave: () => setHover(null),
  });
  const tipTitle = (island: number) => (
    <b>
      <IslandSwatch island={island} />
      Island {island}
    </b>
  );

  return (
    <section className="card budget-card">
      {used !== null && (
        <div className="budget-row">
          <span className="muted">Evaluations used</span>
          <strong>
            {numberFormat.format(used)}
            <small>
              of {numberFormat.format(budget)} · {percent(used / budget)}
            </small>
          </strong>
          <div className="budget-bar">
            <span className="budget-fill">
              {islands.map((island, index) => (
                <i
                  key={island.island}
                  className={dim(island.island)}
                  style={{ width: width(shares[index]!), background: islandColor(island.island), animationDelay: `${0.2 + index * 0.08}s` }}
                  {...hoverProps(island.island, 'evaluations')}
                />
              ))}
            </span>
            {islands.map(
              (island, index) =>
                hover?.island === island.island &&
                hover.on !== 'generations' && (
                  <div
                    key={island.island}
                    className={tipClass(startOf(index) + shares[index]! / 2)}
                    style={{ left: width(startOf(index) + shares[index]! / 2) }}
                  >
                    {tipTitle(island.island)}
                    {numberFormat.format(island.evaluations!)} evaluations
                    <span>
                      {percent(island.evaluations! / share)} of its share · {percent(shares[index]!)} of the budget
                    </span>
                  </div>
                )
            )}
          </div>
        </div>
      )}
      <div className="budget-row">
        <span className="muted">{fewest === most ? 'Generations reached' : 'Generations reached, per island'}</span>
        <strong>
          {fewest === most ? most : `${fewest}–${most}`}
          <small>
            of {numberFormat.format(target)} target · {percent(most / target)}
          </small>
        </strong>
        <div className="budget-bar">
          {/* Solid up to where the first island stopped, lighter on to the last. */}
          <span className="budget-fill">
            <i className="budget-reached" style={{ width: width(fewest / target) }} />
            <i className="budget-range" style={{ width: width((most - fewest) / target) }} />
          </span>
          {clusters.map((cluster, index) => {
            // Stacked, each dot shows a 6 px sliver; fanned out, they sit a full dot apart. The row stays inside the track.
            const open = openCluster === index || cluster.islands.some((island) => island.island === hover?.island && hover.on !== 'evaluations');
            const step = open ? 17 : 6;
            const half = ((cluster.islands.length - 1) * step) / 2 + 7;
            const hovered = cluster.islands.find((island) => island.island === hover?.island && hover.on !== 'evaluations');
            return (
              <div
                key={cluster.islands[0]!.island}
                className="budget-cluster"
                style={{ left: `clamp(${half}px, ${width(cluster.at)}, 100% - ${half}px)`, width: half * 2 + 8 }}
                onPointerEnter={() => setOpenCluster(index)}
                onPointerLeave={() => setOpenCluster(null)}
              >
                {cluster.islands.map((island, position) => {
                  const offset = (position - (cluster.islands.length - 1) / 2) * step;
                  return (
                    <b
                      key={island.island}
                      className={`budget-dot ${markerOf(island.end)}${hovered === island ? ' budget-dot-active' : ''}`}
                      style={vars({
                        left: `calc(50% + ${offset}px)`,
                        zIndex: hovered === island ? 2 : 1,
                        '--island': islandColor(island.island),
                      })}
                      {...hoverProps(island.island, 'generations')}
                    />
                  );
                })}
                {hovered && (
                  <div
                    className={tipClass(cluster.at)}
                    style={{ left: `calc(50% + ${(cluster.islands.indexOf(hovered) - (cluster.islands.length - 1) / 2) * step}px)` }}
                  >
                    {tipTitle(hovered.island)}
                    {hovered.generations} of {numberFormat.format(target)} generations
                    <span>{hovered.end ? stopText(hovered.end) : 'No end recorded; the island may have crashed'}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div className={`budget-legend${keyEntries.length ? ' budget-legend-with-reasons' : ''}`}>
        {islands.map((island) => (
          <span key={island.island} className={`budget-legend-island${dim(island.island)}`} {...hoverProps(island.island, 'legend')}>
            <IslandSwatch island={island.island} />
            Island {island.island}
          </span>
        ))}
        {/* Read as one sentence, so only the first entry names the islands: "1 island stagnated · 1 failed". */}
        {keyEntries.map((entry, index) => (
          <span key={entry.marker + entry.phrase} className={`budget-legend-reason${index === 0 ? ' budget-legend-first' : ''}`}>
            <i className={`budget-key-dot ${entry.marker}`} aria-hidden="true" />
            {index === 0 && entry.count === islands.length && entry.count > 1 ? 'All ' : ''}
            {entry.count}
            {index === 0 ? (entry.count === 1 ? ' island ' : ' islands ') : ' '}
            {entry.phrase}
          </span>
        ))}
      </div>
    </section>
  );
}
