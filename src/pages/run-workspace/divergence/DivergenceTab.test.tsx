import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { makeResult, makeRun } from '@/test/fixtures.ts';
import { button, findButton, renderWorkspace } from '@/test/workspace.tsx';

describe('DivergenceTab', () => {
  it('starts with the most different and most alike pairs on the chart, highlighted in the matrix', async () => {
    await renderWorkspace('divergence');

    expect(screen.getByText('Most different').parentElement!.textContent).toContain('Islands 0 ↔ 1');
    expect(screen.getByText('Real differences').parentElement!.textContent).toContain('2of 3 pairs');
    expect(['0 ↔ 1', '0 ↔ 2', '1 ↔ 2'].map((name) => button(name).getAttribute('aria-pressed'))).toEqual(['true', 'true', 'false']);
    expect(['Islands 0 ↔ 1: 0.5', 'Islands 0 ↔ 2: 0.1', 'Islands 1 ↔ 2: 0.2'].map((name) => button(name).getAttribute('aria-pressed'))).toEqual([
      'true',
      'true',
      'false',
    ]);
  });

  it('puts a pair on the chart from the matrix, and marks the swap-tested real differences over the whole run only', async () => {
    await renderWorkspace('divergence');

    fireEvent.click(button('Islands 1 ↔ 2: 0.2'));
    expect(button('1 ↔ 2').getAttribute('aria-pressed')).toBe('true');
    expect(button('Islands 1 ↔ 2: 0.2').getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(button('Islands 0 ↔ 1: 0.5'));
    expect(button('0 ↔ 1').getAttribute('aria-pressed')).toBe('false');

    // p = 0.003 and 0.01 are real differences; 0.3 could be chance.
    const real = () => [...document.querySelectorAll('.heat-cell-real')].map((cell) => cell.getAttribute('aria-label'));
    expect(real()).toEqual(['Islands 0 ↔ 1: 0.5', 'Islands 1 ↔ 0: 0.5', 'Islands 1 ↔ 2: 0.2', 'Islands 2 ↔ 1: 0.2']);
    expect(button('Islands 0 ↔ 2: 0.1').getAttribute('title')).toBe('Could be chance · swap test p = 0.3');
    fireEvent.click(button('By window'));
    expect(real()).toEqual([]);
  });

  it("shows a window's own values, and no cell for a pair the window lacks", async () => {
    await renderWorkspace('divergence');

    fireEvent.click(button('By window'));

    expect(button('Islands 0 ↔ 1: 0.6')).toBeTruthy();
    expect(findButton(/^Islands 0 ↔ 2:/)).toBeUndefined();
    expect(screen.getByText('Gen 10+')).toBeTruthy();

    // The slider picks the window the matrix shows.
    fireEvent.change(screen.getByLabelText('Window'), { target: { value: '0' } });
    expect(screen.getByText('Gen 0–9')).toBeTruthy();
    expect(button('Islands 0 ↔ 1: 0.4')).toBeTruthy();
    expect(button('Islands 0 ↔ 2: 0.2')).toBeTruthy();
  });

  it('combines the mean, picked pairs and their migration markers, sharing a guide when they move in opposite directions', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(600);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(360);
    const run = makeRun('run-1');
    const result = makeResult();
    await renderWorkspace('divergence', {
      run,
      result: {
        ...result,
        migration_arrivals: [{ generation: 12, source: 0, destination: 1, migrants: 2, source_generation: 10 }],
        separation: {
          ...result.separation,
          window_pairs: { window: [0, 0, 0, 1, 1], a: [0, 0, 1, 0, 1], b: [1, 2, 2, 1, 2], mmd2: [0.4, 0.2, 0.45, 0.6, 0.15] },
        },
      },
    });
    const chart = screen.getByLabelText('Divergence per window of generations');
    const count = (selector: string) => chart.querySelectorAll(selector).length;

    expect(screen.queryByRole('group', { name: 'Chart variant' })).toBeNull();
    expect(count('.chart-line')).toBe(3);
    expect(count('.chart-guides path')).toBe(1);

    fireEvent.click(button('Islands 1 ↔ 2: 0.2'));
    expect(button('1 ↔ 2').getAttribute('aria-pressed')).toBe('true');
    expect(count('.chart-line')).toBe(4);
    expect(count('.chart-guides line')).toBe(1);
    expect(count('.chart-guides path')).toBe(2);
    expect(screen.getByText('Drew closer after migration').querySelector('.divergence-migration-arrow')?.getAttribute('data-direction')).toBe(
      'closer'
    );
    expect(screen.getByText('Moved apart after migration').querySelector('.divergence-migration-arrow')?.getAttribute('data-direction')).toBe(
      'apart'
    );

    fireEvent.click(button('All'));
    const hoverTarget = chart.querySelector('rect')!;
    vi.spyOn(hoverTarget, 'getBoundingClientRect').mockReturnValue(DOMRect.fromRect({ width: 524, height: 302 }));
    fireEvent.pointerMove(hoverTarget, { clientX: 524, clientY: 40 });

    const tooltip = document.querySelector<HTMLElement>('.hover-tip')!;
    const tip = within(tooltip);
    expect(tip.getByText('From generation 10', { selector: '.divergence-hover-window' })).toBeTruthy();
    expect(tooltip.querySelector('.divergence-hover-generation')!.textContent).toBe('After 1 migration · gen 1–10');
    const closer = within(tip.getByText('Drew closer').parentElement!);
    const apart = within(tip.getByText('Moved apart').parentElement!);
    expect(closer.getByRole('listitem', { name: 'Islands 1 ↔ 2' })).toBeTruthy();
    expect(apart.getByRole('listitem', { name: 'Mean of all pairs' })).toBeTruthy();
    expect(apart.getByRole('listitem', { name: 'Islands 0 ↔ 1' })).toBeTruthy();
    expect([...tooltip.querySelectorAll('.hover-tip-row b')].map((row) => row.textContent)).toEqual(['0.6', '0.38', '0.15', '—']);
    fireEvent.pointerMove(hoverTarget, { clientX: 0, clientY: 40 });
    expect(tip.getByText('Generations 0 to 9', { selector: '.divergence-hover-window' })).toBeTruthy();
    expect(tooltip.querySelector('.divergence-hover-generation')).toBeNull();

    // The mean moved apart too, so its mark stays with no pairs picked.
    fireEvent.click(button('None'));
    expect(count('.chart-line')).toBe(1);
    expect(count('.chart-guides path')).toBe(1);
    expect(screen.getByText('Mean of all pairs', { selector: '.chart-legend span' }).parentElement!.textContent).toContain(
      'Moved apart after migration'
    );
  });

  it('explains when there are too few islands to compare', async () => {
    const result = makeResult();
    await renderWorkspace('divergence', { result: { ...result, separation: { ...result.separation, pairs: { a: [], b: [], mmd2: [], p: [] } } } });

    expect(screen.getByText('Nothing to compare')).toBeTruthy();
  });
});
