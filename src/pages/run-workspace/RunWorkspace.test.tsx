import { act, fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { openApp } from '@/test/app.tsx';
import { makeRun } from '@/test/fixtures.ts';
import { button } from '@/test/workspace.tsx';

type FetchMock = Awaited<ReturnType<typeof openApp>>;

const requests = (fetchMock: FetchMock, method: string, path: string) =>
  fetchMock.mock.calls.filter(([input, init]) => (init?.method ?? 'GET') === method && new URL(input).pathname === path).length;

const settle = async () => {
  for (let i = 0; i < 3; i++) await act(async () => {});
};

describe('RunWorkspace loading', () => {
  it('says a run does not exist, without retrying or polling for it', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    const fetchMock = await openApp('/runs/run-gone', { 'GET /runs/run-gone': () => ({ status: 404, body: { detail: 'run not found' } }) });
    await settle();
    await act(() => vi.advanceTimersByTimeAsync(15000));

    expect(screen.getByText('Run not found')).toBeTruthy();
    expect(requests(fetchMock, 'GET', '/runs/run-gone')).toBe(1);
  });
});

describe('RunWorkspace cancel', () => {
  it('cancels only on a second click, then shows the run cancelling', async () => {
    const fetchMock = await openApp('/runs/run-1', {
      'GET /runs/run-1': () => ({ body: makeRun('run-1', { status: 'running' }) }),
      'POST /runs/run-1/cancel': () => ({ status: 202, body: makeRun('run-1', { status: 'cancelling' }) }),
    });
    await settle();

    fireEvent.click(button('Cancel run'));
    await settle();
    expect(requests(fetchMock, 'POST', '/runs/run-1/cancel')).toBe(0);

    fireEvent.click(button('Confirm cancel'));
    await settle();
    expect(requests(fetchMock, 'POST', '/runs/run-1/cancel')).toBe(1);
    expect(button('Cancelling…')).toHaveProperty('disabled', true);
  });

  it('forgets a first click after a few seconds', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    await openApp('/runs/run-1', { 'GET /runs/run-1': () => ({ body: makeRun('run-1', { status: 'queued' }) }) });
    await settle();

    fireEvent.click(button('Cancel run'));
    await act(() => vi.advanceTimersByTimeAsync(4000));

    expect(button('Cancel run')).toBeTruthy();
  });
});
