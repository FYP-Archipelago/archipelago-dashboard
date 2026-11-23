import { act, fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { openApp } from '@/test/app.tsx';
import { bodyOf } from '@/test/backend.ts';
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
    expect(screen.queryByText('Re-run with same settings')).toBeNull();
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

const chooseAction = async (name: string) => {
  fireEvent.click(button('Run actions'));
  await settle();
  fireEvent.click(button(name));
  await settle();
};

describe('RunWorkspace re-run', () => {
  it.each(['done', 'failed', 'cancelled'] as const)('offers to re-run a %s run', async (status) => {
    await openApp('/runs/run-1', {
      'GET /runs/run-1': () => ({ body: makeRun('run-1', { status }) }),
      'GET /runs/run-1/result': () => ({ body: makeResult() }),
    });
    await settle();

    expect(screen.queryByText('Cancel run')).toBeNull();
    await chooseAction('Re-run with same settings');
    expect(window.location.pathname + window.location.search).toBe('/runs/new?from=run-1');
  });

  it('opens an editable form with the saved settings and sends them when Start Run is clicked', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    const original = makeRun('run-1');
    const run = makeRun('run-1', {
      status: 'failed',
      stream: false,
      run_settings: {
        ...original.run_settings,
        num_islands: 4,
        evaluation_budget: 80000,
        'migration.enabled': false,
        'migration.topology': 'star',
        seed: 42,
      },
      clustering: { ...original.clustering, lsh: false, detail: 1.5, denstream_epsilon: 0.25, seed: 9 },
    });
    const fetchMock = await openApp('/runs/run-1', {
      'GET /runs/run-1': () => ({ body: run }),
      'POST /runs': () => ({ status: 202, body: makeRun('run-new') }),
    });
    await settle();

    await chooseAction('Re-run with same settings');
    await settle();

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('New Run');
    expect(screen.getByText('TSP Berlin52').closest('button')?.getAttribute('aria-checked')).toBe('true');
    expect(requests(fetchMock, 'POST', '/runs')).toBe(0);
    const name = document.querySelector<HTMLInputElement>('#run-name')!;
    expect(name.value).not.toBe(run.run_name);
    fireEvent.change(name, { target: { value: 're-run' } });
    fireEvent.click(button('Start Run'));
    await act(() => vi.advanceTimersByTimeAsync(400));

    const post = fetchMock.mock.calls.find(([input, init]) => init?.method === 'POST' && new URL(input).pathname === '/runs');
    expect(post).toBeDefined();
    expect(bodyOf(post!)).toMatchObject({
      run_name: 're-run',
      preset: run.preset,
      stream: run.stream,
      run_settings: run.run_settings,
      clustering: { lsh: false, birch: true, denstream: true, detail: 1.5, denstream_epsilon: 0.25, birch_threshold: null, seed: 9 },
    });

    fireEvent.click(link('New Run'));
    expect(window.location.search).toBe('');
    expect(screen.getByText('Rastrigin').closest('button')?.getAttribute('aria-checked')).toBe('true');
  });
});

describe('RunWorkspace rename', () => {
  it('saves a typed name on Enter and shows it everywhere, and Escape keeps the old one', async () => {
    const fetchMock = await openApp('/runs/run-1', {
      'GET /runs/run-1': () => ({ body: makeRun('run-1') }),
      'GET /runs/run-1/result': () => ({ body: makeResult() }),
      'PATCH /runs/run-1': (_, init) => ({ body: makeRun('run-1', { run_name: (bodyOf([null, init]) as { run_name: string }).run_name }) }),
    });
    await settle();

    fireEvent.click(button('name-run-1'));
    const field = screen.getByLabelText<HTMLInputElement>('Run name');
    fireEvent.change(field, { target: { value: 'kept' } });
    fireEvent.keyDown(field, { key: 'Escape' });
    await settle();
    expect(requests(fetchMock, 'PATCH', '/runs/run-1')).toBe(0);
    expect(document.querySelector('h1')!.textContent).toBe('name-run-1');

    fireEvent.click(button('name-run-1'));
    fireEvent.change(screen.getByLabelText('Run name'), { target: { value: '  renamed  ' } });
    fireEvent.keyDown(screen.getByLabelText('Run name'), { key: 'Enter' });
    await settle();

    expect(bodyOf(fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH')!)).toEqual({ run_name: 'renamed' });
    expect(document.querySelector('h1')!.textContent).toBe('renamed');
    expect(document.querySelector('.recent-item strong')!.textContent).toBe('renamed');
  });
});

describe('RunWorkspace delete', () => {
  it('deletes the open run, leaves for the runs list and forgets the cached run', async () => {
    let deleted = false;
    const fetchMock = await openApp('/runs/run-1', {
      'GET /runs': () => ({ body: { runs: deleted ? [] : [makeRun('run-1')], next_cursor: null } }),
      'GET /runs/run-1': () => (deleted ? { status: 404, body: { detail: 'run not found' } } : { body: makeRun('run-1') }),
      'GET /runs/run-1/result': () => ({ body: makeResult() }),
      'DELETE /runs/run-1': () => {
        deleted = true;
        return { status: 204 };
      },
    });
    await settle();

    await chooseAction('Delete run');
    fireEvent.click(button('Delete run'));
    await settle();

    expect(requests(fetchMock, 'DELETE', '/runs/run-1')).toBe(1);
    expect(window.location.pathname).toBe('/runs');
    expect(document.querySelector('.recent-item')).toBeNull();

    // A finished run is never refetched, so a cached copy would still show here.
    window.history.pushState(null, '', '/runs/run-1');
    act(() => void window.dispatchEvent(new PopStateEvent('popstate')));
    await settle();
    expect(screen.getByText('Run not found')).toBeTruthy();
  });

  it('keeps the run and shows why when the backend refuses', async () => {
    await openApp('/runs/run-1', {
      'GET /runs/run-1': () => ({ body: makeRun('run-1') }),
      'GET /runs/run-1/result': () => ({ body: makeResult() }),
      'DELETE /runs/run-1': () => ({ status: 409, body: { detail: 'run cleanup is still in progress' } }),
    });
    await settle();

    await chooseAction('Delete run');
    fireEvent.click(button('Delete run'));
    await settle();

    expect(screen.getByText('run cleanup is still in progress')).toBeTruthy();
    expect(window.location.pathname).toBe('/runs/run-1');
  });
});
