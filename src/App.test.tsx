import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { mockBackend } from './test/backend.ts';
import { makeRun, PRESETS } from './test/fixtures.ts';

// App sends / to the runs list as it loads, so each test imports a fresh copy after setting the address.
async function openApp(path: string) {
  window.history.replaceState(null, '', path);
  mockBackend({
    'GET /health': () => ({ body: { status: 'ok', version: '0.2.0', ready: true } }),
    'GET /runs': () => ({ body: { runs: [makeRun('run-1')], next_cursor: null } }),
    'GET /presets': () => ({ body: PRESETS }),
  });
  vi.resetModules();
  const { default: App } = await import('./App.tsx');
  render(<App />);
  await act(async () => {});
}

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
});
