import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { makeRun } from '@/test/fixtures.ts';
import { renderWorkspace } from '@/test/workspace.tsx';

const run = makeRun('run-1');

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

  it('says migration was off instead of showing empty charts', async () => {
    await renderWorkspace('migration', { run: { ...run, run_settings: { ...run.run_settings, 'migration.enabled': false } } });

    expect(screen.getByText('Migration was off')).toBeTruthy();
    expect(document.querySelector('.heat-grid')).toBeNull();
  });
});
