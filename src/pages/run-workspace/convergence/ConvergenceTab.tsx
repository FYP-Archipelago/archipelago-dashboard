import { useMemo, useState } from 'react';

import { islandColor } from '@/colors.ts';
import Icon from '@/components/Icon.tsx';
import Segmented from '@/components/Segmented.tsx';
import { compactNumber, fitness, numberFormat } from '@/format.ts';
import LineChart, { Sparkline } from '@/pages/run-workspace/charts/LineChart.tsx';
import { historyByIsland } from '@/pages/run-workspace/history.ts';
import { EmptyState, IslandSwatch, NoResult, type ResultQuery } from '@/pages/run-workspace/shared.tsx';
import type { IslandEnd, Run, RunResult } from '@/types.ts';

import { convergenceVerdict, describeDiversity, pointAt } from './convergence.ts';

import './convergence.css';

type Metric = 'bestSoFar' | 'best' | 'mean' | 'diversity';
type Axis = 'evaluations' | 'generation';

const METRICS: { key: Metric; label: string }[] = [
  { key: 'bestSoFar', label: 'Best so far' },
  { key: 'best', label: 'Generation best' },
  { key: 'mean', label: 'Mean fitness' },
  { key: 'diversity', label: 'Diversity' },
];
const CONVERGENCE_THRESHOLDS = [
  { label: '99%', share: 0.99, remainingShare: 0.01 },
  { label: '99.9%', share: 0.999, remainingShare: 0.001 },
];

const lastOf = (values: (number | null)[]) => values.filter((value) => value !== null).at(-1) ?? null;

const afterFormat = new Intl.NumberFormat('en', { style: 'percent', maximumFractionDigits: 2 });
const percentAfter = (share: number) => (share > 0 && share < 0.0001 ? '<0.01%' : afterFormat.format(share));

const formatDiversity = (value: number | null) => (value === null ? '—' : value.toFixed(3));

// Generations the island went without improving before it stopped: from runner
function WithoutImprovement({ end, limit }: { end: IslandEnd | undefined; limit: number }) {
  const since = end?.generations_since_improvement ?? null;
  const stagnated = end?.termination_reason === 'stagnation';
  return (
    <>
      {since === null || !end ? (
        '—'
      ) : (
        <>
          {since} gens
          {end.generations_completed > 0 && <span className="muted"> ({Math.round((since / end.generations_completed) * 100)}%)</span>}
        </>
      )}
      {stagnated && (
        <span className="stagnation-flag" title={limit > 0 ? `Stagnation limit: ${numberFormat.format(limit)} generations` : undefined}>
          Stagnated
        </span>
      )}
    </>
  );
}

type StagnationControl = {
  showStagnationMarkers: boolean;
  onToggleStagnationMarkers: () => void;
};

function Convergence({ result, showStagnationMarkers, onToggleStagnationMarkers }: { result: RunResult } & StagnationControl) {
  const maximising = result.run.maximising;
  const histories = useMemo(() => historyByIsland(result.generation_history), [result]);
  const bests = useMemo(() => new Map(result.island_bests.map((best) => [best.island_id, best])), [result]);
  const best = result.run_best_island === null ? null : (bests.get(result.run_best_island) ?? null);
  const diversityName = describeDiversity(result.generation_history);
  const stagnationLimit = result.run.stagnation_generations ?? 0;
  const stagnatedIslands = useMemo(
    () => new Set(result.island_ends.filter((end) => end.termination_reason === 'stagnation').map((end) => end.island_id)),
    [result.island_ends]
  );

  const [metric, setMetric] = useState<Metric>('bestSoFar');
  const [axisChoice, setAxis] = useState<Axis>('evaluations');
  // Log suits minimising runs, whose best values often close in on zero over several orders of magnitude.
  const [logChoice, setLog] = useState(!maximising);
  const [hidden, setHidden] = useState<ReadonlySet<number>>(new Set());
  const [highlight, setHighlight] = useState<number | null>(null);
  const hasEvaluations = histories.every((history) => history.evaluations.every((value) => value !== null));
  const axis = hasEvaluations ? axisChoice : 'generation';
  const canLog = histories.every((history) => history[metric].every((value) => value === null || value > 0));
  const log = logChoice && canLog;
  const isFitness = metric !== 'diversity';

  // The worker measures the improvement on one fixed scale, so the verdict does not follow the scale picker.
  const progress = useMemo(() => {
    const points = CONVERGENCE_THRESHOLDS.flatMap(({ label, share, remainingShare }) => {
      const point = pointAt(result.convergence, share, axis);
      return point ? [{ x: point.x, island: point.island_id, value: point.fitness, after: point.after, label, remainingShare }] : [];
    });
    // When both thresholds land on the same point, it is shown once with both labels and judged by the stricter one.
    return points.flatMap((point, i) => {
      if (points[i + 1]?.x === point.x) return [];
      const labels = points.filter((other) => other.x === point.x).map((other) => other.label);
      return [{ ...point, label: labels.join(' · '), words: labels.join(' and ') }];
    });
  }, [result.convergence, axis]);
  const { converged, spedUpAfter, stillImproving } = convergenceVerdict(progress);
  const unit = axis === 'generation' ? 'generations' : 'evaluations';

  const series = useMemo(
    () =>
      histories
        .filter((history) => !hidden.has(history.island))
        .map((history) => ({
          key: history.island,
          label: `Island ${history.island}`,
          color: islandColor(history.island),
          xs: axis === 'generation' ? history.generation : (history.evaluations as number[]),
          ys: history[metric],
          endCross: stagnatedIslands.has(history.island) && history[metric].some((value) => value !== null),
        })),
    [histories, hidden, axis, metric, stagnatedIslands]
  );

  const toggle = (island: number) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(island)) next.delete(island);
      else if (next.size < histories.length - 1) next.add(island);
      return next;
    });

  if (!histories.length) return <EmptyState icon="alert" title="No generation statistics" />;

  const bestX = best && (axis === 'generation' ? best.generation : best.evaluations);
  const marker = metric === 'bestSoFar' && best && bestX != null && !hidden.has(best.island_id) ? { x: bestX, y: best.fitness } : null;
  const tiedForBest = best ? result.island_bests.filter((other) => other.fitness === best.fitness).length : 0;
  const metricLabel = METRICS.find((m) => m.key === metric)!.label;

  return (
    <>
      <div className="convergence-controls">
        <Segmented label="Metric" value={metric} options={METRICS} onChange={setMetric} />
        <div className="island-toggles" role="group" aria-label="Islands">
          {histories.map(({ island }) => (
            <button
              key={island}
              className={`island-toggle${hidden.has(island) ? ' island-toggle-off' : ''}`}
              aria-pressed={!hidden.has(island)}
              onClick={() => toggle(island)}
              onPointerEnter={() => !hidden.has(island) && setHighlight(island)}
              onPointerLeave={() => setHighlight(null)}
            >
              <IslandSwatch island={island} />
              Island {island}
            </button>
          ))}
        </div>
      </div>

      <div className="card chart-card">
        <div className="card-header">
          <div className="card-heading">
            <h3>{metricLabel}</h3>
            <span className="muted">
              {isFitness
                ? maximising
                  ? 'Higher is better'
                  : 'Lower is better'
                : `${diversityName ?? 'As the runner measures it'} · higher means a more varied population`}
            </span>
          </div>
          <div className="chart-pickers">
            <Segmented
              label="Scale"
              value={log ? 'log' : 'linear'}
              options={[
                { key: 'linear', label: 'Linear' },
                {
                  key: 'log',
                  label: 'Log',
                  disabled: canLog ? undefined : `${metricLabel} has values at or below zero, which a log scale cannot show.`,
                },
              ]}
              onChange={(value) => setLog(value === 'log')}
            />
            <Segmented
              label="X axis"
              value={axis}
              options={[
                { key: 'evaluations', label: 'Evaluations', disabled: hasEvaluations ? undefined : 'This run did not log evaluation counts.' },
                { key: 'generation', label: 'Generations' },
              ]}
              onChange={setAxis}
            />
            {stagnatedIslands.size > 0 && (
              <button
                className="stagnation-switch"
                type="button"
                role="switch"
                aria-checked={showStagnationMarkers}
                onClick={onToggleStagnationMarkers}
              >
                Stagnation markers
                <span className="stagnation-switch-track" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
        <LineChart
          label={`${metricLabel} per island by ${axis}`}
          series={series}
          height={360}
          log={log}
          xTitle={axis === 'generation' ? 'Generation' : 'Evaluations (per island)'}
          hoverTitle={(x) => (axis === 'generation' ? `Generation ${x}` : `${numberFormat.format(x)} evaluations`)}
          formatY={isFitness ? fitness : formatDiversity}
          better={isFitness && !maximising ? 'lower' : 'higher'}
          highlight={highlight}
          marker={marker}
          showEndCrosses={showStagnationMarkers}
          shades={converged.map((point) => ({
            x: point.x,
            label: point.label,
            note: `Last ${point.remainingShare * 100}% of improvement took ${percentAfter(point.after)} of ${unit}`,
          }))}
          rings={metric === 'bestSoFar' ? converged.filter((point) => !hidden.has(point.island)).map(({ x, value }) => ({ x, y: value })) : undefined}
          replayKey={`${metric}-${axis}-${log}`}
        />
        <div className="chart-keys">
          {marker && (
            <span className="chart-key">
              <span className="chart-key-marker" aria-hidden="true" />
              Where the run&apos;s best was first reached
            </span>
          )}
          {converged.length > 0 && (
            <span
              className="chart-key"
              title={
                result.convergence?.scale === 'log'
                  ? 'Improvement counted in orders of magnitude, from the best starting value to the run best'
                  : 'Improvement counted in fitness, from the best starting value to the run best'
              }
            >
              <span className="chart-key-ring" aria-hidden="true" />
              <span>
                Estimated convergence: where the run had made {converged.map((point) => point.words).join(' and ')} of its improvement
                {result.convergence?.scale === 'log' ? ', counted in orders of magnitude' : ''}
              </span>
            </span>
          )}
          {showStagnationMarkers && series.some((line) => line.endCross) && (
            <span className="chart-key chart-key-stagnation">
              <Icon name="x" size={11} stroke={2.5} />
              Island stopped at the stagnation limit
            </span>
          )}
          {spedUpAfter && (
            <span className="chart-key">
              <Icon name="trend" size={12} />
              Improvement rate rose past {spedUpAfter.words}, too much to count as convergence there
            </span>
          )}
          {stillImproving && (
            <span className="chart-key">
              <Icon name="trend" size={12} />
              {converged.length ? `Not converged to ${stillImproving.words}` : 'No estimated convergence'}: the run was still improving at the end
            </span>
          )}
        </div>
      </div>

      <div className="card table-card islands-table">
        <table className="table">
          <thead>
            <tr>
              <th>Island</th>
              <th className="align-right">Final best</th>
              <th className="align-right">Last improved</th>
              <th className="align-right">Without improvement</th>
              <th className="align-right">Final mean</th>
              <th className="align-right">Final diversity</th>
              <th className="diversity-trend-column">Diversity over time</th>
            </tr>
          </thead>
          <tbody>
            {histories.map(({ island, mean, diversity }) => {
              const own = bests.get(island);
              return (
                <tr
                  key={island}
                  className={highlight === island ? 'island-row-highlighted' : undefined}
                  onPointerEnter={() => !hidden.has(island) && setHighlight(island)}
                  onPointerLeave={() => setHighlight(null)}
                >
                  <td>
                    <span className="island-cell">
                      <IslandSwatch island={island} />
                      Island {island}
                      {best?.island_id === island && (
                        <span
                          className="best-badge"
                          title={tiedForBest > 1 ? `${tiedForBest} islands ended on the run's best value; this one reached it first.` : undefined}
                        >
                          Run best
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="align-right">{fitness(own?.fitness ?? null)}</td>
                  <td className="align-right">
                    {own ? (
                      <>
                        gen {own.generation}
                        {own.evaluations !== null && <span className="muted"> · {compactNumber.format(own.evaluations)} evals</span>}
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="align-right">
                    <WithoutImprovement end={result.island_ends.find((end) => end.island_id === island)} limit={stagnationLimit} />
                  </td>
                  <td className="align-right">{fitness(lastOf(mean))}</td>
                  <td className="align-right">{formatDiversity(lastOf(diversity))}</td>
                  <td className="diversity-trend-column">
                    <Sparkline values={diversity} color={islandColor(island)} label={`Island ${island} diversity over time`} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

export default function ConvergenceTab({ run, result, ...stagnationControl }: { run: Run; result: ResultQuery } & StagnationControl) {
  if (!result.data) return <NoResult run={run} result={result} />;
  return <Convergence result={result.data} {...stagnationControl} />;
}
