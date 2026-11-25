import { act } from '@testing-library/react';
import { vi } from 'vitest';

import { mockBackend } from './backend.ts';
import { makeRun, PRESETS } from './fixtures.ts';
import { renderWithQuery } from './query.tsx';

// Opens the whole app at `path`, with a healthy backend listing one done run unless `routes` say otherwise.
// App sends / to the runs list as it loads, so each test imports a fresh copy after setting the address.
export async function openApp(path: string, routes?: Parameters<typeof mockBackend>[0]) {
  window.history.replaceState(null, '', path);
  const fetchMock = mockBackend({
    'GET /health': () => ({ body: { status: 'ok', version: '0.2.0', ready: true } }),
    'GET /runs': () => ({ body: { runs: [makeRun('run-1')], next_cursor: null } }),
    'GET /presets': () => ({ body: PRESETS }),
    ...routes,
  });
  vi.resetModules();
  const { default: App } = await import('@/App.tsx');
  renderWithQuery(<App />);
  await act(async () => {});
  return fetchMock;
}
