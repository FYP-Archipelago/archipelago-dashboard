import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react';

import { compactNumber, duration, fitness, numberFormat } from '@/format.ts';
import { budgetPerIsland, reasonPhrase } from '@/pages/run-workspace/stops.ts';
import { reducedMotion } from '@/style.ts';
import type { TerminationReason } from '@/types.ts';

import IslandMap from './IslandMap.tsx';
import { capitalise, changeText, levelPoint, listed, percent, plural, runNotes, type OverviewData } from './overview.ts';

import './hero.css';

// Counts from the starting best to the final one, in orders of magnitude on a log scale.
function useCountUp({ improvement, best }: OverviewData) {
  const final = best?.fitness ?? null;
  const from = improvement?.start ?? final;
  const log = improvement?.log ?? false;
  const [value, setValue] = useState(reducedMotion() ? final : from);
  useEffect(() => {
    if (reducedMotion() || from === null || final === null) return;
    const begun = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - begun) / 1100);
      const eased = 1 - (1 - t) ** 3;
      if (t === 1) setValue(final);
      else setValue(log ? 10 ** (Math.log10(from) + (Math.log10(final) - Math.log10(from)) * eased) : from + (final - from) * eased);
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [from, final, log]);
  return value;
}

function BestNumber({ data }: { data: OverviewData }) {
  const shown = useCountUp(data);
  const { improvement, best } = data;
  return (
    <div className="hero-number">
      <span className="hero-kicker">
        Best fitness
        <span className="muted"> · {data.result.run.maximising ? 'higher is better' : 'lower is better'}</span>
      </span>
      <div className="hero-number-row">
        <span className="hero-number-value">
          <strong>{fitness(shown)}</strong>
          <strong aria-hidden="true">{fitness(best?.fitness ?? null)}</strong>
        </span>
        {improvement && best && (
          <span className={`hero-delta-chip${shown === best.fitness ? ' hero-delta-chip-settled' : ''}`}>
            {changeText(improvement.start, improvement.final)}
          </span>
        )}
      </div>
      {improvement && best && <span className="hero-change">from {fitness(improvement.start)}, the best at the start</span>}
    </div>
  );
}

const at = (data: OverviewData, x: number) => (data.axis === 'evaluations' ? `${compactNumber.format(x)} evaluations` : `generation ${x}`);

// Who found the run's best and when, then who else got there or came closest.
function foundText(data: OverviewData): ReactNode {
  const { best, bests, bestX, run, result } = data;
  if (!best) return null;
  const maximising = result.run.maximising;
  const ties = bests.filter((other) => other.fitness === best.fitness).length;
  const others = bests.filter((other) => other.island_id !== best.island_id);
  const runnerUp = others.reduce<(typeof others)[number] | null>(
    (top, other) => (!top || (maximising ? other.fitness > top.fitness : other.fitness < top.fitness) ? other : top),
    null
  );
  const parts: ReactNode[] = [<b key="island">Island {best.island_id}</b>];
  if (bestX !== null)
    parts.push(
      data.axis === 'evaluations' ? (
        <span key="when">
          at {at(data, bestX)} (<b>{percent(bestX / budgetPerIsland(run, result))}</b> of its budget)
        </span>
      ) : (
        `at ${at(data, bestX)}`
      )
    );
  if (ties > 1) parts.push(ties === bests.length ? `all ${ties} islands tied` : `${plural(ties - 1, 'other island')} tied`);
  else if (runnerUp) parts.push(`next best Island ${runnerUp.island_id} at ${fitness(runnerUp.fitness)}`);
  return parts.map((part, i) => (
    <span key={i}>
      {i > 0 && ' · '}
      {part}
    </span>
  ));
}

// When half the improvement was in, and how much of the search came after 99% of it.
function progressText(data: OverviewData): ReactNode {
  const { improvement, axis } = data;
  if (!improvement) return null;
  if (improvement.start === improvement.final) return 'No improvement on the best at the start';
  const half = levelPoint(data, 0.5);
  const last = levelPoint(data, 0.99);
  if (half === null) return null;
  const unit = axis === 'evaluations' ? 'evaluations' : 'generations';
  return (
    <>
      Half the gain in the first <b>{percent(1 - half.after)}</b> of {unit}
      {last !== null && (
        <>
          {' · '}
          <b>{percent(last.after)}</b> came after 99%
        </>
      )}
    </>
  );
}

// How many islands stopped for each reason, most common first. Empty for logs from before island_end.
function stopCounts({ result }: OverviewData): [TerminationReason, number][] {
  const counts = new Map<TerminationReason, number>();
  for (const end of result.island_ends) counts.set(end.termination_reason, (counts.get(end.termination_reason) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1]);
}

// "All 6 islands stagnated" or "3 islands spent their budget and 2 stagnated".
function stopsText(data: OverviewData): string | null {
  const counts = stopCounts(data);
  if (!counts.length) return null;
  const { islandCount } = data;
  const parts = counts.map(([reason, count], i) => {
    const subject = i > 0 ? `${count}` : count === islandCount && count > 1 ? `all ${count} islands` : plural(count, 'island');
    return `${subject} ${reasonPhrase(reason, count)}`;
  });
  const missing = islandCount - data.result.island_ends.length;
  if (missing > 0) parts.push(`${missing} left no end record`);
  return `${capitalise(listed(parts))}.`;
}

// The facts row's short form: "All stagnated" or "4 stagnated · 2 ran out".
const SHORT_REASONS: Record<TerminationReason, string> = {
  stagnation: 'stagnated',
  max_evaluations: 'ran out',
  max_generations: 'generation cap',
  target_fitness_reached: 'target',
  time_limit: 'time limit',
  error: 'failed',
  aborted: 'cancelled',
};

function stopsShort(data: OverviewData): string {
  const counts = stopCounts(data);
  if (!counts.length) return '—';
  if (counts.length === 1 && counts[0]![1] === data.islandCount) return `All ${SHORT_REASONS[counts[0]![0]]}`;
  return counts.map(([reason, count]) => `${count} ${SHORT_REASONS[reason]}`).join(' · ');
}

function facts(data: OverviewData): [string, ReactNode, string?][] {
  const { run, result, histories } = data;
  const generations = histories.map((history) => (history.generation.at(-1) ?? 0) + 1);
  const [fewest, most] = [Math.min(...generations), Math.max(...generations)];
  const evaluations = result.clustering.counts.evaluations;
  const budget = run.run_settings.evaluation_budget;
  const took = run.started_at && run.finished_at ? Date.parse(run.finished_at) - Date.parse(run.started_at) : null;
  return [
    [
      'Evaluations',
      <>
        {compactNumber.format(evaluations)}
        <small>
          of {compactNumber.format(budget)} · {percent(evaluations / budget)}
        </small>
      </>,
    ],
    ['Generations', histories.length ? (fewest === most ? most : `${fewest}–${most}`) : '—'],
    ['Search clusters', numberFormat.format(result.graph.nodes.id.length)],
    ['Took', took === null ? '—' : duration(took)],
    // Near 1, each island kept to its own ground; near the island count, they all searched the same places.
    ['Islands per cluster', result.graph.overlap.toFixed(1), 'How many islands visited each search cluster, on average'],
    ['Stopped', stopsShort(data), stopsText(data) ?? undefined],
  ];
}

// The outcome: findings led by small glyphs, the run's stats, and the run drawn as an archipelago beside them.
export default function Hero({ data }: { data: OverviewData }) {
  const notes = useMemo(() => runNotes(data), [data]);
  const found = foundText(data);
  const progress = progressText(data);
  return (
    <section className="card hero hero-story">
      <div className="hero-story-text">
        <BestNumber data={data} />
        <ul className="hero-findings">
          {found && (
            <li>
              <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                <path className="hero-glyph-best" d="M7,1.8L12.2,7L7,12.2L1.8,7Z" />
              </svg>
              <span>{found}</span>
            </li>
          )}
          {progress && (
            <li>
              <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                <path className="hero-glyph-progress" d="M1.5,12.5H4.5V6H8V3.5H12.5" />
              </svg>
              <span>{progress}</span>
            </li>
          )}
          {notes.map((note) => (
            <li key={note}>
              <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                <path className="hero-glyph-note" d="M7,1Q7.6,6.4 13,7Q7.6,7.6 7,13Q6.4,7.6 1,7Q6.4,6.4 7,1Z" />
              </svg>
              <span>{note}</span>
            </li>
          ))}
        </ul>
        <dl className="hero-stats">
          {facts(data).map(([label, value, hint]) => (
            <div key={label} title={hint}>
              <dt>{label}</dt>
              <dd>
                {typeof value === 'string'
                  ? value.split(' · ').map((part, i) => (
                      <Fragment key={i}>
                        {i > 0 && ' · '}
                        <span>{part}</span>
                      </Fragment>
                    ))
                  : value}
              </dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="hero-story-map">
        <IslandMap data={data} />
      </div>
    </section>
  );
}
