import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { makeResult, makeRun } from '@/test/fixtures.ts';
import { button, renderWorkspace } from '@/test/workspace.tsx';

const run = makeRun('run-1');

const arrivalRows = () =>
  (
    within(screen.getByText('Where migrants landed').parentElement!.querySelector('table')!).getAllByRole('row').slice(1) as HTMLTableRowElement[]
  ).map((row) => [...row.cells].map((cell) => cell.textContent));

describe('MigrationTab', () => {
  it("totals each island's migrants sent and received, leaving out routes nobody took", async () => {
    await renderWorkspace('migration');

    // Rows give what each island sent, then the bottom row what each received, then the grand total.
    expect([...document.querySelectorAll('.heat-total')].map((cell) => cell.textContent)).toEqual(['6', '6', '0', '2', '6', '4', '12']);
    expect(screen.getByText('Routes used').parentElement!.textContent).toContain('3of 6 possible');
  });

  it('points to Attribution for which routes mattered, when the run has attribution', async () => {
    await renderWorkspace('migration');

    expect(screen.getByText('Improvement that needed migrants').parentElement!.textContent).toContain('50%');
    expect(screen.getByText('See Attribution').closest('a')!.getAttribute('href')).toBe('/runs/run-1/attribution?view=routes');
  });

  it('lists where migrants landed, busiest first, judging each arrival by which way the run optimises', async () => {
    await renderWorkspace('migration');

    // The link into cluster 99 is gone: that cluster faded out of the graph.
    expect(arrivalRows()).toEqual([
      ['0 →1', '#10 · 80', '#12 · 60', '4', 'Better by 20'],
      ['1 →2', '#13 · 60', '#20 · 60', '3', 'Same'],
      ['1 →0', '#12 · 60', '#10 · 80', '2', 'Worse by 20'],
    ]);
    expect(screen.getByText(/1 of them arrived in a cluster whose best beat/)).toBeTruthy();
  });

  it('reads a higher arrival best as better on a maximising run', async () => {
    await renderWorkspace('migration', { result: makeResult({ run: { ...makeResult().run, maximising: true } }) });

    expect(arrivalRows().map((row) => row[4])).toEqual(['Worse by 20', 'Same', 'Better by 20']);
  });

  it('shows the busiest ten links until asked for the rest', async () => {
    const graph = makeResult().graph;
    const many = Array.from({ length: 12 }, (_, i) => i);
    await renderWorkspace('migration', {
      result: makeResult({
        graph: { ...graph, migrations: { id: many, source: many.map(() => 10), target: many.map(() => 12), count: many.map((i) => i + 1) } },
      }),
    });

    expect(arrivalRows()).toHaveLength(10);
    expect(arrivalRows()[0]![3]).toBe('12');

    fireEvent.click(button('Show all 12 links'));
    expect(arrivalRows()).toHaveLength(12);
  });

  it('says migration was off instead of showing empty charts', async () => {
    await renderWorkspace('migration', { run: { ...run, run_settings: { ...run.run_settings, 'migration.enabled': false } } });

    expect(screen.getByText('Migration was off')).toBeTruthy();
    expect(document.querySelector('.heat-grid')).toBeNull();
  });
});
