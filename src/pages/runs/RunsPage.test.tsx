import { act, fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { mockBackend } from '@/test/backend.ts';
import { makeRun } from '@/test/fixtures.ts';
import { renderWithQuery } from '@/test/query.tsx';
import type { Run } from '@/types.ts';

import RunsPage from './RunsPage.tsx';

type Page = { runs: Run[]; next_cursor: string | null };

// Answers /runs by status filter and cursor; `pages` maps "status|cursor" (blank for none) to a page.
function serveRuns(pages: Record<string, Page | 'down'>) {
  return mockBackend({
    'GET /runs': (url) => {
      const page = pages[`${url.searchParams.get('status') ?? ''}|${url.searchParams.get('cursor') ?? ''}`];
      if (!page) throw new Error(`unexpected ${url.search}`);
      return page === 'down' ? { status: 500 } : { body: page };
    },
  });
}

const shownNames = () =>
  screen
    .queryAllByRole('row')
    .slice(1)
    .map((row) => within(row).queryByRole('link')?.textContent)
    .filter(Boolean);

const settle = () => act(async () => {});

describe('RunsPage', () => {
  it("splits the preset into algorithm and problem at the first underscore only, and opens a run's page on a row click", async () => {
    serveRuns({ '|': { runs: [makeRun('run-1', { preset: 'GA_TSP_Berlin52', run_name: 'grand-tan-pigeon' })], next_cursor: null } });
    renderWithQuery(<RunsPage />);
    await settle();

    const cells = within(screen.getAllByRole('row')[1]!).getAllByRole('cell');
    expect(cells.slice(2, 4).map((cell) => cell.textContent)).toEqual(['GA', 'TSP_Berlin52']);

    fireEvent.click(cells[4]!);
    expect(window.location.pathname).toBe('/runs/run-1');
  });

  it('shows how long each run took, counts a live one from its start, and a dash for runs without times', async () => {
    const now = Date.parse('2026-11-20T12:00:00Z');
    vi.spyOn(Date, 'now').mockReturnValue(now);
    const at = (seconds: number) => new Date(now + seconds * 1000).toISOString();
    serveRuns({
      '|': {
        runs: [
          makeRun('done', { started_at: at(-1000), finished_at: at(-748) }),
          makeRun('failed', { status: 'failed', started_at: at(-10), finished_at: at(-7) }),
          makeRun('running', { status: 'running', started_at: at(-65) }),
          makeRun('queued', { status: 'queued' }),
          makeRun('old', { status: 'done' }),
        ],
        next_cursor: null,
      },
    });
    renderWithQuery(<RunsPage />);
    await settle();

    const durations = screen
      .getAllByRole('row')
      .slice(1)
      .map((row) => within(row).getAllByRole('cell')[8]!.textContent);
    expect(durations).toEqual(['4m 12s', '3s', '1m 05s', '—', '—']);
    vi.restoreAllMocks();
  });

  it('asks the backend for the chosen status and shows only its answer', async () => {
    const fetchMock = serveRuns({
      '|': { runs: [makeRun('a'), makeRun('b')], next_cursor: null },
      'failed|': { runs: [makeRun('c', { status: 'failed' })], next_cursor: null },
    });
    renderWithQuery(<RunsPage />);
    await settle();

    fireEvent.click(screen.getByRole('button', { name: 'failed' }));
    await settle();

    expect(new URL(fetchMock.mock.calls.at(-1)![0]).searchParams.get('status')).toBe('failed');
    expect(shownNames()).toEqual(['name-c']);
  });

  it('loads further pages with the cursor, skipping runs the first page already shows', async () => {
    serveRuns({
      '|': { runs: [makeRun('a'), makeRun('b')], next_cursor: 'page-2' },
      // A new run pushed "b" from the first page onto the second while the list was open.
      '|page-2': { runs: [makeRun('b'), makeRun('c')], next_cursor: null },
    });
    renderWithQuery(<RunsPage />);
    await settle();

    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    await settle();

    expect(shownNames()).toEqual(['name-a', 'name-b', 'name-c']);
    expect(screen.getByText('3 runs loaded')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
  });

  it("drops the extra pages when the filter changes, so the previous filter's runs do not linger", async () => {
    let finishFilter!: (page: Page) => void;
    const filteredPage = new Promise<Page>((resolve) => (finishFilter = resolve));
    mockBackend({
      'GET /runs': async (url) => {
        if (url.searchParams.has('status')) return { body: await filteredPage };
        if (url.searchParams.has('cursor')) return { body: { runs: [makeRun('b')], next_cursor: null } };
        return { body: { runs: [makeRun('a')], next_cursor: 'page-2' } };
      },
    });
    renderWithQuery(<RunsPage />);
    await settle();
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    await settle();

    fireEvent.click(screen.getByRole('button', { name: 'done' }));
    expect(screen.getByText('Loading runs…')).toBeTruthy();
    expect(shownNames()).toEqual([]);

    await act(async () => finishFilter({ runs: [makeRun('d')], next_cursor: null }));

    expect(shownNames()).toEqual(['name-d']);
  });

  it('keeps the further pages through a refresh, and shows the refreshed statuses', async () => {
    vi.useFakeTimers();
    let head = { runs: [makeRun('a', { status: 'running' })], next_cursor: 'page-2' };
    mockBackend({
      'GET /runs': (url) => ({ body: url.searchParams.get('cursor') ? { runs: [makeRun('b')], next_cursor: null } : head }),
    });
    renderWithQuery(<RunsPage />);
    await act(() => vi.advanceTimersByTimeAsync(0));
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    await act(() => vi.advanceTimersByTimeAsync(0));

    head = { runs: [makeRun('a', { status: 'done' })], next_cursor: 'page-2' };
    await act(() => vi.advanceTimersByTimeAsync(10000));

    expect(shownNames()).toEqual(['name-a', 'name-b']);
    expect(screen.getAllByRole('row')[1]!.textContent).toContain('done');
  });

  it('keeps showing runs when a background poll fails', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    const pages: Record<string, Page | 'down'> = { '|': { runs: [makeRun('a')], next_cursor: null } };
    const fetchMock = serveRuns(pages);
    renderWithQuery(<RunsPage />);
    await settle();
    expect(shownNames()).toEqual(['name-a']);

    pages['|'] = 'down';
    await act(() => vi.advanceTimersByTimeAsync(10000));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(shownNames()).toEqual(['name-a']);
    expect(screen.queryByText('Currently Unavailable')).toBeNull();
  });

  it('refreshes loaded pages with fresh cursors so a run pushed off page one stays visible', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    const pages = {
      '|': { runs: [makeRun('a'), makeRun('b')], next_cursor: 'page-2' },
      '|page-2': { runs: [makeRun('c')], next_cursor: null },
      '|page-2b': { runs: [makeRun('b'), makeRun('c')], next_cursor: null },
    };
    serveRuns(pages);
    renderWithQuery(<RunsPage />);
    await settle();
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    await settle();
    expect(shownNames()).toEqual(['name-a', 'name-b', 'name-c']);

    pages['|'] = { runs: [makeRun('new'), makeRun('a')], next_cursor: 'page-2b' };
    await act(() => vi.advanceTimersByTimeAsync(10000));

    expect(shownNames()).toEqual(['name-new', 'name-a', 'name-b', 'name-c']);
  });

  it('focuses the search with Ctrl+K, as its hint says', async () => {
    serveRuns({ '|': { runs: [], next_cursor: null } });
    renderWithQuery(<RunsPage />);
    await settle();

    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });

    expect(document.activeElement).toBe(screen.getByPlaceholderText(/Search by Name/));
  });

  it('keeps the loaded runs and the Load more button when a further page fails', async () => {
    serveRuns({ '|': { runs: [makeRun('a')], next_cursor: 'page-2' }, '|page-2': 'down' });
    renderWithQuery(<RunsPage />);
    await settle();

    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    await settle();

    expect(shownNames()).toEqual(['name-a']);
    expect(screen.getByText('Currently Unavailable')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Load more' })).toBeTruthy();
  });

  it('searches loaded runs by name, id and preset, ignoring case', async () => {
    serveRuns({
      '|': {
        runs: [
          makeRun('run-1', { run_name: 'brave-blue-otter', preset: 'DE_Rastrigin' }),
          makeRun('run-2', { run_name: 'calm-red-fox', preset: 'GA_Knapsack' }),
        ],
        next_cursor: null,
      },
    });
    renderWithQuery(<RunsPage />);
    await settle();
    const search = screen.getByPlaceholderText(/Search by Name/);

    fireEvent.change(search, { target: { value: 'OTTER' } });
    expect(shownNames()).toEqual(['brave-blue-otter']);
    fireEvent.change(search, { target: { value: 'run-2' } });
    expect(shownNames()).toEqual(['calm-red-fox']);
    fireEvent.change(search, { target: { value: 'knapsack' } });
    expect(shownNames()).toEqual(['calm-red-fox']);
    fireEvent.change(search, { target: { value: 'nothing' } });
    expect(screen.getByText('No runs match these filters.')).toBeTruthy();
  });

  it('says so when the backend is down', async () => {
    serveRuns({ '|': 'down' });
    renderWithQuery(<RunsPage />);
    await settle();

    expect(screen.getByText('Currently Unavailable')).toBeTruthy();
  });
});
