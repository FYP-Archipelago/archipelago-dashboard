import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { makeResult, makeRun } from '@/test/fixtures.ts';
import { button, renderWorkspace } from '@/test/workspace.tsx';

const run = makeRun('run-1');

const arrivalRows = () =>
  (
    within(screen.getByText('Where migrants landed').closest('.section-head')!.parentElement!.querySelector('table')!)
      .getAllByRole('row')
      .slice(1) as HTMLTableRowElement[]
  ).map((row) => [...row.cells].map((cell) => cell.textContent));

describe('MigrationTab', () => {
  it("totals each island's migrants sent and received, leaving out routes nobody took", async () => {
    await renderWorkspace('migration');

    // Rows give what each island sent, then the bottom row what each received, then the grand total.
    expect([...document.querySelectorAll('.heat-total')].map((cell) => cell.textContent)).toEqual(['6', '6', '0', '2', '6', '4', '12']);
    expect(screen.getByText('Routes used').parentElement!.textContent).toContain('3of 6 possible');
  });

  it("keeps an island's routes brought out after hovering it, until a route of another island is picked", async () => {
    await renderWorkspace('migration');
    // Routes in order: 0 → 1, 1 → 0, 1 → 2. Island 0 sends 0 → 1 and takes in 1 → 0.
    const routes = [...document.querySelectorAll('.flow-route')];
    const dimmed = () => routes.map((route) => route.classList.contains('flow-route-dimmed'));
    const lit = () => [...document.querySelectorAll('.heat-cell-selected')].map((cell) => cell.getAttribute('aria-label'));
    const island = document.querySelectorAll('.flow-island')[0]!;
    // Out onto the diagram's empty space, as moving off an element inside it does.
    const out = (element: Element) => fireEvent.pointerOut(element, { relatedTarget: document.querySelector('.flow-diagram') });
    const islandRoutes = ['Island 0 → island 1: 6 migrants', 'Island 1 → island 0: 2 migrants'];

    fireEvent.pointerMove(island);
    const tip = within(document.querySelector<HTMLElement>('.hover-tip')!);
    expect(tip.getByText('Migrants in').textContent).toBe('Migrants in2 · from 1 island');
    expect(tip.getByText('Migrants out').textContent).toBe('Migrants out6 · to 1 island');
    expect(dimmed()).toEqual([false, false, true]);
    expect(lit()).toEqual(islandRoutes);

    // Through the gap to one of its routes: still brought out, and only that route lights up in the matrix.
    out(island);
    expect(dimmed()).toEqual([false, false, true]);
    fireEvent.pointerMove(routes[0]!);
    expect(document.querySelector('.hover-tip')!.textContent).toContain('Island 0 →Island 1');
    expect(lit()).toEqual([islandRoutes[0]]);
    out(routes[0]!);
    expect(dimmed()).toEqual([false, false, true]);
    expect(lit()).toEqual(islandRoutes);

    // A route that does not touch island 0 lets it go.
    fireEvent.pointerMove(routes[2]!);
    out(routes[2]!);
    expect(dimmed()).toEqual([false, false, false]);
    expect(lit()).toEqual([]);
  });

  it('shows how much of the improvement needed migrants, when the run has attribution', async () => {
    await renderWorkspace('migration');

    expect(screen.getByText('Improvement that needed migrants').parentElement!.textContent).toContain('50%');
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

    // The filter keeps only the arrivals of one outcome.
    fireEvent.change(screen.getByLabelText("Arrival cluster's best"), { target: { value: 'arrival-worse' } });
    expect(arrivalRows()).toEqual([['1 →0', '#12 · 60', '#10 · 80', '2', 'Worse by 20']]);
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
