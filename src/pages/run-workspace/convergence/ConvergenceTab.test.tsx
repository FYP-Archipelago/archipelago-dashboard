import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { makeResult } from '@/test/fixtures.ts';
import { button, renderWorkspace } from '@/test/workspace.tsx';

const pressed = (name: string) => button(name).getAttribute('aria-pressed');

describe('ConvergenceTab', () => {
  it('marks the island that reached a shared best first, and says the tie', async () => {
    await renderWorkspace('convergence');

    const badge = screen.getByText('Run best');
    expect(badge.closest('tr')!.textContent).toContain('Island 1');
    expect(badge.getAttribute('title')).toBe("2 islands ended on the run's best value; this one reached it first.");
  });

  it('turns off the log scale for a metric with values at or below zero, and back on for one without', async () => {
    await renderWorkspace('convergence');
    expect(pressed('Log')).toBe('true');

    fireEvent.click(button('Mean fitness'));
    expect(button('Log')).toHaveProperty('disabled', true);
    expect(pressed('Linear')).toBe('true');

    fireEvent.click(button('Best so far'));
    expect(pressed('Log')).toBe('true');
  });

  it('starts a maximising run on a linear scale and reads higher as better', async () => {
    await renderWorkspace('convergence', { result: makeResult({ run: { ...makeResult().run, maximising: true } }) });

    expect(pressed('Linear')).toBe('true');
    expect(screen.getByText('Higher is better')).toBeTruthy();
  });

  it('keeps at least one island on the chart', async () => {
    await renderWorkspace('convergence');

    fireEvent.click(button('Island 0'));
    fireEvent.click(button('Island 1'));
    fireEvent.click(button('Island 2'));

    expect([0, 1, 2].map((island) => pressed(`Island ${island}`))).toEqual(['false', 'false', 'true']);
  });

  it('only calls it convergence when the run had time left after it, not when it was still improving at the end', async () => {
    await renderWorkspace('convergence');
    expect(screen.getByText(/^Estimated convergence: /)).toBeTruthy();

    // Island 1 now keeps improving until the last generation, which reaches the run's best.
    const result = makeResult();
    const stillImproving = result.generation_history.map((row) =>
      row.island_id === 1 ? { ...row, best_so_far_fitness: [100, 90, 80, 70, 55][row.generation]! } : row
    );
    await renderWorkspace('convergence', { result: { ...result, generation_history: stillImproving } });
    expect(screen.getByText('No estimated convergence: the run was still improving at the end')).toBeTruthy();
  });

  it('falls back to generations when the runner logged no evaluation counts', async () => {
    const result = makeResult();
    await renderWorkspace('convergence', {
      result: { ...result, generation_history: result.generation_history.map((row) => ({ ...row, evaluations_total: null })) },
    });

    expect(button('Evaluations')).toHaveProperty('disabled', true);
    expect(pressed('Generations')).toBe('true');
  });
});
