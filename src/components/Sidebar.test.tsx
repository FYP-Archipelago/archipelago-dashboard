import { act, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { mockBackend } from '@/test/backend.ts';
import { makeRun } from '@/test/fixtures.ts';
import { renderWithQuery } from '@/test/query.tsx';

import Sidebar from './Sidebar.tsx';

type Health = { status?: number; body?: unknown } | 'unreachable';

async function renderWith(health: Health, runs = [makeRun('run-1')]) {
  mockBackend({
    'GET /health': () => {
      if (health === 'unreachable') throw new TypeError('Failed to fetch');
      return health;
    },
    'GET /runs': () => ({ body: { runs, next_cursor: null } }),
  });
  renderWithQuery(<Sidebar route={{ name: 'runs' }} />);
  await act(async () => {});
}

const statusLine = () => document.querySelector('.backend-line')!.textContent;

describe('Sidebar backend status', () => {
  it('is all go, with the version, when every part is ready', async () => {
    await renderWith({ body: { status: 'ok', version: '0.2.0', ready: true } });

    expect(statusLine()).toBe('All Systems Go' + 'v0.2.0');
  });

  it('says the runner is disconnected when only the runner is missing', async () => {
    await renderWith({ body: { status: 'ok', version: '0.2.0', ready: false } });

    expect(statusLine()).toContain('Runner disconnected');
  });

  // The backend answers 503 when Postgres or Redis is down; it cannot serve runs then either.
  it('is unavailable when the backend reports itself degraded', async () => {
    await renderWith({ status: 503, body: { status: 'unavailable', version: '0.2.0', ready: false } });

    expect(statusLine()).toContain('Unavailable');
  });

  it('is unavailable, without a version, when the backend cannot be reached', async () => {
    await renderWith('unreachable');

    expect(statusLine()).toBe('Unavailable');
  });

  it('updates backend status every 60 s, including after an earlier success', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    let health = { body: { status: 'ok', version: '0.2.0', ready: true } };
    let reachable = true;
    mockBackend({
      'GET /health': () => (reachable ? health : { status: 500 }),
      'GET /runs': () => ({ body: { runs: [], next_cursor: null } }),
    });
    renderWithQuery(<Sidebar route={{ name: 'runs' }} />);
    await act(async () => {});
    expect(statusLine()).toContain('All Systems Go');

    health = { body: { ...health.body, ready: false } };
    await act(() => vi.advanceTimersByTimeAsync(60000));
    expect(statusLine()).toContain('Runner disconnected');

    reachable = false;
    await act(() => vi.advanceTimersByTimeAsync(60000));
    expect(statusLine()).toBe('Unavailable');
  });
});

describe('Sidebar recent runs', () => {
  // jsdom lays nothing out, so the list's and a row's heights are given here.
  it('shows only as many of the newest runs as fit whole in the list', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function (this: HTMLElement) {
      return this.tagName === 'NAV' ? 300 : 0;
    });
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) {
      return this.tagName === 'A' ? 46 : 0;
    });
    const runs = Array.from({ length: 15 }, (_, i) => makeRun(`run-${i}`));
    await renderWith({ body: { status: 'ok', version: '0.2.0', ready: true } }, runs);

    // 300 px holds six 46 px rows; a seventh would be cut off.
    const links = screen.getByRole('navigation', { name: 'Recent runs' }).querySelectorAll('a');
    expect(links).toHaveLength(6);
    expect(links[0]!.getAttribute('href')).toBe('/runs/run-0');
  });
});
