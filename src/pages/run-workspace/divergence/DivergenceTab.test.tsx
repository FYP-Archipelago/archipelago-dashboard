import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { makeResult } from '@/test/fixtures.ts';
import { button, findButton, renderWorkspace } from '@/test/workspace.tsx';

const fact = (label: string) => screen.getByText(label, { selector: 'dt' }).nextElementSibling!.textContent;

describe('DivergenceTab', () => {
  it('starts on the most different pair and plots it with the most alike one', async () => {
    await renderWorkspace('divergence');

    expect(screen.getByText('Most different').parentElement!.textContent).toContain('Islands 0 ↔ 1');
    expect(screen.getByText('Real differences').parentElement!.textContent).toContain('2of 3 pairs');
    expect(button('Islands 0 ↔ 1').getAttribute('aria-pressed')).toBe('true');
    expect(button('Islands 0 ↔ 1: 0.5').getAttribute('aria-pressed')).toBe('true');
    expect(['0 ↔ 1', '0 ↔ 2', '1 ↔ 2'].map((name) => button(name).getAttribute('aria-pressed'))).toEqual(['true', 'true', 'false']);
  });

  it('switches between a pair shortcut and another pair selected from the matrix', async () => {
    await renderWorkspace('divergence');

    fireEvent.click(button('Islands 0 ↔ 2'));

    expect(button('Islands 0 ↔ 1').getAttribute('aria-pressed')).toBe('false');
    expect(button('Islands 0 ↔ 2').getAttribute('aria-pressed')).toBe('true');
    expect(fact('Swap test')).toBe('Could be chance · p = 0.3');
    expect(button('Islands 0 ↔ 2: 0.1').getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(button('Islands 2 ↔ 1: 0.2'));

    expect(button('Islands 0 ↔ 2').getAttribute('aria-pressed')).toBe('false');
    expect(fact('Selected pair')).toContain('Islands 1 ↔ 2');
    expect(button('Islands 1 ↔ 2: 0.2').getAttribute('aria-pressed')).toBe('true');
  });

  it("shows a window's own values, and no cell for a pair the window lacks", async () => {
    await renderWorkspace('divergence');

    fireEvent.click(button('By window'));

    expect(button('Islands 0 ↔ 1: 0.6')).toBeTruthy();
    expect(findButton(/^Islands 0 ↔ 2:/)).toBeUndefined();
    expect(screen.getByText(/From generation 10/)).toBeTruthy();
  });

  it('explains when there are too few islands to compare', async () => {
    const result = makeResult();
    await renderWorkspace('divergence', { result: { ...result, separation: { ...result.separation, pairs: { a: [], b: [], mmd2: [], p: [] } } } });

    expect(screen.getByText('Nothing to compare')).toBeTruthy();
  });
});
