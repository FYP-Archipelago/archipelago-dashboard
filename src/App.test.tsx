import { act, fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { mockBackend } from './test/backend.ts';
import { makeRun, PRESETS } from './test/fixtures.ts';
import { renderWithQuery } from './test/query.tsx';

// App sends / to the runs list as it loads, so each test imports a fresh copy after setting the address.
async function openApp(path: string, routes?: Parameters<typeof mockBackend>[0]) {
  window.history.replaceState(null, '', path);
  const fetchMock = mockBackend({
    'GET /health': () => ({ body: { status: 'ok', version: '0.2.0', ready: true } }),
    'GET /runs': () => ({ body: { runs: [makeRun('run-1')], next_cursor: null } }),
    'GET /presets': () => ({ body: PRESETS }),
    ...routes,
  });
  vi.resetModules();
  const { default: App } = await import('./App.tsx');
  renderWithQuery(<App />);
  await act(async () => {});
  return fetchMock;
}

const allRunsRequests = (fetchMock: Awaited<ReturnType<typeof openApp>>) =>
  fetchMock.mock.calls.filter(([input, init]) => {
    const url = new URL(input);
    return init?.method === 'GET' && url.pathname === '/runs' && !url.searchParams.has('status');
  });

describe('App', () => {
  it('opens on the runs list', async () => {
    await openApp('/');

    expect(window.location.pathname).toBe('/runs');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Runs');
  });

  it("opens the new run page from the sidebar's New Run button", async () => {
    await openApp('/runs');

    fireEvent.click(screen.getByText('New Run').closest('a')!);
    await act(async () => {});

    expect(window.location.pathname).toBe('/runs/new');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('New Run');
    expect(screen.getByText('Start Run')).toBeTruthy();
  });

  it('shares one All runs request between the sidebar and page on load and on each visible poll', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    const fetchMock = await openApp('/runs');
    expect(allRunsRequests(fetchMock)).toHaveLength(1);

    await act(() => vi.advanceTimersByTimeAsync(10000));
    expect(allRunsRequests(fetchMock)).toHaveLength(2);

    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    await act(() => vi.advanceTimersByTimeAsync(10000));
    expect(allRunsRequests(fetchMock)).toHaveLength(2);
  });

  it('refetches the sidebar runs immediately after a successful start', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
    const fetchMock = await openApp('/runs/new', {
      'POST /runs': () => ({ status: 201, body: makeRun('run-new') }),
    });
    expect(allRunsRequests(fetchMock)).toHaveLength(1);

    fireEvent.click(screen.getByText('Start Run'));
    await act(() => vi.advanceTimersByTimeAsync(400));

    expect(screen.getByText('Run started')).toBeTruthy();
    expect(allRunsRequests(fetchMock)).toHaveLength(2);
  });
});
