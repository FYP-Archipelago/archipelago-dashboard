import { act, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { openApp } from '@/test/app.tsx';

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
