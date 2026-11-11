const MALFORMED = 'The run result has malformed Shapley attribution.';

const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value);
const isCount = (value) => Number.isSafeInteger(value) && value >= 0;
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isIsland = isCount;
const isRoute = (value) => Array.isArray(value) && value.length === 2 && value.every(isCount);

// A player is an island id or a [source, destination] route.
const playerKey = (player) => (Array.isArray(player) ? player.join('-') : String(player));
const playerLabel = (player) => (Array.isArray(player) ? `${player[0]} → ${player[1]}` : `Island ${player}`);

const percentOf = (value, total) => (total > 0 ? (100 * value) / total : 0);

function isValidGame(game, isPlayer) {
  if (!isRecord(game)) return false;
  const { empty_value, full_value, sampled_orders, players, coalitions, orders } = game;
  if (!isFiniteNumber(empty_value) || !isFiniteNumber(full_value)) return false;
  if (sampled_orders !== null && !isCount(sampled_orders)) return false;
  if (![players, coalitions, orders].every(Array.isArray)) return false;

  const validPlayers = players.every(
    (p) => isRecord(p) && isPlayer(p.player) && isFiniteNumber(p.value) && (p.standard_error === null || isFiniteNumber(p.standard_error))
  );
  if (!validPlayers) return false;

  const known = new Set(players.map((p) => playerKey(p.player)));
  if (known.size !== players.length) return false;
  const isKnown = (player) => isPlayer(player) && known.has(playerKey(player));

  const validCoalitions = coalitions.every((c) => isRecord(c) && Array.isArray(c.players) && c.players.every(isKnown) && isFiniteNumber(c.value));
  const validOrders = orders.every(
    (order) =>
      Array.isArray(order) &&
      order.every((step) => isRecord(step) && isKnown(step.player) && isFiniteNumber(step.before) && isFiniteNumber(step.after))
  );
  return validCoalitions && validOrders;
}

function isValidAttribution(shapley) {
  if (!isRecord(shapley) || shapley.status !== 'ready') return false;
  const { coverage, warnings } = shapley;
  const validFitness = ['baseline_fitness', 'observed_best_fitness', 'supported_best_fitness'].every((key) => isFiniteNumber(shapley[key]));
  const validCoverage =
    isRecord(coverage) &&
    isCount(coverage.evaluations) &&
    coverage.evaluations > 0 &&
    isCount(coverage.supported) &&
    coverage.supported <= coverage.evaluations;
  const validWarnings = Array.isArray(warnings) && warnings.every((warning) => typeof warning === 'string');
  return validFitness && validCoverage && validWarnings && isValidGame(shapley.islands, isIsland) && isValidGame(shapley.routes, isRoute);
}

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
  const run = result?.run;
  if (!isRecord(run) || run.run_id !== runId || typeof run.maximising !== 'boolean') {
    throw new Error('The run result is malformed or belongs to another run.');
  }

  const shapley = result.explainability?.shapley;
  if (shapley === undefined) {
    return { status: 'unavailable', detail: 'This result was computed before Shapley attribution was added to clustering.' };
  }
  if (shapley?.status === 'unavailable' && typeof shapley.detail === 'string') {
    return { status: 'unavailable', detail: shapley.detail };
  }
  if (!isValidAttribution(shapley)) throw new Error(MALFORMED);

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
