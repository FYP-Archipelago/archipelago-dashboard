import { fitness } from '@/format.ts';
import { pointAt } from '@/pages/run-workspace/convergence/convergence.ts';
import { historyByIsland, type IslandHistory } from '@/pages/run-workspace/history.ts';
import type { ConvergencePoint, IslandBest, Run, RunResult, ShapleyAttribution, ShapleyGame } from '@/types.ts';

export type Axis = 'evaluations' | 'generation';

// From the best starting value to the run's best, as the worker measured it. On a log scale it counts orders of magnitude.
export type Improvement = { start: number; final: number; log: boolean };

// How much of the improvement a value stands for: 0 at the start, 1 at the run's best.
function doneShare(improvement: Improvement, value: number): number {
  const scale = (v: number) => (improvement.log ? Math.log10(v) : v);
  const gain = scale(improvement.final) - scale(improvement.start);
  return gain === 0 ? 1 : (scale(value) - scale(improvement.start)) / gain;
}

const pointsOf = (history: IslandHistory, axis: Axis) =>
  history[axis].flatMap((x, i) => {
    const value = history.bestSoFar[i];
    return x === null || value == null ? [] : [{ x, value }];
  });

// The run's share of its improvement at each x. Islands run side by side, so it is the best any island had by its own x.
export function progressCurve(histories: IslandHistory[], axis: Axis, improvement: Improvement): { x: number; share: number }[] {
  const points = histories.flatMap((history) => pointsOf(history, axis)).sort((a, b) => a.x - b.x);
  const curve: { x: number; share: number }[] = [];
  let share = doneShare(improvement, improvement.start);
  for (const point of points) {
    share = Math.max(share, doneShare(improvement, point.value));
    if (curve.at(-1)?.x === point.x) curve.at(-1)!.share = share;
    else curve.push({ x: point.x, share });
  }
  return curve;
}

// One island's span, each step that improved its best (sized against the whole run's improvement), and its last step.
export type Lane = { island: number; start: number; end: number; steps: { x: number; size: number }[]; lastImproved: number | null };

export function laneOf(history: IslandHistory, axis: Axis, improvement: Improvement): Lane | null {
  const points = pointsOf(history, axis);
  if (!points.length) return null;
  const steps: Lane['steps'] = [];
  for (let i = 1; i < points.length; i++) {
    const size = doneShare(improvement, points[i]!.value) - doneShare(improvement, points[i - 1]!.value);
    if (size > 0) steps.push({ x: points[i]!.x, size });
  }
  return { island: history.island, start: points[0]!.x, end: points.at(-1)!.x, steps, lastImproved: steps.at(-1)?.x ?? null };
}

// The islands' mean diversity at each generation, over the islands that logged one.
export function meanDiversity(histories: IslandHistory[]): { generation: number; value: number }[] {
  const sums = new Map<number, { total: number; count: number }>();
  for (const history of histories)
    history.generation.forEach((generation, i) => {
      const value = history.diversity[i];
      if (value == null) return;
      const sum = sums.get(generation) ?? { total: 0, count: 0 };
      sum.total += value;
      sum.count += 1;
      sums.set(generation, sum);
    });
  return [...sums].sort((a, b) => a[0] - b[0]).map(([generation, sum]) => ({ generation, value: sum.total / sum.count }));
}

export type Share = { island: number; share: number };

// Each island's Shapley share of the improvement, largest first.
export function sharesOf(game: ShapleyGame): Share[] {
  const shared = game.full_value - game.empty_value;
  return game.players
    .filter((player): player is typeof player & { player: number } => typeof player.player === 'number')
    .map((player) => ({ island: player.player, share: shared ? player.value / shared : 0 }))
    .sort((a, b) => b.share - a.share);
}

// How far the best moved, e.g. "85% lower", or "365× lower" for errors that shrink by orders of magnitude.
export function changeText(start: number, final: number): string {
  if (start === final) return 'no change';
  const direction = final < start ? 'lower' : 'higher';
  if (start === 0 || Math.sign(start) !== Math.sign(final)) return `${fitness(Math.abs(final - start))} ${direction}`;
  const ratio = final / start;
  if (start > 0 && ratio <= 0.1) return `${Math.round(1 / ratio).toLocaleString('en')}× lower`;
  if (start > 0 && ratio >= 10) return `${Math.round(ratio).toLocaleString('en')}× higher`;
  const change = Math.abs(final - start) / Math.abs(start);
  return `${change < 0.1 ? (change * 100).toFixed(1) : Math.round(change * 100)}% ${direction}`;
}

export const percent = (share: number) => (share > 0 && share < 0.01 ? '<1%' : `${Math.round(share * 100)}%`);
export const plural = (count: number, noun: string) => `${count.toLocaleString('en')} ${noun}${count === 1 ? '' : 's'}`;
export const listed = (items: string[]) => (items.length < 2 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`);
export const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

// Everything the overview's cards read, worked out once per result.
export type OverviewData = {
  run: Run;
  result: RunResult;
  histories: IslandHistory[];
  islandCount: number;
  bests: IslandBest[];
  best: IslandBest | null;
  // Where the run's best was first reached, along `axis`.
  bestX: number | null;
  improvement: Improvement | null;
  axis: Axis;
  curve: { x: number; share: number }[];
  shapley: ShapleyAttribution | null;
};

export function overviewData(run: Run, result: RunResult): OverviewData {
  const histories = historyByIsland(result.generation_history);
  const best = result.island_bests.find((island) => island.island_id === result.run_best_island) ?? null;
  const convergence = result.convergence;
  const improvement = convergence && { start: convergence.start_fitness, final: convergence.final_fitness, log: convergence.scale === 'log' };
  const axis: Axis = histories.every((history) => history.evaluations.every((value) => value !== null)) ? 'evaluations' : 'generation';
  return {
    run,
    result,
    histories,
    islandCount: histories.length || result.run.islands.length,
    bests: result.island_bests,
    best,
    bestX: best ? (axis === 'evaluations' ? best.evaluations : best.generation) : null,
    improvement,
    axis,
    curve: improvement ? progressCurve(histories, axis, improvement) : [],
    shapley: result.explainability.shapley.status === 'ready' ? result.explainability.shapley : null,
  };
}

// The worker's crossing point for a share of the improvement, along the overview's axis.
export const levelPoint = (data: OverviewData, share: number): ConvergencePoint | null => pointAt(data.result.convergence, share, data.axis);

export function runNotes(data: OverviewData, limit = 2): string[] {
  const { curve, histories, islandCount, axis, shapley, bests, run, result } = data;
  const notes: { weight: number; text: string }[] = [];

  // Still improving: the last gain came in the run's last tenth.
  if (curve.length > 1) {
    const [start, end] = [curve[0]!.x, curve.at(-1)!.x];
    let lastGain: { x: number; share: number } | undefined;
    for (let i = curve.length - 1; i > 0 && !lastGain; i--) if (curve[i]!.share > curve[i - 1]!.share + 1e-9) lastGain = curve[i];
    if (lastGain && end > start && (lastGain.x - start) / (end - start) > 0.9)
      notes.push({ weight: 90, text: 'The run was still improving when it stopped.' });
  }

  // Diversity gone early: mean diversity fell to a quarter of its start within the first fifth of the run.
  const within = meanDiversity(histories);
  if (within.length > 4 && within[0]!.value > 0) {
    const lastGeneration = within.at(-1)!.generation || 1;
    const collapse = within.find((point) => point.value <= within[0]!.value * 0.25);
    if (collapse && collapse.generation <= lastGeneration * 0.2)
      notes.push({
        weight: 80,
        text: `Diversity dropped ${percent(1 - collapse.value / within[0]!.value)} early on, by generation ${collapse.generation}.`,
      });
  }

  // From the routes' Shapley game: the share of the improvement that needed migrants.
  const routes = shapley?.routes;
  if (run.run_settings['migration.enabled'] && routes && routes.full_value) {
    const needed = (routes.full_value - routes.empty_value) / routes.full_value;
    if (needed < 0.01) notes.push({ weight: 70, text: 'Migration made almost no difference to the result.' });
    else if (needed >= 0.5) notes.push({ weight: 60, text: `${percent(needed)} of the gain depended on migrants moving between islands.` });
  }

  // Every island ended on the same best value, and clusters were shared by most islands on average.
  const finals = bests.map((island) => island.fitness);
  if (islandCount > 1 && finals.length === islandCount && finals.every((value) => value === finals[0]) && result.graph.overlap >= 0.6 * islandCount)
    notes.push({ weight: 50, text: `All ${islandCount} islands reached the same best fitness.` });

  if (shapley) {
    const shares = sharesOf(shapley.islands);
    const idle = shares.filter((s) => s.share < 0.01).map((s) => `Island ${s.island}`);
    if (idle.length && idle.length < shares.length) notes.push({ weight: 45, text: `${listed(idle)} added almost nothing to the improvement.` });
    if (shares[0] && shares[0].share >= 0.5)
      notes.push({ weight: 40, text: `Island ${shares[0].island} earned ${percent(shares[0].share)} of the credit for the improvement.` });
  }

  // A long tail: a large share of the search came after the run had made 99% of its improvement.
  const last = levelPoint(data, 0.99);
  if (last !== null && curve.length > 1) {
    const after = last.after;
    const unit = axis === 'evaluations' ? 'evaluations' : 'generations';
    if (after >= 0.3) notes.push({ weight: 35, text: `${percent(after)} of the ${unit} came after the run had made 99% of its gain.` });
  }

  return notes
    .sort((a, b) => b.weight - a.weight)
    .slice(0, limit)
    .map((note) => note.text);
}
