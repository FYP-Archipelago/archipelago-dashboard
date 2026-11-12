import { test, expect } from 'vitest';
import { convergenceHistory } from './convergence-history.js';

test('chart mapping preserves module values and gaps without filling missing generations', () => {
  const rows = [
    { island_id: 2, generation: 4, best_fitness: 0, mean_fitness: 3 },
    { island_id: 2, generation: 0, best_fitness: 4, mean_fitness: 5 },
    { island_id: 2, generation: 2, best_fitness: null, mean_fitness: 4 },
  ];
  const original = structuredClone(rows);
  const data = convergenceHistory({ generation_history: rows });
  expect(rows).toStrictEqual(original);
  expect(data.islands[0].series.map((row) => [row.generation, row.best_fitness])).toStrictEqual([
    [0, 4],
    [2, null],
    [4, 0],
  ]);
  expect(data.charts.best_fitness.lines[0].points[1]).toBe(null);
  expect(data.charts.best_fitness.lines[0].points[2]).toBeTruthy();
  expect(data.charts.best_so_far_fitness).toBe(undefined);
});
test('single-point charts have finite positions and incompatible diversity units are not compared', () => {
  const data = convergenceHistory({
    generation_history: [
      { island_id: 0, generation: 0, best_fitness: 0, diversity: 0.3, diversity_metric: 'hamming' },
      { island_id: 1, generation: 0, best_fitness: 0, diversity: 0.2, diversity_metric: 'euclidean' },
    ],
  });
  expect(data.charts.diversity).toBe(undefined);
  expect(data.chart.lines.every((line) => line.points.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y)))).toBeTruthy();
});
test('absent history is empty', () => {
  expect(convergenceHistory({})).toBe(null);
  expect(convergenceHistory({ generation_history: [] })).toBe(null);
});
test('axis labels retain distinctions for closely spaced small fitness values', () => {
  const data = convergenceHistory({
    generation_history: [
      { island_id: 0, generation: 0, best_fitness: 0.0000010000001 },
      { island_id: 0, generation: 1, best_fitness: 0.0000010000004 },
    ],
  });
  expect(new Set(data.chart.y_ticks.map((tick) => Number(tick.label))).size).toBe(5);
  expect(data.islands[0].series[0].best_fitness).toBe(0.0000010000001);
});
