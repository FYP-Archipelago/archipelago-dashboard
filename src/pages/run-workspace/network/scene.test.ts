import { describe, expect, it } from 'vitest';

import { makeResult } from '@/test/fixtures.ts';
import type { Graph } from '@/types.ts';

import { buildScene } from './scene.ts';

const heights = (graph: Graph, maximising: boolean) => Array.from(buildScene(graph, [0, 1, 2], maximising, []).heights.fitness);

describe('fitness height', () => {
  it('ranks clusters by best fitness, better lower, whichever way fitness points', () => {
    // Best fitness 80, 90, 60, 60, 60 while the means rank the clusters differently, so a height drawn from the mean
    // would not match. The three clusters tied at the best share the lowest height.
    const minimising = makeResult().graph;
    const expected = [0, 0.9, -0.9, -0.9, -0.9];
    expect(heights(minimising, false)).toEqual(expected.map(Math.fround));

    const flip = (values: (number | null)[]) => values.map((v) => (v === null ? null : -v));
    const maximising = {
      ...minimising,
      nodes: { ...minimising.nodes, best_fitness: flip(minimising.nodes.best_fitness), mean_fitness: flip(minimising.nodes.mean_fitness) },
    };
    expect(heights(maximising, true)).toEqual(expected.map(Math.fround));
  });
});
