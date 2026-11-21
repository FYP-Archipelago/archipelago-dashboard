import { describe, expect, it } from 'vitest';

import { waterfallSlots } from './attribution.ts';

const step = (player: number, before: number, after: number) => ({ player, before, after });

describe('waterfallSlots', () => {
  it('collapses each run of steps that added nothing into one slot, numbering steps from 1', () => {
    const steps = [step(0, 0, 0), step(1, 0, 0), step(2, 0, 5), step(3, 5, 5), step(4, 5, 9), step(5, 9, 9), step(6, 9, 9)];

    expect(
      waterfallSlots(steps).map((slot) => (slot.kind === 'step' ? `${slot.number}:+` : `${slot.first}-${slot.last}:${slot.steps.length}x0`))
    ).toEqual(['1-2:2x0', '3:+', '4-4:1x0', '5:+', '6-7:2x0']);
  });

  it('keeps a step that lowered the value as its own slot', () => {
    expect(waterfallSlots([step(0, 4, 2)])).toEqual([{ kind: 'step', step: step(0, 4, 2), number: 1 }]);
  });
});
