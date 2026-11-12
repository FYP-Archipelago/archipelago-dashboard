import test from 'node:test';
import assert from 'node:assert/strict';
import { readAttribution } from './attribution.js';

const runId = 'run-20261102T120000Z-aabbccdd';

function result() {
  const islands = {
    empty_value: 2,
    full_value: 10,
    sampled_orders: null,
    players: [
      { player: 1, value: 6, standard_error: null },
      { player: 0, value: 2, standard_error: null },
    ],
    coalitions: [
      { players: [], value: 2 },
      { players: [0], value: 2 },
      { players: [1], value: 4 },
      { players: [0, 1], value: 10 },
    ],
    orders: [
      [
        { player: 0, before: 2, after: 2 },
        { player: 1, before: 2, after: 10 },
      ],
    ],
  };
  const routes = {
    empty_value: 0,
    full_value: 4,
    sampled_orders: 1024,
    players: [{ player: [0, 1], value: 4, standard_error: 0.5 }],
    coalitions: [],
    orders: [[{ player: [0, 1], before: 0, after: 4 }]],
  };
  return {
    run: { run_id: runId, algorithm: 'de', benchmark: 'sphere', migration_topology: 'ring', islands: [0, 1], maximising: true },
    explainability: {
      shapley: {
        status: 'ready',
        baseline_fitness: 1,
        observed_best_fitness: 11,
        supported_best_fitness: 11,
        coverage: { evaluations: 8, supported: 6 },
        warnings: [],
        islands,
        routes,
      },
    },
  };
}

test('derives labels, shares, bar widths, coalition percentages and marginal contributions', () => {
  const { status, data } = readAttribution(result(), runId);
  assert.equal(status, 'ready');
  assert.deepEqual(data.coverage, { total: 8, supported: 6, excluded: 2, percent: 75 });

  const islands = data.games.islands;
  assert.equal(islands.allocated_gain, 8);
  assert.deepEqual(
    islands.players.map((p) => [p.id, p.label, p.share_percent, p.bar_percent]),
    [
      ['1', 'Island 1', 75, 100],
      ['0', 'Island 0', 25, 100 / 3],
    ]
  );
  assert.deepEqual(
    islands.coalitions.map((c) => c.value_percent),
    [20, 20, 40, 100]
  );
  assert.deepEqual(
    islands.orders[0].steps.map((s) => s.marginal),
    [0, 8]
  );

  const routes = data.games.routes;
  assert.equal(routes.sampled, true);
  assert.deepEqual(
    routes.players.map((p) => [p.id, p.label]),
    [['0-1', '0 → 1']]
  );
});

test('older results and module-unavailable attribution are reported as unavailable', () => {
  const older = result();
  delete older.explainability;
  assert.match(readAttribution(older, runId).detail, /computed before/);

  const off = result();
  off.explainability.shapley = { status: 'unavailable', detail: 'No founders.' };
  assert.deepEqual(readAttribution(off, runId), { status: 'unavailable', detail: 'No founders.' });
});

test('wrong runs and malformed attribution are errors', () => {
  const mutations = [
    (r) => {
      r.run.run_id = 'run-20261102T120001Z-11223344';
    },
    (r) => {
      r.explainability.shapley.coverage = { evaluations: 1, supported: 2 };
    },
    (r) => {
      r.explainability.shapley.routes.players[0].player = 0;
    },
    (r) => {
      r.explainability.shapley.islands.coalitions.push({ players: [7], value: 1 });
    },
    (r) => {
      r.explainability.shapley.islands.players.push({ player: 1, value: 0, standard_error: null });
    },
  ];
  for (const mutate of mutations) {
    const value = result();
    mutate(value);
    assert.throws(() => readAttribution(value, runId), /malformed|another run/);
  }
});
