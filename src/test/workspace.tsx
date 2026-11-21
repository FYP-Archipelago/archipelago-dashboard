import { act } from '@testing-library/react';

import RunWorkspace from '@/pages/run-workspace/RunWorkspace.tsx';
import type { RunTab } from '@/route.ts';
import type { Run, RunResult } from '@/types.ts';

import { mockBackend } from './backend.ts';
import { makeResult, makeRun, PRESETS } from './fixtures.ts';
import { renderWithQuery } from './query.tsx';

// Opens one tab of a done run's workspace, with its result answering /result.
export async function renderWorkspace(tab: RunTab, { run = makeRun('run-1'), result = makeResult() }: { run?: Run; result?: RunResult } = {}) {
  const fetchMock = mockBackend({
    [`GET /runs/${run.run_id}`]: () => ({ body: run }),
    [`GET /runs/${run.run_id}/result`]: () => ({ body: result }),
    'GET /presets': () => ({ body: PRESETS }),
  });
  renderWithQuery(<RunWorkspace id={run.run_id} tab={tab} />);
  // The run loads first, then its result.
  for (let i = 0; i < 3; i++) await act(async () => {});
  return fetchMock;
}

// Role queries walk the whole accessibility tree and cost up to a second each on a full page, so controls are found
// by their text or aria-label directly.
const named = (selector: string, name: string | RegExp) =>
  [...document.querySelectorAll<HTMLElement>(selector)].find((element) => {
    const label = element.getAttribute('aria-label') ?? element.textContent ?? '';
    return typeof name === 'string' ? label === name : name.test(label);
  });

const findButton = (name: string | RegExp) => named('button', name) as HTMLButtonElement | undefined;

export function button(name: string | RegExp): HTMLButtonElement {
  const found = findButton(name);
  if (!found) throw new Error(`No button named ${name}`);
  return found;
}

export function link(name: string): HTMLAnchorElement {
  const found = named('a', name);
  if (!found) throw new Error(`No link named ${name}`);
  return found as HTMLAnchorElement;
}
