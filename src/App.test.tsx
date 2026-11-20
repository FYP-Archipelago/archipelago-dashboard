import { act, fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { openApp } from './test/app.tsx';
import { makeRun } from './test/fixtures.ts';

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

  it('polls only the first page of All once the runs page is left, even after Load more', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    const fetchMock = await openApp('/runs', {
      'GET /runs': (url) => ({
        body: url.searchParams.has('cursor') ? { runs: [makeRun('run-2')], next_cursor: null } : { runs: [makeRun('run-1')], next_cursor: 'page-2' },
      }),
    });
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    await act(async () => {});

    fireEvent.click(screen.getByText('New Run').closest('a')!);
    await act(async () => {});
    const before = allRunsRequests(fetchMock).length;
    await act(() => vi.advanceTimersByTimeAsync(10000));

    const cursors = allRunsRequests(fetchMock)
      .slice(before)
      .map(([input]) => new URL(input).searchParams.get('cursor'));
    expect(cursors).toEqual([null]);
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
