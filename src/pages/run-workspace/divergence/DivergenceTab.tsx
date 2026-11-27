import { useMemo, useState } from 'react';

import { heatColor, heatGradient, heatInk, pairColor } from '@/colors.ts';
import Icon from '@/components/Icon.tsx';
import Segmented from '@/components/Segmented.tsx';
import LineChart, { type Guide } from '@/pages/run-workspace/charts/LineChart.tsx';
import { EmptyState, IslandSwatch, NoResult, type ResultQuery } from '@/pages/run-workspace/shared.tsx';
import type { Run, RunResult } from '@/types.ts';

import {
  describeTrend,
  meanOf,
  migrationGroups,
  notableMigrations,
  pairKey,
  REAL_DIFFERENCE,
  wholeRunPairs,
  windowValues,
  type Pair,
} from './divergence.ts';

import WithinBetween from './WithinBetween.tsx';
import './divergence.css';

const significant = new Intl.NumberFormat('en', { maximumSignificantDigits: 2 });
const pValueFormat = new Intl.NumberFormat('en', { maximumSignificantDigits: 3 });
const value = (v: number | null) => (v === null ? '—' : significant.format(v));

const pairName = (a: number, b: number) => `${a} ↔ ${b}`;

const MIGRATION_DIRECTIONS = [
  { key: 'closer', label: 'Drew closer' },
  { key: 'apart', label: 'Moved apart' },
] as const;
type MigrationSeries = { key: number; label: string; shortLabel: string; color: string };
// What moved after a group of migration rounds that share one measurement, and the rounds' generations.
type MigrationChange = Record<(typeof MIGRATION_DIRECTIONS)[number]['key'], MigrationSeries[]> & { generations: number[] };

// What moved after the migration rounds just before a window, with how many migrations those rounds sent.
function MigrationHover({ change, count, gap }: { change: MigrationChange; count: number; gap: [number, number] }) {
  return (
    <div className="divergence-hover-migrations">
      <div className="divergence-hover-event">
        <div className="divergence-hover-generation">
          {count === 1 ? 'After 1 migration' : `After ${count.toLocaleString('en')} migrations`}
          <span className="muted"> · {gap[0] === gap[1] ? `gen ${gap[0]}` : `gen ${gap[0]}–${gap[1]}`}</span>
        </div>
        {MIGRATION_DIRECTIONS.map(({ key, label }) => {
          const affected = change[key];
          if (!affected.length) return null;
          return (
            <div key={key} className="divergence-hover-direction">
              <div className="divergence-hover-direction-label">
                <i className="divergence-migration-arrow" data-direction={key} aria-hidden="true" />
                {label}
              </div>
              <ul className="divergence-hover-tags-list" role="list">
                {affected.map((series) => (
                  <li key={series.key} aria-label={series.label}>
                    <i className="swatch" style={{ background: series.color }} aria-hidden="true" />
                    {series.shortLabel}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Pairs on the chart are highlighted, and clicking a cell puts its pair on the chart or takes it off.
// Over the whole run, a pair the swap test finds really different gets a mark in its corner.
function Matrix({
  islands,
  values,
  picked,
  tests,
  onToggle,
}: {
  islands: number[];
  values: Map<string, number>;
  picked: ReadonlySet<string>;
  tests: Map<string, number> | null;
  onToggle: (key: string) => void;
}) {
  const most = Math.max(...values.values(), 1e-12);
  return (
    <div className="heat-grid" style={{ gridTemplateColumns: `auto repeat(${islands.length}, minmax(34px, 1fr))` }}>
      <span />
      {islands.map((island) => (
        <span key={island} className="heat-axis">
          <IslandSwatch island={island} />
          {island}
        </span>
      ))}
      {islands.map((a) => (
        <div key={a} className="heat-row">
          <span className="heat-axis heat-axis-row">Island {a}</span>
          {islands.map((b) => {
            const key = pairKey(a, b);
            const v = values.get(key);
            if (a === b) return <span key={b} className="heat-cell heat-cell-same" />;
            if (v === undefined)
              return (
                <span key={b} className="heat-cell heat-cell-empty" title="One of the islands logged nothing in this window">
                  ·
                </span>
              );
            const shade = v / most;
            const p = tests?.get(key);
            const real = p !== undefined && p < REAL_DIFFERENCE;
            return (
              <button
                key={b}
                className={`heat-cell${picked.has(key) ? ' heat-cell-selected' : ''}${real ? ' heat-cell-real' : ''}`}
                style={{ background: heatColor(shade), color: heatInk(shade) }}
                aria-pressed={picked.has(key)}
                aria-label={`Islands ${pairName(a, b)}: ${value(v)}`}
                title={p === undefined ? undefined : `${real ? 'Real difference' : 'Could be chance'} · swap test p = ${pValueFormat.format(p)}`}
                onClick={() => onToggle(key)}
              >
                {value(v)}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function Divergence({ run, result }: { run: Run; result: RunResult }) {
  const { separation } = result;
  const islands = result.run.islands;
  const pairs = useMemo(() => wholeRunPairs(separation), [separation]);
  const windows = useMemo(() => windowValues(separation), [separation]);
  const starts = separation.windows.from_generation;
  const byValue = [...pairs].sort((x, y) => y.value - x.value);
  const most = byValue[0]!;
  const least = byValue.at(-1)!;

  const [view, setView] = useState<'whole' | 'window'>('whole');
  const [windowIndex, setWindowIndex] = useState(starts.length - 1);
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set([most.key, least.key]));

  const means = useMemo(() => windows.map(meanOf), [windows]);
  const firstMean = means.find((m) => m !== null) ?? null;
  const lastMean = [...means].reverse().find((m) => m !== null) ?? null;
  const trend = describeTrend(means, starts);
  const real = pairs.filter((p) => p.p < REAL_DIFFERENCE).length;

  const mean = { key: -1, label: 'Mean of all pairs', shortLabel: 'Mean of all pairs', color: 'var(--muted)', xs: starts, ys: means };
  // Keys: the mean is -1; each pair is its index in `pairs`.
  const pairSeries = pairs
    .filter((p) => picked.has(p.key))
    .map((p) => ({
      key: pairs.indexOf(p),
      label: `Islands ${pairName(p.a, p.b)}`,
      shortLabel: pairName(p.a, p.b),
      color: pairColor(pairs.indexOf(p)),
      xs: starts,
      ys: windows.map((window) => window.get(p.key) ?? null),
    }));
  const migrationEnabled = run.run_settings['migration.enabled'];
  const changesByGeneration = new Map<number, MigrationChange>();
  // The migration rounds that happened, named by the generation the migrants were sent at.
  const groups = useMemo(
    () =>
      migrationGroups(
        result.migration_arrivals.map((arrival) => arrival.source_generation),
        starts
      ),
    [result, starts]
  );
  // The rounds after which the mean of all pairs jumped, marked on the chart with the pairs' and counted above it.
  const meanChanges = migrationEnabled ? notableMigrations(groups, means) : { measured: 0, notable: [] };
  const meanMigrations = meanChanges.notable;
  const rounds = (changes: { generations: number[] }[]) => changes.reduce((sum, change) => sum + change.generations.length, 0);
  const closerAfterMigration = rounds(meanMigrations.filter((migration) => migration.mark === 'down'));
  const apartAfterMigration = rounds(meanMigrations) - closerAfterMigration;
  // With the extra stat, the strip packs its columns to their content and shortens the notes so each stays on one line.
  const meanStat = meanChanges.measured > 0;
  if (migrationEnabled && (pairSeries.length || meanMigrations.length)) {
    for (const series of [mean, ...pairSeries]) {
      for (const { x, generations, mark } of notableMigrations(groups, series.ys).notable) {
        const change = changesByGeneration.get(x) ?? { closer: [], apart: [], generations };
        change[mark === 'down' ? 'closer' : 'apart'].push(series);
        changesByGeneration.set(x, change);
      }
    }
  }
  const migrationChanges = [...changesByGeneration].sort(([a], [b]) => a - b);
  const guides: Guide[] = migrationChanges.map(([x, { closer, apart }]) => ({
    x,
    mark: closer.length && apart.length ? 'both' : closer.length ? 'down' : 'up',
  }));
  const togglePicked = (key: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const shownValues = view === 'whole' ? new Map(pairs.map((p) => [p.key, p.value])) : windows[windowIndex]!;
  // Each island's own mean diversity over the shown period (the whole run, or the window's generations).
  const diversity = new Map<number, number>();
  for (const island of islands) {
    const own = result.generation_history.filter(
      (row) =>
        row.island_id === island &&
        row.diversity !== null &&
        (view === 'whole' ||
          (row.generation >= starts[windowIndex]! && (windowIndex === starts.length - 1 || row.generation < starts[windowIndex + 1]!)))
    );
    if (own.length) diversity.set(island, own.reduce((sum, row) => sum + row.diversity!, 0) / own.length);
  }
  const shortWindowLabel = (index: number) =>
    index < starts.length - 1 ? `Gen ${starts[index]}–${starts[index + 1]! - 1}` : `Gen ${starts[index]}+`;
  const windowLabel = (index: number) =>
    index < starts.length - 1 ? `Generations ${starts[index]} to ${starts[index + 1]! - 1}` : `From generation ${starts[index]}`;
  // The window just after a marked migration says what the migration was followed by.
  const hoverTitle = (x: number) => {
    const index = starts.indexOf(x);
    // The window is the first measured after the migrations that arrived since the previous window began.
    const previous = starts[index - 1];
    const migrations = migrationChanges.filter(([generation]) => generation > (previous ?? -Infinity) && generation <= x);
    const merged: MigrationChange = { closer: [], apart: [], generations: [] };
    for (const [, change] of migrations) {
      for (const direction of ['closer', 'apart'] as const)
        for (const series of change[direction]) if (!merged[direction].some((other) => other.key === series.key)) merged[direction].push(series);
      merged.generations.push(...change.generations);
    }
    const shownRounds = new Set(merged.generations);
    const count = result.migration_arrivals.filter((arrival) => shownRounds.has(arrival.source_generation)).length;
    return (
      <>
        <span className="divergence-hover-window">{windowLabel(index)}</span>
        {count > 0 && previous !== undefined && <MigrationHover change={merged} count={count} gap={[previous + 1, x]} />}
      </>
    );
  };
  const verdict = (p: Pair) => (p.p < REAL_DIFFERENCE ? 'Real difference' : 'Could be chance');

  return (
    <>
      <section className={`card stat-strip${meanStat ? ' stat-strip-single-line' : ''}`}>
        <div>
          <span className="muted">Most different</span>
          <strong>Islands {pairName(most.a, most.b)}</strong>
          <span className="stat-note">
            {value(most.value)}
            {meanStat ? '' : ' over the whole run'} · <span>{verdict(most)}</span>
          </span>
        </div>
        <div>
          <span className="muted">Most alike</span>
          <strong>Islands {pairName(least.a, least.b)}</strong>
          <span className="stat-note">
            {value(least.value)}
            {meanStat ? '' : ' over the whole run'} · <span>{verdict(least)}</span>
          </span>
        </div>
        <div title="Pairs whose gap a generation-swap test finds unlikely to be chance (p below 0.05)">
          <span className="muted">Real differences</span>
          <strong>
            {real}
            <small>of {pairs.length} pairs</small>
          </strong>
          <span className="stat-note">
            {real === pairs.length ? (meanStat ? 'Each pair in its own region' : 'Every pair searched its own region') : 'The rest overlap'}
          </span>
        </div>
        {meanStat && (
          <div
            title={
              'Migration rounds after which the mean of all pairs moved by at least a quarter of its range over the run, comparing ' +
              'the window before each round with the one after. Rounds between the same two windows are judged together.'
            }
          >
            <span className="muted">Mean after migration</span>
            <strong>
              {rounds(meanMigrations)}
              <small>of {meanChanges.measured} migration rounds</small>
            </strong>
            <span className="stat-note">
              {meanMigrations.length ? `${closerAfterMigration} drew closer · ${apartAfterMigration} moved apart` : 'None moved it much'}
            </span>
          </div>
        )}
        {firstMean !== null && lastMean !== null && trend && (
          <div>
            <span className="muted">Mean per window, first → last</span>
            <strong>
              {value(firstMean)} → {value(lastMean)}
            </strong>
            <span className="stat-note">{trend}</span>
          </div>
        )}
      </section>

      <div className="divergence-grid">
        <section className="card chart-column">
          <div className="card-header card-heading">
            <h3>Over the run</h3>
            <span className="muted">
              {starts.length > 1 ? `Per window of ${starts[1]! - starts[0]!} generations, each on its own scale` : 'Per window of generations'}
            </span>
          </div>
          <div className="pair-picker" role="group" aria-label="Pairs on the chart">
            {pairs.map((p) => (
              <button
                key={p.key}
                className={`pair-chip${picked.has(p.key) ? '' : ' pair-chip-off'}`}
                aria-pressed={picked.has(p.key)}
                onClick={() => togglePicked(p.key)}
              >
                <i className="legend-line" style={{ background: pairColor(pairs.indexOf(p)) }} />
                {pairName(p.a, p.b)}
              </button>
            ))}
            <button className="pair-chip" onClick={() => setPicked(new Set(pairs.map((p) => p.key)))}>
              All
            </button>
            <button className="pair-chip" onClick={() => setPicked(new Set())}>
              None
            </button>
          </div>
          <LineChart
            label="Divergence per window of generations"
            series={[mean, ...pairSeries]}
            log={false}
            xTitle="Generation"
            hoverTitle={hoverTitle}
            formatY={value}
            better="higher"
            highlight={null}
            marker={null}
            replayKey="divergence"
            onHoverX={(x) => setWindowIndex(starts.indexOf(x))}
            pinnedX={view === 'window' ? starts[windowIndex] : null}
            guides={guides}
          />
          <div className="chart-legend">
            <span>
              <i className="legend-line muted-line" />
              Mean of all pairs
            </span>
            {guides.length > 0 &&
              MIGRATION_DIRECTIONS.map(({ key, label }) => (
                <span key={key}>
                  <i className="divergence-migration-arrow" data-direction={key} aria-hidden="true" />
                  {label} after migration
                </span>
              ))}
            {pairSeries.length > 0 && guides.length === 0 && (
              <span>
                <Icon name={migrationEnabled ? 'info' : 'migrationOff'} size={13} />
                {migrationEnabled ? 'No picked pair had a big change after migration' : 'Migration was off'}
              </span>
            )}
          </div>
        </section>
        <section className="card">
          <div className="card-header">
            <h3>Island by island</h3>
            <Segmented
              className="card-header-end"
              label="Period"
              value={view}
              options={[
                { key: 'whole', label: 'Whole run' },
                { key: 'window', label: 'By window' },
              ]}
              onChange={setView}
            />
          </div>
          <Matrix
            islands={islands}
            values={shownValues}
            picked={picked}
            tests={view === 'whole' ? new Map(pairs.map((p) => [p.key, p.p])) : null}
            onToggle={togglePicked}
          />
          <div className={`heat-scale${view === 'window' ? ' heat-scale-compact' : ''}`}>
            <span>Alike</span>
            <i style={{ background: heatGradient() }} />
            <span>Different</span>
            {view === 'whole' ? (
              <>
                <span className="heat-real-key" title="The swap test finds the gap unlikely to be chance (p below 0.05)">
                  <span className="heat-real-mark" aria-hidden="true" />
                  Real difference
                </span>
                <span className="heat-scale-note">Whole run</span>
              </>
            ) : (
              <label className="window-slider">
                <input
                  type="range"
                  min={0}
                  max={starts.length - 1}
                  value={windowIndex}
                  aria-label="Window"
                  onChange={(event) => setWindowIndex(Number(event.target.value))}
                />
                <span>{shortWindowLabel(windowIndex)}</span>
              </label>
            )}
          </div>
          <WithinBetween islands={islands} values={shownValues} diversity={diversity} />
        </section>
      </div>
    </>
  );
}

export default function DivergenceTab({ run, result }: { run: Run; result: ResultQuery }) {
  if (!result.data) return <NoResult run={run} result={result} />;
  if (!result.data.separation.pairs.a.length) return <EmptyState icon="alert" title="Nothing to compare" />;
  return <Divergence run={run} result={result.data} />;
}
