// A player is an island id or a [source, destination] route.
const playerKey = (player) => (Array.isArray(player) ? player.join('-') : String(player));
const playerLabel = (player) => (Array.isArray(player) ? `${player[0]} → ${player[1]}` : `Island ${player}`);

const percentOf = (value, total) => (total > 0 ? (100 * value) / total : 0);

// The module leaves simple arithmetic to the frontend: labels, shares, bar widths and marginal contributions.
function toGameView(game) {
  const allocated = game.full_value - game.empty_value;
  const largest = Math.max(0, ...game.players.map((p) => p.value));
  return {
    sampled: game.sampled_orders !== null,
    sampled_orders: game.sampled_orders,
    empty_value: game.empty_value,
    full_value: game.full_value,
    allocated_gain: allocated,
    players: game.players.map((p) => ({
      id: playerKey(p.player),
      label: playerLabel(p.player),
      value: p.value,
      standard_error: p.standard_error,
      share_percent: percentOf(p.value, allocated),
      bar_percent: percentOf(p.value, largest),
    })),
    coalitions: game.coalitions.map((c) => ({
      players: c.players.map(playerKey),
      value: c.value,
      value_percent: percentOf(c.value, game.full_value),
    })),
    orders: game.orders.map((steps, index) => ({
      id: String(index),
      steps: steps.map((step) => ({
        player_id: playerKey(step.player),
        label: playerLabel(step.player),
        before: step.before,
        after: step.after,
        marginal: step.after - step.before,
      })),
    })),
  };
}

// The Shapley attribution in a run result, as {status: 'ready', data} or {status: 'unavailable', detail}.
export function readAttribution(result, runId) {
  const run = result.run;
  const shapley = result.explainability?.shapley;
  if (shapley === undefined) {
    return { status: 'unavailable', detail: 'This result was computed before Shapley attribution was added to clustering.' };
  }
  if (shapley.status === 'unavailable') return { status: 'unavailable', detail: shapley.detail };

  const { evaluations, supported } = shapley.coverage;
  return {
    status: 'ready',
    data: {
      run_id: runId,
      maximising: run.maximising,
      algorithm: run.algorithm,
      benchmark: run.benchmark,
      topology: run.migration_topology,
      baseline_fitness: shapley.baseline_fitness,
      observed_best_fitness: shapley.observed_best_fitness,
      supported_best_fitness: shapley.supported_best_fitness,
      coverage: { total: evaluations, supported, excluded: evaluations - supported, percent: percentOf(supported, evaluations) },
      warnings: shapley.warnings,
      games: { islands: toGameView(shapley.islands), routes: toGameView(shapley.routes) },
    },
  };
}
