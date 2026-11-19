import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { mockBackend } from '@/test/backend.ts';
import { makeRun } from '@/test/fixtures.ts';

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
  render(<Sidebar route={{ name: 'runs' }} />);
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
});

describe('Sidebar recent runs', () => {
  it('lists only the 12 newest runs, each linking to its page', async () => {
    const runs = Array.from({ length: 15 }, (_, i) => makeRun(`run-${i}`));
    await renderWith({ body: { status: 'ok', version: '0.2.0', ready: true } }, runs);

    const links = screen.getByRole('navigation', { name: 'Recent runs' }).querySelectorAll('a');
    expect(links).toHaveLength(12);
    expect(links[0]!.getAttribute('href')).toBe('/runs/run-0');
  });
});
