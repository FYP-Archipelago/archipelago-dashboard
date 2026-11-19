import { useState, type KeyboardEvent } from 'react';

import Icon from '@/components/Icon.tsx';
import type { Presets } from '@/types.ts';

import { Switch } from './fields.tsx';
import { TORUS_ISLANDS, type Form, type Patch, type ScheduleKey, type SetText } from './form.ts';
import { ISLAND_COLORS, TOPOLOGIES, vars, type Pt } from './shared.ts';

import './migration.css';

type Step = (key: ScheduleKey, delta: number) => void;

type ScheduleProps = { form: Form; errors: Record<string, string>; setText: SetText; step: Step };

type MigrationProps = ScheduleProps & { overrides: Presets['overrides']; patch: Patch };

function TopologyGlyph({ kind, count }: { kind: string; count: number }) {
  const size = 44;
  const centre = size / 2;
  const radius = 15;

  let points: Pt[] = Array.from({ length: count }, (_, i) => [
    centre + radius * Math.sin((2 * Math.PI * i) / count),
    centre - radius * Math.cos((2 * Math.PI * i) / count),
  ]);
  let edges: [number, number][] = [];

  if (kind === 'ring' || kind === 'bidirectional_ring') edges = points.map((_, i) => [i, (i + 1) % count]);
  if (kind === 'fully_connected') for (let i = 0; i < count; i++) for (let j = i + 1; j < count; j++) edges.push([i, j]);
  if (kind === 'lattice') {
    points = Array.from({ length: count }, (_, i) => [6 + (i * (size - 12)) / (count - 1), centre + (i % 2 ? -6 : 6)]);
    edges = points.slice(1).map((_, i) => [i, i + 1]);
  }
  if (kind === 'star') {
    points = [[centre, centre], ...points.slice(0, count - 1)];
    edges = points.slice(1).map((_, i) => [0, i + 1]);
  }
  if (kind === 'torus') {
    points = [0, 1, 2].flatMap((x) => [0, 1].map((y) => [9 + x * 13, 14 + y * 16] as Pt));
    edges = [
      [0, 2],
      [2, 4],
      [1, 3],
      [3, 5],
      [0, 1],
      [2, 3],
      [4, 5],
    ];
  }
  if (kind === 'random') {
    const links: [number, number][] = [
      [0, 2],
      [1, 3],
      [2, 4],
      [0, 3],
      [4, 1],
      [5, 2],
    ];
    edges = links.filter(([from, to]) => from < points.length && to < points.length);
  }

  // A one-way ring is dashed so it reads differently from the bidirectional one.
  const oneWay = kind === 'ring';

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      {edges.map(([from, to], i) => (
        <line
          key={i}
          x1={points[from]![0]}
          y1={points[from]![1]}
          x2={points[to]![0]}
          y2={points[to]![1]}
          stroke="currentColor"
          strokeOpacity={oneWay ? 0.7 : 0.45}
          strokeWidth={1.2}
          strokeDasharray={oneWay ? '3 2' : undefined}
        />
      ))}
      {points.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={3.2} fill={ISLAND_COLORS[i % ISLAND_COLORS.length]} />
      ))}
    </svg>
  );
}

// Arrow keys step the calendar and population pickers, which act as sliders.
const sliderKeys = (key: ScheduleKey, step: Step) => (event: KeyboardEvent<Element>) => {
  const delta = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[event.key];
  if (!delta) return;

  event.preventDefault();
  step(key, delta * (event.shiftKey ? 10 : 1));
};

// Roughly the per-island population the runner will use: the island's budget over (generations + 1),
// divided again by the 7 offspring per parent that evolution strategies spend by default, at least 4.
function populationOf(form: Form, errors: Record<string, string>): number | null {
  if (errors.evaluation_budget || errors.target_generations) return null;

  const budgetPerIsland = Math.floor(Number(form.text.evaluation_budget) / form.islands);
  const offspring = form.preset.algorithm === 'es' ? 7 : 1;
  return Math.max(4, Math.round(budgetPerIsland / ((Number(form.text.target_generations) + 1) * offspring)));
}

// The run as a calendar of generations: click the day of the first migration.
function IntervalCalendar({ form, errors, setText, step }: ScheduleProps) {
  const [hovered, setHovered] = useState(0);

  const target = Number(form.text.target_generations);
  const generations = errors.target_generations || !(target > 0) ? null : target;
  const interval = Number(form.text['migration.interval']);
  const intervalValid = generations !== null && !errors['migration.interval'] && interval >= 1;

  const totalGenerations = generations ?? 0;
  // At most 250 squares; longer runs give each square several generations.
  const perSquare = Math.max(1, Math.ceil(totalGenerations / 250));
  const squares = Math.ceil(totalGenerations / perSquare);
  const shownInterval = hovered || (intervalValid ? interval : 0);
  const migrationCount = shownInterval ? Math.floor(totalGenerations / shownInterval) : 0;

  return (
    <div>
      <div className="q-head">
        <span className="ms-label">
          <Icon name="clock" size={14} />
          Interval
        </span>
        <span className="mg-readout">
          {errors['migration.interval'] ??
            (shownInterval ? (
              <>
                {hovered ? 'click to migrate ' : ''}every <b className="num">{shownInterval}</b> generations · <b className="num">{migrationCount}</b>{' '}
                migrations
              </>
            ) : (
              'Set target generations first'
            ))}
        </span>
      </div>
      <div
        className="cal-grid"
        role="slider"
        tabIndex={form.migration ? 0 : -1}
        aria-label="Interval"
        aria-valuemin={1}
        aria-valuemax={generations ?? undefined}
        aria-valuenow={intervalValid ? interval : undefined}
        onKeyDown={form.migration ? sliderKeys('migration.interval', step) : undefined}
        onPointerLeave={() => setHovered(0)}
      >
        {Array.from({ length: squares }, (_, i) => {
          const lastGeneration = Math.min(totalGenerations, (i + 1) * perSquare);
          const migrates = shownInterval > 0 && Math.floor(lastGeneration / shownInterval) > Math.floor((i * perSquare) / shownInterval);
          const alone = shownInterval > 0 && lastGeneration < shownInterval;
          const first = migrates && Math.floor(lastGeneration / shownInterval) === 1;
          return (
            <button
              key={i}
              type="button"
              tabIndex={-1}
              aria-label={`Generation ${lastGeneration}`}
              title={`Generation ${lastGeneration}`}
              className={`cal-day${migrates ? ' migrates' : ''}${alone ? ' alone' : ''}${first ? ' first' : ''}`}
              onPointerEnter={() => setHovered(lastGeneration)}
              onClick={() => setText('migration.interval')(String(lastGeneration))}
            />
          );
        })}
      </div>
      <div className="cal-legend">
        <span>
          <i className="alone" /> evolving alone
        </span>
        <span>
          <i className="migrates" /> migration
        </span>
        <span className="num">
          {perSquare > 1 ? `each square is ${perSquare} generations · ` : 'each square is a generation · '}
          {generations ?? '—'} in all
        </span>
      </div>
    </div>
  );
}

// One island's population, best first: click how many of the best to send.
function MigrantPopulation({ form, errors, setText, step }: ScheduleProps) {
  const [hovered, setHovered] = useState(0);

  const population = populationOf(form, errors);
  const migrants = errors['migration.num_migrants'] ? 0 : Number(form.text['migration.num_migrants']);
  const shownMigrants = hovered || migrants;
  // The grid draws at most 160 individuals.
  const limit = 160;
  const drawn = Math.min(population ?? 40, limit);

  return (
    <div>
      <div className="q-head">
        <span className="ms-label">
          <Icon name="arrowR" size={14} />
          Migrants per route
        </span>
        <span className="mg-readout">
          {errors['migration.num_migrants'] ?? (
            <>
              {hovered ? 'click to send ' : 'sends '}its best <b className="num">{shownMigrants}</b>
              {population !== null && (
                <>
                  {' '}
                  of about <b className="num">{population}</b> ({Math.round((shownMigrants / population) * 100)}%)
                </>
              )}{' '}
              along each route
            </>
          )}
        </span>
      </div>
      <div
        className="pop-grid"
        role="slider"
        tabIndex={form.migration ? 0 : -1}
        aria-label="Migrants per route"
        aria-valuemin={1}
        aria-valuemax={population ? population - 1 : undefined}
        aria-valuenow={migrants || undefined}
        onKeyDown={form.migration ? sliderKeys('migration.num_migrants', step) : undefined}
        onPointerLeave={() => setHovered(0)}
      >
        {Array.from({ length: drawn }, (_, i) => {
          // Sending the whole population is not allowed, so the last individual always stays.
          const locked = population !== null && i >= population - 1;
          return (
            <button
              key={i}
              type="button"
              tabIndex={-1}
              disabled={locked}
              aria-label={`Send the best ${i + 1}`}
              className={`pop-one${i < shownMigrants ? ' sent' : ''}${hovered && i < hovered ? ' preview' : ''}`}
              style={vars({ '--i': i })}
              onPointerEnter={() => !locked && setHovered(i + 1)}
              onClick={() => setText('migration.num_migrants')(String(i + 1))}
            />
          );
        })}
      </div>
      <div className="cal-legend">
        <span>best</span>
        <span className="pop-arrow">
          <Icon name="arrowR" size={11} />
        </span>
        <span>worst</span>
        <span className="num">
          {population === null
            ? 'population size depends on budget and generations'
            : population > limit
              ? `showing the best ${limit} of about ${population}`
              : `about ${population} per island, from budget and generations`}
        </span>
      </div>
    </div>
  );
}

export default function MigrationSection({ form, errors, overrides, patch, setText, step }: MigrationProps) {
  const topologySpec = overrides['migration.topology'];
  const topologies = topologySpec?.type === 'choice' ? topologySpec.choices : [form.topology];

  return (
    <section className="nr-step">
      <div className="step-h">
        <h2>Migration</h2>
        <button className="title-switch" role="switch" aria-checked={form.migration} onClick={() => patch({ migration: !form.migration })}>
          {form.migration ? 'On' : 'Off'}
          <Switch on={form.migration} />
        </button>
      </div>
      <p className="desc">{form.migration ? 'How individuals move between islands.' : 'Islands evolve in isolation.'}</p>
      <fieldset className="mig-body" disabled={!form.migration}>
        <div className="topos" role="radiogroup" aria-label="Migration topology">
          {topologies.map((kind) => (
            <button
              key={kind}
              type="button"
              className={`topo${form.topology === kind ? ' on' : ''}${kind === 'torus' && form.islands !== TORUS_ISLANDS ? ' invalid' : ''}`}
              role="radio"
              aria-checked={form.topology === kind}
              title={kind === 'torus' ? `Needs ${TORUS_ISLANDS} islands` : undefined}
              onClick={() => patch({ topology: kind })}
            >
              <TopologyGlyph kind={kind} count={kind === 'torus' ? TORUS_ISLANDS : form.islands} />
              {TOPOLOGIES[kind] ?? kind}
            </button>
          ))}
        </div>
        {errors.topology && <p className="field-error block">{errors.topology}</p>}
        <div className="mq">
          <IntervalCalendar form={form} errors={errors} setText={setText} step={step} />
          <MigrantPopulation form={form} errors={errors} setText={setText} step={step} />
        </div>
      </fieldset>
    </section>
  );
}
