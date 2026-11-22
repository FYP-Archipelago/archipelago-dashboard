import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { makeResult, makeRun } from '@/test/fixtures.ts';
import { button, renderWorkspace } from '@/test/workspace.tsx';
import type { RunResult, ShapleyAttribution } from '@/types.ts';

const shapleyOf = (result: RunResult) => result.explainability.shapley as ShapleyAttribution;

const creditRows = () =>
  [...document.querySelectorAll('.credit-row')].map((row) => [
    row.querySelector('.credit-name')!.textContent,
    row.querySelector('.credit-value b')!.textContent,
  ]);

const groupText = () => document.querySelector('.group-result')!.textContent!;

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

  it('hides route attribution when migration was off, but keeps island attribution', async () => {
    const run = makeRun('run-1');
    await renderWorkspace('attribution', { run: { ...run, run_settings: { ...run.run_settings, 'migration.enabled': false } } });

    fireEvent.click(button('Migration route attribution'));
    expect(screen.getByText('Migration was off')).toBeTruthy();
    expect(screen.queryByText('Credit per route')).toBeNull();

    fireEvent.click(button('Island attribution'));
    expect(screen.getByText('Credit per island')).toBeTruthy();
  });

  it('finds what a picked group reaches whatever order it was picked in, and compares it with their credits', async () => {
    await renderWorkspace('attribution');

    // Islands 0 and 1 start picked: together 34 of 40, while their credits add up to 35 of 40.
    expect(groupText()).toContain('85%');
    expect(screen.getByText(/The coalition reaches less/)).toBeTruthy();

    fireEvent.click(button('Island 0'));
    fireEvent.click(button('Island 2'));
    fireEvent.click(button('Island 0'));
    expect(groupText()).toContain('100%');

    fireEvent.click(button('Migration route attribution'));
    // Routes 0 -> 1 and 1 -> 2 start picked: they reach 40, the whole 20 that needed migrants.
    expect(groupText()).toContain('100%');
  });

  it('marks each coalition chip with what adding or removing that player changes', async () => {
    await renderWorkspace('attribution');
    fireEvent.click(button('Migration route attribution'));

    // Routes 0 -> 1 and 1 -> 2 are picked and reach the whole 20. Without 0 -> 1 they keep 5, without 1 -> 2 they keep 15.
    const marks = Object.fromEntries(
      [...document.querySelectorAll('.group-chip')].map((chip) => [chip.getAttribute('aria-label'), chip.querySelector('small')!.textContent])
    );
    expect(marks).toEqual({ '0 → 1': '−75%', '1 → 2': '−25%', '1 → 0': '±0' });
  });

  it('shows sampled credit with whiskers for positive standard errors and explains why groups cannot be tried', async () => {
    const result = makeResult();
    const shapley = shapleyOf(result);
    await renderWorkspace('attribution', {
      result: {
        ...result,
        explainability: {
          shapley: {
            ...shapley,
            islands: {
              ...shapley.islands,
              sampled_orders: 1024,
              coalitions: [],
              players: shapley.islands.players.map((p) => ({ ...p, standard_error: p.player === 2 ? 0 : 1.5 })),
            },
          },
        },
      },
    });

    expect(document.querySelector('.credit-row small')!.textContent).toBe('22 ± 1.5');
    expect(screen.getByText(/Sampled game \(1,024 orders over 3 players\)/)).toBeTruthy();
    expect(document.querySelectorAll('.credit-error-bar')).toHaveLength(2);
    expect(screen.getByText(/ ± 0$/).closest('.credit-row')?.querySelector('.credit-error-bar')).toBeNull();
    expect(screen.getByText('Whiskers show a ±1 standard error.').querySelector('.credit-error-symbol')).toBeTruthy();

    fireEvent.click(button('Migration route attribution'));
    expect(document.querySelector('.credit-error-bar')).toBeNull();
    expect(screen.queryByText('Whiskers show a ±1 standard error.')).toBeNull();
  });

  it("says when a run could not be attributed, with the analysis's reason on hover", async () => {
    await renderWorkspace('attribution', {
      result: makeResult({ explainability: { shapley: { status: 'unavailable', detail: 'Too few logged parents.' } } }),
    });

    expect(screen.getByText('No attribution for this run')).toBeTruthy();
    expect(screen.getByText('No attribution for this run').closest('.empty-state')!.getAttribute('title')).toBe('Too few logged parents.');
  });
});
