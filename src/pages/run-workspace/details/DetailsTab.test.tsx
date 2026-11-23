import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { makeResult, makeRun } from '@/test/fixtures.ts';
import { renderWorkspace } from '@/test/workspace.tsx';

const row = (label: string) => screen.getByText(label, { selector: 'dt' }).parentElement!;

describe('DetailsTab', () => {
  it('shows the value an automatic distance resolved to', async () => {
    await renderWorkspace('details');

    expect(row('BIRCH threshold').textContent).toBe('BIRCH threshold' + 'Auto → 0.354');
  });

  it('switches clustering time from seconds to minutes past a minute', async () => {
    const result = makeResult();
    await renderWorkspace('details', { result: { ...result, clustering: { ...result.clustering, elapsed_seconds: 75.8 } } });

    expect(screen.getByText('Clustering time').nextElementSibling?.textContent).toBe('1m 15s');
  });

  it('goes by the stages that actually ran once there is a result, over the settings asked for', async () => {
    // makeRun asks for every stage; the result ran only LSH and BIRCH.
    await renderWorkspace('details');

    expect(row('Stages').textContent).toContain('LSH → BIRCH');
    expect(row('DenStream epsilon').className).toBe('settings-row-off');
    expect(row('DenStream epsilon').querySelector('dd')?.textContent).toBe('—');
    expect(screen.getByText('BIRCH')).toBeTruthy();
    expect(screen.queryByText('DenStream', { selector: 'h4' })).toBeNull();
  });

  it("shows the stagnation limit once, falling back to the runner's for runs from before the setting", async () => {
    const run = makeRun('run-1');
    const older = { ...run.run_settings };
    delete older['termination.stagnation_generations'];
    // makeResult reports a limit of 2.
    await renderWorkspace('details', { run: { ...run, run_settings: older } });

    expect(row('Stagnation limit').textContent).toBe('Stagnation limit' + '2 generations');
    expect(screen.queryByText(/Termination/)).toBeNull();
  });

  it('lists run settings it has no label for, so new runner settings still show', async () => {
    const run = makeRun('run-1');
    await renderWorkspace('details', { run: { ...run, run_settings: { ...run.run_settings, mutation_rate: 0.05 } as typeof run.run_settings } });

    expect(row('Mutation rate').textContent).toContain('0.05');
  });

  it('says why the islands stopped, and which island left no end behind', async () => {
    const result = makeResult();
    await renderWorkspace('details', { result: { ...result, island_ends: result.island_ends.slice(0, 2) } });

    expect([...document.querySelectorAll('.budget-legend-reason')].map((reason) => reason.textContent)).toEqual([
      '2 islands stagnated',
      '1 with no end recorded',
    ]);
  });

  it('flags warnings and malformed rows instead of calling the data clean', async () => {
    await renderWorkspace('details', { result: makeResult({ warnings: ['3 rows had no genome'], malformed_rows: 2 }) });

    expect(screen.getByText('2 issues')).toBeTruthy();
    expect(screen.getByText('3 rows had no genome')).toBeTruthy();
    expect(screen.queryByText('Clean')).toBeNull();
  });
});
