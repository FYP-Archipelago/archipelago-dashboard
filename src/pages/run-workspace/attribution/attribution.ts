import type { ShapleyGame } from '@/types.ts';

type Step = ShapleyGame['orders'][number][number];

// One slot of the marginal-contribution chart: a step that changed the value, or a run of consecutive steps that
// added nothing, collapsed so large games (30 routes, say) stay readable. Step numbers count from 1.
type Slot = { kind: 'step'; step: Step; number: number } | { kind: 'zeros'; steps: Step[]; first: number; last: number };

export function waterfallSlots(steps: Step[]): Slot[] {
  const slots: Slot[] = [];
  steps.forEach((step, i) => {
    const previous = slots.at(-1);
    if (step.after !== step.before) slots.push({ kind: 'step', step, number: i + 1 });
    else if (previous?.kind === 'zeros') {
      previous.steps.push(step);
      previous.last = i + 1;
    } else slots.push({ kind: 'zeros', steps: [step], first: i + 1, last: i + 1 });
  });
  return slots;
}
