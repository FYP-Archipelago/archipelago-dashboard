import { useEffect, useMemo, useState, type ReactNode } from 'react';

import { compactNumber, duration, fitness, numberFormat } from '@/format.ts';
import { shareAfter } from '@/pages/run-workspace/convergence/convergence.ts';
import { budgetPerIsland, reasonPhrase } from '@/pages/run-workspace/stops.ts';
import { reducedMotion } from '@/style.ts';
import type { TerminationReason } from '@/types.ts';

import IslandMap from './IslandMap.tsx';
import { capitalise, changeText, crossing, listed, percent, plural, runNotes, type OverviewData } from './overview.ts';

import './hero.css';

// Counts from the starting best to the final one, in orders of magnitude on a log scale.
function useCountUp({ improvement, best }: OverviewData) {
  const final = best?.finalBest ?? null;
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
      <strong>{fitness(shown)}</strong>
      {improvement && best && (
        <span className="hero-change">
          {capitalise(changeText(improvement.start, improvement.final))} than the best at the start: {fitness(improvement.start)}
        </span>
      )}
    </div>
  );
}

const at = (data: OverviewData, x: number) => (data.axis === 'evaluations' ? `${compactNumber.format(x)} evaluations` : `generation ${x}`);

// Who found the run's best and when, then who else got there or came closest.
function foundText(data: OverviewData): ReactNode {
  const { best, summaries, bestX, run, result } = data;
  if (!best) return null;
  const maximising = result.run.maximising;
  const ties = summaries.filter((s) => s.finalBest === best.finalBest).length;
  const others = summaries.filter((s) => s.finalBest !== null && s.island !== best.island);
  const runnerUp = others.reduce<(typeof others)[number] | null>(
    (top, s) => (!top || (maximising ? s.finalBest! > top.finalBest! : s.finalBest! < top.finalBest!) ? s : top),
    null
  );
  const parts: ReactNode[] = [<b key="island">Island {best.island}</b>];
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
  if (ties > 1) parts.push(ties === summaries.length ? `all ${ties} islands tied` : `${plural(ties - 1, 'other island')} tied`);
  else if (runnerUp) parts.push(`next best Island ${runnerUp.island} at ${fitness(runnerUp.finalBest)}`);
  return parts.map((part, i) => (
    <span key={i}>
      {i > 0 && ' · '}
      {part}
    </span>
  ));
}

// When half the improvement was in, and how long the last 1% took.
function progressText(data: OverviewData): ReactNode {
  const { improvement, curve, histories, axis } = data;
  if (!improvement) return null;
  if (improvement.start === improvement.final) return 'No improvement on the best at the start';
  const half = crossing(curve, 0.5);
  const last = crossing(curve, 0.99);
  if (half === null) return null;
  const unit = axis === 'evaluations' ? 'evaluations' : 'generations';
  return (
    <>
      Half the gain in the first <b>{percent(1 - shareAfter(histories, axis, half))}</b> of {unit}
      {last !== null && (
        <>
          {' · '}last 1% took <b>{percent(shareAfter(histories, axis, last))}</b>
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

// The outcome as a short story, with the run drawn as an archipelago beside it.
export default function Hero({ data }: { data: OverviewData }) {
  const notes = useMemo(() => runNotes(data), [data]);
  return (
    <section className="card hero hero-story">
      <div className="hero-story-text">
        <BestNumber data={data} />
        <dl className="hero-findings">
          {(
            [
              ['Run best', foundText(data)],
              ['Progress', progressText(data)],
              [
                'Findings',
                notes.length
                  ? notes.map((note) => (
                      <span key={note} className="hero-note">
                        {note}
                      </span>
                    ))
                  : null,
              ],
            ] as const
          ).map(
            ([label, text]) =>
              text && (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{text}</dd>
                </div>
              )
          )}
        </dl>
        <dl className="hero-facts">
          {facts(data).map(([label, value, hint]) => (
            <div key={label} title={hint}>
              <dt>{label}</dt>
              <dd>{value}</dd>
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
