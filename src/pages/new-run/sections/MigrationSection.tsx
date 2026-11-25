import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';

import Icon from '@/components/Icon.tsx';
import { TOPOLOGIES } from '@/format.ts';
import { populationOf, torusGrid, torusNeeds, type Form, type Patch, type ScheduleKey, type SetText } from '@/pages/new-run/form.ts';
import { arrowStep } from '@/pages/new-run/shared.ts';
import type { Presets } from '@/types.ts';

import { InlineNumber } from './fields.tsx';
import TopologyGlyph from './TopologyGlyph.tsx';

import './migration.css';

type Step = (key: ScheduleKey, delta: number) => void;

type ScheduleProps = { form: Form; errors: Record<string, string>; setText: SetText; step: Step };

type MigrationProps = ScheduleProps & { overrides: Presets['overrides']; patch: Patch };

// Arrow keys step the calendar and population pickers, which act as sliders.
const sliderKeys = (key: ScheduleKey, step: Step) => (event: KeyboardEvent<Element>) => {
  const delta = arrowStep(event, true);
  if (!delta) return;

  event.preventDefault();
  step(key, delta);
};

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
  const migrationCount = shownInterval > 0 ? Math.floor(totalGenerations / shownInterval) : 0;
  const shownError = hovered ? undefined : errors['migration.interval'];

  return (
    <div>
      <div className="migration-control-header">
        <span className="migration-control-label">
          <Icon name="clock" size={14} />
          Interval
        </span>
        <span className="migration-control-separator" aria-hidden="true">
          ·
        </span>
        <span className="migration-readout">
          every
          <InlineNumber
            label="Generations between migrations"
            value={hovered ? String(hovered) : form.text['migration.interval']}
            invalid={Boolean(shownError)}
            onChange={setText('migration.interval')}
            onStep={(delta) => step('migration.interval', delta)}
          />
          generations
          <span className="migration-readout-arrow">
            <Icon name="arrowR" size={13} />
          </span>
          {shownError ? (
            <span className="field-error">{shownError}</span>
          ) : generations === null ? (
            'set target generations first'
          ) : (
            <>
              <b className="numeric">{migrationCount}</b> {migrationCount === 1 ? 'migration event' : 'migration events'}
            </>
          )}
        </span>
      </div>
      <div
        className="migration-calendar"
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
              className={`migration-calendar-generation${migrates ? ' migration-calendar-event' : ''}${alone ? ' migration-calendar-solo' : ''}${first ? ' migration-calendar-first-event' : ''}`}
              onPointerEnter={() => setHovered(lastGeneration)}
              onClick={() => setText('migration.interval')(String(lastGeneration))}
            />
          );
        })}
      </div>
      <div className="migration-control-legend">
        <span>
          <i className="migration-calendar-solo" /> evolving alone
        </span>
        <span>
          <i className="migration-calendar-event" /> migration
        </span>
        <span className="numeric">
          {perSquare > 1 ? `each square is ${perSquare} generations · ` : 'each square is a generation · '}
          {generations ?? '—'} in all
        </span>
      </div>
    </div>
  );
}

// One island's population, best first: drag the cut to choose how many of the best are sent.
function MigrantRanked({ form, errors, setText, step }: ScheduleProps) {
  const [hovered, setHovered] = useState(0);
  const dragging = useRef(false);

  const key = 'migration.num_migrants';
  const population = populationOf(form);
  const migrants = errors[key] ? 0 : Number(form.text[key]);
  // The chart draws at most 160 individuals.
  const bars = Math.min(population ?? 40, 160);
  // Sending the whole population is not allowed.
  const max = population ? Math.min(bars, population - 1) : bars;
  const cut = Math.min(migrants, bars);

  const countAt = (event: PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    return Math.min(max, Math.max(1, Math.ceil(((event.clientX - box.left) / box.width) * bars)));
  };

  return (
    <div>
      <div className="migration-control-header">
        <span className="migration-control-label">
          <Icon name="arrowR" size={14} />
          Migrants per route
        </span>
        <span className="migration-control-separator" aria-hidden="true">
          ·
        </span>
        <span className="migration-readout">
          sends its best
          <InlineNumber
            label="Migrants per route"
            value={form.text[key]}
            invalid={Boolean(errors[key])}
            onChange={setText(key)}
            onStep={(delta) => step(key, delta)}
          />
          along each route
          <span className="migration-readout-arrow">
            <Icon name="arrowR" size={13} />
          </span>
          {errors[key] ? (
            <span className="field-error">{errors[key]}</span>
          ) : population === null ? (
            'population depends on budget and generations'
          ) : (
            <>
              <b className="numeric">{Math.round((migrants / population) * 100)}%</b> of about <b className="numeric">{population}</b>
            </>
          )}
        </span>
      </div>
      <div
        className="ranked-chart"
        role="slider"
        tabIndex={form.migration ? 0 : -1}
        aria-label="Migrants per route"
        aria-valuemin={1}
        aria-valuemax={max}
        aria-valuenow={migrants || undefined}
        onKeyDown={form.migration ? sliderKeys(key, step) : undefined}
        onPointerDown={(event) => {
          if (!form.migration) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          dragging.current = true;
          setHovered(0);
          setText(key)(String(countAt(event)));
        }}
        onPointerMove={(event) => {
          if (!form.migration) return;
          if (dragging.current) setText(key)(String(countAt(event)));
          else setHovered(countAt(event));
        }}
        onPointerUp={() => (dragging.current = false)}
        onPointerLeave={() => setHovered(0)}
      >
        {Array.from({ length: bars }, (_, i) => (
          <span
            key={i}
            className={`ranked-bar${i < cut ? ' ranked-bar-sent' : ''}${hovered && i < hovered && i >= cut ? ' ranked-bar-preview' : ''}${i >= max ? ' ranked-bar-locked' : ''}`}
          />
        ))}
        {cut > 0 && (
          <span className={`ranked-cut${cut / bars > 0.75 ? ' ranked-cut-flip' : ''}`} style={{ left: `${(cut / bars) * 100}%` }}>
            <span className="ranked-tag">
              best <b className="numeric">{migrants}</b> sent
              <Icon name="arrowR" size={11} />
            </span>
          </span>
        )}
      </div>
      <div className="migration-control-legend">
        <span>best migrants</span>
        <span className="population-size-arrow">
          <Icon name="arrowR" size={11} />
        </span>
        <span>worst migrants</span>
        {population !== null && population > bars && (
          <span className="numeric">
            showing the best {bars} of about {population}
          </span>
        )}
      </div>
    </div>
  );
}

export default function MigrationSection({ form, errors, overrides, patch, setText, step }: MigrationProps) {
  const topologySpec = overrides['migration.topology'];
  const topologies = topologySpec?.type === 'choice' ? topologySpec.choices : [form.topology];

  return (
    <section className="new-run-step">
      <div className="migration-header">
        <h2>Migration</h2>
        <div className={`migration-toggle${form.migration ? ' migration-toggle-on' : ''}`} role="radiogroup" aria-label="Migration">
          <i className="migration-toggle-thumb" aria-hidden="true" />
          {[false, true].map((on) => (
            <button
              key={String(on)}
              role="radio"
              aria-checked={form.migration === on}
              className={form.migration === on ? 'migration-toggle-selected' : undefined}
              onClick={() => patch({ migration: on })}
            >
              {on ? 'On' : 'Off'}
            </button>
          ))}
        </div>
      </div>
      <p className="new-run-step-description">{form.migration ? 'How individuals move between islands.' : 'Islands evolve in isolation.'}</p>
      <fieldset className="migration-fieldset" disabled={!form.migration}>
        <div className="migration-topologies" role="radiogroup" aria-label="Migration topology">
          {topologies.map((kind) => (
            <button
              key={kind}
              type="button"
              className={`migration-topology-option${form.topology === kind ? ' migration-topology-selected' : ''}${kind === 'torus' && !torusGrid(form.islands).valid ? ' migration-topology-invalid' : ''}`}
              role="radio"
              aria-checked={form.topology === kind}
              title={kind === 'torus' ? `Needs ${torusNeeds(overrides)}` : undefined}
              onClick={() => patch({ topology: kind })}
            >
              <TopologyGlyph kind={kind} count={form.islands} />
              {TOPOLOGIES[kind] ?? kind}
            </button>
          ))}
        </div>
        {errors.topology && <p className="field-error field-error-block">{errors.topology}</p>}
        <div className="migration-controls">
          <IntervalCalendar form={form} errors={errors} setText={setText} step={step} />
          <MigrantRanked form={form} errors={errors} setText={setText} step={step} />
        </div>
      </fieldset>
    </section>
  );
}
