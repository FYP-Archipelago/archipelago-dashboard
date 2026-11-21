import { useMemo, useState } from 'react';

import { islandColor } from '@/colors.ts';
import Icon from '@/components/Icon.tsx';
import { compactNumber, fitness, numberFormat } from '@/format.ts';
import LineChart, { Sparkline } from '@/pages/run-workspace/charts/LineChart.tsx';
import { EmptyState, NoResult, type ResultQuery } from '@/pages/run-workspace/shared.tsx';
import type { Run, RunResult } from '@/types.ts';

import { describeDiversity, historyByIsland, runBest, runProgress, shareAfter, summarise } from './convergence.ts';

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
  { label: '99%', remainingShare: 0.01 },
  { label: '99.9%', remainingShare: 0.001 },
];
// A threshold counts as convergence only if the improvement left after it came at most this fast compared with the
// run's average pace: at 0.1, the last 1% must have taken at least 10% of the run, and the last 0.1% at least 1%.
// Faster than that, the run was still improving when it ended.
const PLATEAU_PACE = 0.1;

const percentAfter = (share: number) => (share > 0 && share < 0.01 ? '<1%' : `${Math.round(share * 100)}%`);

const formatDiversity = (value: number | null) => (value === null ? '—' : value.toFixed(3));

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { key: T; label: string; disabled?: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.key}
          className={value === option.key ? 'on' : ''}
          aria-pressed={value === option.key}
          disabled={Boolean(option.disabled)}
          title={option.disabled}
          onClick={() => onChange(option.key)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function Convergence({ result }: { result: RunResult }) {
  const maximising = result.run.maximising;
  const histories = useMemo(() => historyByIsland(result.generation_history), [result]);
  const summaries = useMemo(() => histories.map((history) => summarise(history, maximising)), [histories, maximising]);
  const best = runBest(summaries, maximising);
  const diversityName = describeDiversity(result.generation_history);

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

  // The improvement is measured on the scale the best-so-far chart would use, whichever metric is showing.
  const progressLog = logChoice && histories.every((history) => history.bestSoFar.every((value) => value === null || value > 0));
  const progress = useMemo(() => {
    const points = CONVERGENCE_THRESHOLDS.flatMap(({ label, remainingShare }) => {
      const point = runProgress(histories, axis, maximising, remainingShare, progressLog);
      return point ? [{ ...point, label, remainingShare, after: shareAfter(histories, axis, point.x) }] : [];
    });
    // When both thresholds land on the same point, the stricter one says it all.
    return points.filter((point, i) => points[i + 1]?.x !== point.x);
  }, [histories, axis, maximising, progressLog]);
  const converged = progress.filter((point) => point.remainingShare <= PLATEAU_PACE * point.after);
  const stillImproving = progress.filter((point) => point.remainingShare > PLATEAU_PACE * point.after);
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
        })),
    [histories, hidden, axis, metric]
  );

  const toggle = (island: number) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(island)) next.delete(island);
      else if (next.size < histories.length - 1) next.add(island);
      return next;
    });

  if (!histories.length) return <EmptyState icon="alert" title="No generation statistics" />;

  const marker =
    metric === 'bestSoFar' && best && !hidden.has(best.island) && best.finalBest !== null
      ? { x: (axis === 'generation' ? best.reachedGeneration : best.reachedEvaluations) ?? 0, y: best.finalBest }
      : null;
  const tiedForBest = best ? summaries.filter((s) => s.finalBest === best.finalBest).length : 0;
  const metricLabel = METRICS.find((m) => m.key === metric)!.label;

  return (
    <>
      <div className="convergence-controls">
        <Segmented label="Metric" value={metric} options={METRICS} onChange={setMetric} />
        <div className="island-toggles" role="group" aria-label="Islands">
          {histories.map(({ island }) => (
            <button
              key={island}
              className={`island-toggle${hidden.has(island) ? ' off' : ''}`}
              aria-pressed={!hidden.has(island)}
              onClick={() => toggle(island)}
              onPointerEnter={() => !hidden.has(island) && setHighlight(island)}
              onPointerLeave={() => setHighlight(null)}
            >
              <i className="swatch" style={{ background: islandColor(island) }} />
              Island {island}
            </button>
          ))}
        </div>
      </div>

      <div className="card chart-card">
        <div className="card-head">
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
                progressLog
                  ? 'Improvement counted in orders of magnitude, as the log scale shows it'
                  : 'Improvement counted on the linear scale, from the best starting value to the run best'
              }
            >
              <span className="chart-key-ring" aria-hidden="true" />
              Estimated convergence: where the run had made {converged.map((point) => point.label).join(' and ')} of its improvement
            </span>
          )}
          {stillImproving.length > 0 && (
            <span className="chart-key">
              <Icon name="trend" size={12} />
              {converged.length ? `Not converged to ${stillImproving.at(-1)!.label}` : 'No estimated convergence'}: the run was still improving at the
              end
            </span>
          )}
        </div>
      </div>

      <div className="card table-card islands-table">
        <table className="table">
          <thead>
            <tr>
              <th>Island</th>
              <th className="r">Final best</th>
              <th className="r">Last improved</th>
              <th className="r">Without improvement</th>
              <th className="r">Final mean</th>
              <th className="r">Final diversity</th>
              <th className="col-trend">Diversity over time</th>
            </tr>
          </thead>
          <tbody>
            {summaries.map((s) => (
              <tr
                key={s.island}
                className={highlight === s.island ? 'highlighted' : undefined}
                onPointerEnter={() => !hidden.has(s.island) && setHighlight(s.island)}
                onPointerLeave={() => setHighlight(null)}
              >
                <td>
                  <span className="island-cell">
                    <i className="swatch" style={{ background: islandColor(s.island) }} />
                    Island {s.island}
                    {best?.island === s.island && (
                      <span
                        className="best-badge"
                        title={tiedForBest > 1 ? `${tiedForBest} islands ended on the run's best value; this one reached it first.` : undefined}
                      >
                        Run best
                      </span>
                    )}
                  </span>
                </td>
                <td className="r">{fitness(s.finalBest)}</td>
                <td className="r">
                  {s.reachedGeneration === null ? (
                    '—'
                  ) : (
                    <>
                      gen {s.reachedGeneration}
                      {s.reachedEvaluations !== null && <span className="muted"> · {compactNumber.format(s.reachedEvaluations)} evals</span>}
                    </>
                  )}
                </td>
                <td className="r">
                  {s.stagnantGenerations === null ? (
                    '—'
                  ) : (
                    <>
                      {s.stagnantGenerations} gens
                      {s.stagnantShare !== null && <span className="muted"> ({Math.round(s.stagnantShare * 100)}%)</span>}
                    </>
                  )}
                </td>
                <td className="r">{fitness(s.finalMean)}</td>
                <td className="r">{formatDiversity(s.finalDiversity)}</td>
                <td className="col-trend">
                  <Sparkline
                    values={histories.find((h) => h.island === s.island)!.diversity}
                    color={islandColor(s.island)}
                    label={`Island ${s.island} diversity over time`}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export default function ConvergenceTab({ run, result }: { run: Run; result: ResultQuery }) {
  if (!result.data) return <NoResult run={run} result={result} />;
  return <Convergence result={result.data} />;
}
