import { cleanup, fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { makeResult } from '@/test/fixtures.ts';
import { button, findButton, renderWorkspace } from '@/test/workspace.tsx';

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

  it('hides the chart switch when the runner stopped no island on stagnation, even one that went the limit without improving', async () => {
    const result = makeResult();
    result.island_ends = result.island_ends.map((end) => ({ ...end, termination_reason: 'max_evaluations' }));
    await renderWorkspace('convergence', { result });

    expect(findButton('Stagnation markers')).toBeUndefined();
    expect(screen.queryByText('Stagnated')).toBeNull();
  });

  it('flags the islands the runner stopped on stagnation, and none when the run has no island ends', async () => {
    const flagged = () =>
      [...document.querySelectorAll('.stagnation-flag')].map(
        (flag) =>
          flag
            .closest('tr')!
            .querySelector('.island-cell')!
            .textContent!.match(/^Island \d+/)![0]
      );
    const result = makeResult();
    // The logs show island 2 improving in its last generation, but below the runner's tolerance, so the runner's count
    // and stop reason are what the table shows. Island 1 went 2 generations without but used up its budget.
    result.island_ends = result.island_ends.map((end) =>
      end.island_id === 2
        ? { ...end, termination_reason: 'stagnation', generations_since_improvement: 2 }
        : { ...end, termination_reason: 'max_evaluations' }
    );
    await renderWorkspace('convergence', { result });
    expect(flagged()).toEqual(['Island 2']);
    expect(document.querySelector('.stagnation-flag')!.parentElement!.textContent).toBe('2 gens (40%)Stagnated');

    cleanup();
    await renderWorkspace('convergence', { result: makeResult({ island_ends: [] }) });
    expect(flagged()).toEqual([]);
  });

  it('labels stagnated islands and lets users turn their chart markers on without redrawing their lines', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(720);
    const result = makeResult();
    result.island_ends = result.island_ends.map((end) => (end.island_id === 0 ? { ...end, termination_reason: 'max_evaluations' } : end));
    result.generation_history.find((row) => row.island_id === 1 && row.generation === 4)!.mean_fitness = null;
    await renderWorkspace('convergence', { result });

    const markers = button('Stagnation markers');
    const firstLine = document.querySelector('.chart-line');
    const firstCross = document.querySelector('.chart-end-cross')!;
    expect(markers.closest('.chart-card')).toBeTruthy();
    expect(markers.getAttribute('aria-checked')).toBe('false');
    expect(firstCross.getAttribute('data-visible')).toBe('false');
    expect(screen.getByTitle('Stagnation limit: 2 generations').textContent).toBe('Stagnated');
    expect(screen.queryByText('Island stopped at the stagnation limit')).toBeNull();

    fireEvent.click(markers);
    expect(markers.getAttribute('aria-checked')).toBe('true');
    expect(firstCross.getAttribute('data-visible')).toBe('true');
    expect(document.querySelector('.chart-line')).toBe(firstLine);
    expect(screen.getByText('Island stopped at the stagnation limit')).toBeTruthy();

    fireEvent.click(markers);
    expect(document.querySelector('.chart-end-cross')).toBe(firstCross);
    expect(firstCross.getAttribute('data-visible')).toBe('false');
    expect(screen.queryByText('Island stopped at the stagnation limit')).toBeNull();
    fireEvent.click(markers);

    fireEvent.click(button('Mean fitness'));
    fireEvent.click(button('Generations'));
    const crosses = document.querySelectorAll('.chart-end-cross');
    const islandLine = document.querySelectorAll('.chart-line')[1]!;
    const lastPlottedPoint = islandLine.getAttribute('d')!.split('L').at(-1);
    expect(crosses).toHaveLength(1);
    expect(crosses[0]).not.toBe(firstCross);
    expect(crosses[0]!.getAttribute('transform')).toBe(`translate(${lastPlottedPoint})`);

    fireEvent.click(button('Island 1'));
    expect(document.querySelector('.chart-end-cross')).toBeNull();
    fireEvent.click(button('Island 1'));
    expect(document.querySelector('.chart-end-cross')?.getAttribute('data-visible')).toBe('true');
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
