import { useMemo, useState } from 'react';

import { heatColor, heatGradient, heatInk, islandColor, pairColor } from '@/colors.ts';
import Icon from '@/components/Icon.tsx';
import LineChart, { type Guide } from '@/pages/run-workspace/charts/LineChart.tsx';
import { EmptyState, NoResult, type ResultQuery } from '@/pages/run-workspace/shared.tsx';
import type { Run, RunResult } from '@/types.ts';

import { describeTrend, meanOf, notableMigrations, pairKey, wholeRunPairs, windowValues, type Pair } from './divergence.ts';

import './divergence.css';

const significant = new Intl.NumberFormat('en', { maximumSignificantDigits: 2 });
const pValueFormat = new Intl.NumberFormat('en', { maximumSignificantDigits: 3 });
const value = (v: number | null) => (v === null ? '—' : significant.format(v));

// The generation-swap test's usual cut-off: below it, the gap is unlikely to come from chance.
const REAL_DIFFERENCE = 0.05;

const pairName = (a: number, b: number) => `${a} ↔ ${b}`;

const MIGRATION_DIRECTIONS = [
  { key: 'closer', label: 'Drew closer' },
  { key: 'apart', label: 'Moved apart' },
] as const;
type MigrationSeries = { key: number; label: string; shortLabel: string; color: string };
type MigrationChange = Record<(typeof MIGRATION_DIRECTIONS)[number]['key'], MigrationSeries[]>;

function MigrationHover({ migrations }: { migrations: [number, MigrationChange][] }) {
  return (
    <div className="divergence-hover-migrations">
      {migrations.map(([generation, change]) => (
        <div key={generation} className="divergence-hover-event">
          <div className="divergence-hover-generation">After migration at generation {generation}</div>
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
      ))}
    </div>
  );
}

function Matrix({
  islands,
  values,
  selected,
  onSelect,
}: {
  islands: number[];
  values: Map<string, number>;
  selected: string;
  onSelect: (key: string) => void;
}) {
  const most = Math.max(...values.values(), 1e-12);
  return (
    <div className="heat-grid" style={{ gridTemplateColumns: `auto repeat(${islands.length}, minmax(34px, 1fr))` }}>
      <span />
      {islands.map((island) => (
        <span key={island} className="heat-axis">
          <i className="swatch" style={{ background: islandColor(island) }} />
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
            return (
              <button
                key={b}
                className={`heat-cell${key === selected ? ' heat-cell-selected' : ''}`}
                style={{ background: heatColor(shade), color: heatInk(shade) }}
                aria-pressed={key === selected}
                aria-label={`Islands ${pairName(a, b)}: ${value(v)}`}
                onClick={() => onSelect(key)}
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
  const pairShortcuts = most.key === least.key ? [most] : [most, least];

  const [selected, setSelected] = useState(most.key);
  const [view, setView] = useState<'whole' | 'window'>('whole');
  const [windowIndex, setWindowIndex] = useState(starts.length - 1);
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set([most.key, least.key]));

  const pair = pairs.find((p) => p.key === selected) ?? most;
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
  const settings = run.run_settings;
  const migrationEnabled = settings['migration.enabled'];
  const changesByGeneration = new Map<number, MigrationChange>();
  const lastGeneration = result.generation_history.reduce((last, row) => Math.max(last, row.generation), starts.at(-1) ?? 0);
  // The migrations after which the mean of all pairs jumped, marked on the chart with the pairs' and counted above it.
  const meanMigrations = migrationEnabled ? notableMigrations(settings['migration.interval'], lastGeneration, starts, means) : [];
  const migrationCount = Math.floor(lastGeneration / settings['migration.interval']);
  const closerAfterMigration = meanMigrations.filter((migration) => migration.mark === 'down').length;
  const apartAfterMigration = meanMigrations.length - closerAfterMigration;
  // With the extra stat, the strip packs its columns to their content and shortens the notes so each stays on one line.
  const meanStat = migrationEnabled && migrationCount > 0;
  if (migrationEnabled && (pairSeries.length || meanMigrations.length)) {
    for (const series of [mean, ...pairSeries]) {
      for (const { x, mark } of notableMigrations(settings['migration.interval'], lastGeneration, starts, series.ys)) {
        const change = changesByGeneration.get(x) ?? { closer: [], apart: [] };
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
  // Selecting a pair in the matrix also puts it on the chart.
  const select = (key: string) => {
    setSelected(key);
    setPicked((prev) => new Set(prev).add(key));
  };
  const togglePicked = (key: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const windowLabel = (index: number) =>
    index < starts.length - 1 ? `Generations ${starts[index]} to ${starts[index + 1]! - 1}` : `From generation ${starts[index]}`;
  // The window just after a marked migration says what the migration was followed by.
  const hoverTitle = (x: number) => {
    const index = starts.indexOf(x);
    const migrations = migrationChanges.filter(([generation]) => generation > (starts[index - 1] ?? -Infinity) && generation <= x);
    return (
      <>
        <span className="divergence-hover-window">{windowLabel(index)}</span>
        {migrations.length > 0 && <MigrationHover migrations={migrations} />}
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
          <div title="Migrations after which the mean of all pairs moved by at least a quarter of its range over the run">
            <span className="muted">Mean after migration</span>
            <strong>
              {meanMigrations.length}
              <small>of {migrationCount} migrations</small>
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
            <span className="muted">Per window of generations</span>
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
          <p className="hint">
            Each window{starts.length > 1 && ` (${starts[1]! - starts[0]!} generations)`} is measured against how spread out the population was at
            that time, so this shows the trend. The numbers are not on the whole-run scale.
          </p>
        </section>
        <section className="card">
          <div className="card-header">
            <h3>Between islands</h3>
            <div className="segmented-control card-header-end" role="group" aria-label="Period">
              <button className={view === 'whole' ? 'on' : ''} aria-pressed={view === 'whole'} onClick={() => setView('whole')}>
                Whole run
              </button>
              <button className={view === 'window' ? 'on' : ''} aria-pressed={view === 'window'} onClick={() => setView('window')}>
                By window
              </button>
            </div>
          </div>
          <Matrix
            islands={islands}
            values={view === 'whole' ? new Map(pairs.map((p) => [p.key, p.value])) : windows[windowIndex]!}
            selected={pair.key}
            onSelect={select}
          />
          <div className="heat-scale">
            <span>Alike</span>
            <i style={{ background: heatGradient() }} />
            <span>Different</span>
            <span className="heat-scale-note">{view === 'whole' ? 'Whole run' : `${windowLabel(windowIndex)} · point at the chart to move`}</span>
          </div>
          <dl className="key-value-list pair-facts">
            <div className="pair-selection">
              <dt>Selected pair</dt>
              <dd>
                <div className="pair-shortcuts" role="group" aria-label="Pair shortcuts">
                  {pairShortcuts.map((shortcut) => (
                    <button
                      key={shortcut.key}
                      className="pair-chip"
                      aria-pressed={pair.key === shortcut.key}
                      title={shortcut.key === most.key ? 'Most different' : 'Most alike'}
                      onClick={() => select(shortcut.key)}
                    >
                      Islands {pairName(shortcut.a, shortcut.b)}
                    </button>
                  ))}
                </div>
                {pair.key !== most.key && pair.key !== least.key && <span>Islands {pairName(pair.a, pair.b)}</span>}
              </dd>
            </div>
            <div>
              <dt>Whole run</dt>
              <dd>{value(pair.value)}</dd>
            </div>
            <div title="How often shuffling whole generations between the two islands gave a gap at least this big">
              <dt>Swap test</dt>
              <dd>
                {verdict(pair)} <span className="muted">· p = {pValueFormat.format(pair.p)}</span>
              </dd>
            </div>
          </dl>
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
