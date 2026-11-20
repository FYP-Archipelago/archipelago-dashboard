import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import Link from './components/Link.tsx';
import { navigate, newRunHref, RUN_TABS, runHref, useRoute } from './route.ts';

describe('routing', () => {
  it('reads the new run page as its own route, not as a run named "new"', () => {
    window.history.replaceState(null, '', newRunHref);

    expect(renderHook(useRoute).result.current).toEqual({ name: 'new' });
  });

  it('round-trips run ids that need escaping, with and without a tab', () => {
    const id = 'run 1/a?b#c';
    window.history.replaceState(null, '', runHref(id, 'details'));
    expect(renderHook(useRoute).result.current).toEqual({ name: 'run', id, tab: 'details' });

    window.history.replaceState(null, '', runHref(id));
    expect(renderHook(useRoute).result.current).toEqual({ name: 'run', id, tab: RUN_TABS[0] });
  });

  it("opens a run's first tab for a tab it does not have", () => {
    window.history.replaceState(null, '', '/runs/run-1/nonsense');

    expect(renderHook(useRoute).result.current).toEqual({ name: 'run', id: 'run-1', tab: RUN_TABS[0] });
  });

  it('falls back to the runs list for unknown paths', () => {
    window.history.replaceState(null, '', '/somewhere/else');

    expect(renderHook(useRoute).result.current).toEqual({ name: 'runs' });
  });

  it('follows navigate() and the back button', () => {
    window.history.replaceState(null, '', '/runs');
    const { result } = renderHook(useRoute);

    act(() => navigate(runHref('run-1')));
    expect(result.current).toEqual({ name: 'run', id: 'run-1', tab: RUN_TABS[0] });

    act(() => {
      window.history.replaceState(null, '', '/runs');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(result.current).toEqual({ name: 'runs' });
  });

  it('does not stack a history entry for the page already open', () => {
    window.history.replaceState(null, '', '/runs');
    const before = window.history.length;

    navigate('/runs');

    expect(window.history.length).toBe(before);
  });
});

// Whether Link let the click through to the browser. The click is cancelled afterwards so jsdom does not try to load the page.
function clickPassedThrough(target: Element, init: MouseEventInit = {}) {
  let passed = false;
  const record = (event: Event) => {
    passed = !event.defaultPrevented;
    event.preventDefault();
  };
  window.addEventListener('click', record);
  fireEvent.click(target, init);
  window.removeEventListener('click', record);
  return passed;
}

describe('Link', () => {
  it('navigates in place on a plain click', () => {
    window.history.replaceState(null, '', '/runs');
    render(<Link href={runHref('run-1')}>Open</Link>);

    expect(clickPassedThrough(screen.getByText('Open'))).toBe(false);
    expect(window.location.pathname).toBe('/runs/run-1');
  });

  it('leaves modified clicks to the browser, for opening in a new tab', () => {
    window.history.replaceState(null, '', '/runs');
    render(<Link href={runHref('run-1')}>Open</Link>);

    expect(clickPassedThrough(screen.getByText('Open'), { ctrlKey: true })).toBe(true);
    expect(window.location.pathname).toBe('/runs');
  });
});
