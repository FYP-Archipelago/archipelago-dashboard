import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { makeResult } from '@/test/fixtures.ts';
import { button, renderWorkspace } from '@/test/workspace.tsx';

const creditRows = () =>
  [...document.querySelectorAll('.credit-row')].map((row) => [
    row.querySelector('.credit-name')!.textContent,
    row.querySelector('.credit-value b')!.textContent,
  ]);

describe('AttributionTab', () => {
  it("shares each island's credit out of the whole improvement, highest first", async () => {
    await renderWorkspace('attribution');

    expect(creditRows()).toEqual([
      ['Island 0', '55%'],
      ['Island 1', '33%'],
      ['Island 2', '13%'],
    ]);
    expect(document.querySelector('.credit-headline')!.textContent).toBe('Island 0 holds the largest share, 55%, followed by Island 1 at 33%.');
  });

  it('shares route credit out of only the improvement that needed migrants', async () => {
    await renderWorkspace('attribution');

    fireEvent.click(button('Migration route attribution'));

    expect(document.querySelector('.shared-text')!.textContent).toContain('The other 20 (50%) needed migrants');
    expect(creditRows()).toEqual([
      ['0 → 1', '75%'],
      ['1 → 2', '25%'],
      ['1 → 0', '0%'],
    ]);
    expect(window.location.search).toBe('?view=routes');
  });

  it('opens on the routes when linked with ?view=routes', async () => {
    window.history.replaceState(null, '', '/runs/run-1/attribution?view=routes');
    await renderWorkspace('attribution');

    expect(button('Migration route attribution').getAttribute('aria-pressed')).toBe('true');
  });

  it("says when a run could not be attributed, with the analysis's reason on hover", async () => {
    await renderWorkspace('attribution', {
      result: makeResult({ explainability: { shapley: { status: 'unavailable', detail: 'Too few logged parents.' } } }),
    });

    expect(screen.getByText('No attribution for this run')).toBeTruthy();
    expect(screen.getByText('No attribution for this run').closest('.empty-state')!.getAttribute('title')).toBe('Too few logged parents.');
  });
});
