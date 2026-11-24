import type { IslandEnd, Run, RunResult, TerminationReason } from '@/types.ts';

// The runner's own per-island budget when the result has it, otherwise an even split.
export const budgetPerIsland = (run: Run, result: RunResult) =>
  result.run.budget_per_island ?? run.run_settings.evaluation_budget / Math.max(1, result.run.islands.length);

// What each stop reason says about one island or several, and its marker on the budget track.
export const REASONS: Record<TerminationReason, { one: string; many: string; marker: string }> = {
  stagnation: { one: 'stagnated', many: 'stagnated', marker: 'budget-marker-hollow' },
  max_evaluations: { one: 'spent its budget', many: 'spent their budget', marker: 'budget-marker-filled' },
  max_generations: { one: 'hit the generation cap', many: 'hit the generation cap', marker: 'budget-marker-square' },
  target_fitness_reached: { one: 'reached the target', many: 'reached the target', marker: 'budget-marker-target' },
  time_limit: { one: 'ran out of time', many: 'ran out of time', marker: 'budget-marker-halted' },
  error: { one: 'failed', many: 'failed', marker: 'budget-marker-halted' },
  aborted: { one: 'was cancelled', many: 'were cancelled', marker: 'budget-marker-halted' },
};

export const reasonPhrase = (reason: TerminationReason, count: number) => (count === 1 ? REASONS[reason].one : REASONS[reason].many);

// One island's stop as a sentence, e.g. "Stagnated after 50 generations without improvement".
export function stopText(end: IslandEnd): string {
  const phrase = reasonPhrase(end.termination_reason, 1);
  const text = phrase.charAt(0).toUpperCase() + phrase.slice(1);
  const since = end.generations_since_improvement;
  return end.termination_reason === 'stagnation' && since !== null ? `${text} after ${since} generations without improvement` : text;
}
