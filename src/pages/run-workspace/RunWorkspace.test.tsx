import { act, fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { openApp } from '@/test/app.tsx';
import { makeResult, makeRun } from '@/test/fixtures.ts';
import { button, link } from '@/test/workspace.tsx';

type FetchMock = Awaited<ReturnType<typeof openApp>>;

const requests = (fetchMock: FetchMock, method: string, path: string) =>
  fetchMock.mock.calls.filter(([input, init]) => (init?.method ?? 'GET') === method && new URL(input).pathname === path).length;

const settle = async () => {
  for (let i = 0; i < 3; i++) await act(async () => {});
};

const openFromList = async (fetchMock: FetchMock) => {
  fireEvent.click(screen.getByText('name-run-1', { selector: '.run-cell a' }));
  await settle();
  return fetchMock;
};

describe('RunWorkspace loading', () => {
  it('opens a finished run from the runs list without asking for it again, and loads its result once for every tab', async () => {
    const fetchMock = await openFromList(await openApp('/runs', { 'GET /runs/run-1/result': () => ({ body: makeResult() }) }));

    expect(window.location.pathname).toBe('/runs/run-1');
    expect(requests(fetchMock, 'GET', '/runs/run-1')).toBe(0);
    expect(document.querySelector('h1')!.textContent).toBe('name-run-1');

    fireEvent.click(link('Details'));
    await settle();
    fireEvent.click(link('Convergence'));
    await settle();

    expect(requests(fetchMock, 'GET', '/runs/run-1/result')).toBe(1);
    expect(screen.getByText('Run best')).toBeTruthy();
  });

  it('asks again for a run the list showed as unfinished, since it may have finished since', async () => {
    const fetchMock = await openFromList(
      await openApp('/runs', {
        'GET /runs': () => ({ body: { runs: [makeRun('run-1', { status: 'running' })], next_cursor: null } }),
        'GET /runs/run-1': () => ({ body: makeRun('run-1') }),
        'GET /runs/run-1/result': () => ({ body: makeResult() }),
      })
    );

    expect(requests(fetchMock, 'GET', '/runs/run-1')).toBe(1);
    expect(requests(fetchMock, 'GET', '/runs/run-1/result')).toBe(1);
  });

  it('polls a run opened by its URL until it finishes, and only then asks for the result', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    let status: 'running' | 'done' = 'running';
    const fetchMock = await openApp('/runs/run-1/convergence', {
      'GET /runs/run-1': () => ({ body: makeRun('run-1', { status }) }),
      'GET /runs/run-1/result': () => ({ body: makeResult() }),
    });
    await settle();

    expect(screen.getByText('The run is in progress')).toBeTruthy();
    expect(requests(fetchMock, 'GET', '/runs/run-1/result')).toBe(0);

    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(requests(fetchMock, 'GET', '/runs/run-1')).toBe(2);

    status = 'done';
    await act(() => vi.advanceTimersByTimeAsync(5000));
    await settle();
    expect(requests(fetchMock, 'GET', '/runs/run-1/result')).toBe(1);
    expect(screen.getByText('Run best')).toBeTruthy();

    await act(() => vi.advanceTimersByTimeAsync(15000));
    expect(requests(fetchMock, 'GET', '/runs/run-1')).toBe(3);
  });

  it('says a run does not exist, without retrying or polling for it', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    const fetchMock = await openApp('/runs/run-gone', { 'GET /runs/run-gone': () => ({ status: 404, body: { detail: 'run not found' } }) });
    await settle();
    await act(() => vi.advanceTimersByTimeAsync(15000));

    expect(screen.getByText('Run not found')).toBeTruthy();
    expect(requests(fetchMock, 'GET', '/runs/run-gone')).toBe(1);
  });

  it('shows why a failed run has no result, without asking for one', async () => {
    const fetchMock = await openApp('/runs/run-1/convergence', {
      'GET /runs/run-1': () => ({
        body: makeRun('run-1', { status: 'failed', error: { phase: 'runner', message: 'island 2 lost its connection' } }),
      }),
    });
    await settle();

    expect(screen.getByText('The run failed in the runner')).toBeTruthy();
    expect(screen.getByText('island 2 lost its connection')).toBeTruthy();
    expect(screen.getByText('The run failed')).toBeTruthy();
    expect(requests(fetchMock, 'GET', '/runs/run-1/result')).toBe(0);
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
