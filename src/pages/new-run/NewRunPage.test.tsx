import { act, fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { bodyOf, mockBackend } from '@/test/backend.ts';
import { makeRun, PRESETS } from '@/test/fixtures.ts';
import { renderWithQuery } from '@/test/query.tsx';
import type { Presets } from '@/types.ts';

import NewRunPage from './NewRunPage.tsx';

type CreateReply = { status: number; body: unknown };

// Renders the page on fake timers, so the start button's delays can be stepped through.
async function renderPage({
  presets = PRESETS,
  create = [{ status: 201, body: makeRun('run-new') }],
}: { presets?: Presets; create?: CreateReply[] } = {}) {
  vi.useFakeTimers();
  const replies = [...create];
  const fetchMock = mockBackend({
    'GET /presets': () => ({ body: presets }),
    'POST /runs': () => replies.shift() ?? { status: 500, body: { detail: 'no more replies' } },
  });
  renderWithQuery(<NewRunPage />);
  await act(() => vi.advanceTimersByTimeAsync(0));
  return fetchMock;
}

// Role and label queries take about a second each on this page, which has a button per calendar day, so controls
// are found by their visible text, their <label> or their aria-label directly.
const button = (text: string) => screen.getByText(text).closest('button')!;
function control(label: string) {
  const element =
    [...document.querySelectorAll('label')].find((each) => each.textContent === label)?.control ?? document.querySelector(`[aria-label="${label}"]`);
  if (!element) throw new Error(`No control labelled ${label}`);
  return element as HTMLInputElement;
}
const migrationToggle = (value: 'On' | 'Off') => within(control('Migration')).getByText(value);
// Looked up once per test, since the same button carries every phase.
const findStart = () => button('Start Run');

const wait = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));
const runRequests = (fetchMock: Awaited<ReturnType<typeof renderPage>>) => fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST');
const summary = (label: string) =>
  [...document.querySelectorAll('.new-run-summary dt')].find((dt) => dt.textContent === label)?.nextElementSibling?.textContent;

describe('NewRunPage start', () => {
  it("sends the first preset's settings with every clustering stage, then opens the new run's page", async () => {
    const fetchMock = await renderPage();
    const start = findStart();

    fireEvent.click(start);
    await wait(220);

    const requests = runRequests(fetchMock);
    expect(requests).toHaveLength(1);
    const body = bodyOf(requests[0]!) as Record<string, unknown>;
    expect(body).toMatchObject({ preset: 'DE_Rastrigin', stream: true, run_settings: PRESETS.presets[0]!.defaults });
    expect(body.clustering).toMatchObject({ lsh: true, birch: true, denstream: true, detail: 1 });
    expect(body.run_name).toEqual(expect.any(String));

    expect(start.textContent).toBe('Run started');
    expect(start.disabled).toBe(true);
    await wait(600);
    // The run streams, so it opens on its live network.
    expect(window.location.pathname).toBe('/runs/run-new/network');
  });

  it('starts only one run when the button is clicked twice', async () => {
    const fetchMock = await renderPage();
    const start = findStart();

    fireEvent.click(start);
    fireEvent.click(start);
    await wait(2000);

    expect(runRequests(fetchMock)).toHaveLength(1);
  });

  it("shows the backend's reason when a run cannot start, and lets it be tried again", async () => {
    const fetchMock = await renderPage({
      create: [
        { status: 502, body: { detail: 'runner unreachable' } },
        { status: 201, body: makeRun('run-retry') },
      ],
    });
    const start = findStart();

    fireEvent.click(start);
    await wait(400);
    expect(start.textContent).toBe('Couldn’t start');
    expect(screen.getByText('runner unreachable')).toBeTruthy();

    await wait(1600);
    expect(start.disabled).toBe(false);
    fireEvent.click(start);
    await wait(400);

    expect(runRequests(fetchMock)).toHaveLength(2);
    expect(start.textContent).toBe('Run started');
    expect(screen.queryByText('runner unreachable')).toBeNull();
  });

  it('cannot start while a field is invalid', async () => {
    const fetchMock = await renderPage();
    const start = findStart();

    fireEvent.change(control('Runner seed'), { target: { value: '-1' } });
    fireEvent.click(start);
    await wait(400);

    expect(start.disabled).toBe(true);
    expect(screen.getByText('Fix the highlighted field to start.')).toBeTruthy();
    expect(runRequests(fetchMock)).toHaveLength(0);
  });
});

describe('NewRunPage request', () => {
  // Guards the wiring from every control to the request, which a renamed key or swapped setter would break silently.
  it('carries an edit from every section', async () => {
    const fetchMock = await renderPage();
    const start = findStart();

    fireEvent.click(button('TSP Berlin52'));
    fireEvent.click(control('Fewer islands'));
    fireEvent.change(control('Evaluation budget'), { target: { value: '80000' } });
    fireEvent.change(control('Target generations'), { target: { value: '150' } });
    fireEvent.change(control('Runner seed'), { target: { value: '42' } });
    fireEvent.click(button('Star'));
    fireEvent.change(control('Generations between migrations'), { target: { value: '15' } });
    fireEvent.change(control('Migrants per route'), { target: { value: '3' } });
    fireEvent.click(button('Tracks density over time and fades stale regions.'));
    fireEvent.change(control('LSH hashes'), { target: { value: '8' } });
    fireEvent.change(control('Detail'), { target: { value: '1.5' } });
    fireEvent.click(button('Final result only'));
    fireEvent.change(control('Run name'), { target: { value: 'my-run' } });

    fireEvent.click(start);
    await wait(400);

    const body = bodyOf(runRequests(fetchMock)[0]!) as { clustering: Record<string, unknown> };
    expect(body).toMatchObject({
      run_name: 'my-run',
      preset: 'GA_TSP_Berlin52',
      stream: false,
      run_settings: {
        num_islands: 5,
        evaluation_budget: 80000,
        target_generations: 150,
        seed: 42,
        'migration.enabled': true,
        'migration.topology': 'star',
        'migration.interval': 15,
        'migration.num_migrants': 3,
      },
      clustering: { lsh: true, birch: true, denstream: false, detail: 1.5, lsh_hashes: 8 },
    });
    expect(body.clustering).not.toHaveProperty('denstream_mu');
  });
});

describe('NewRunPage form', () => {
  it("replaces every edited setting with the picked preset's defaults", async () => {
    await renderPage();
    fireEvent.change(control('Evaluation budget'), { target: { value: '12345' } });

    fireEvent.click(button('Knapsack'));

    expect(control('Evaluation budget').value).toBe('50000');
    expect(control('Runner seed').value).toBe('7');
    expect(migrationToggle('Off').getAttribute('aria-checked')).toBe('true');
    expect(summary('Preset')).toBe('GA_Knapsack');

    fireEvent.click(button('Rastrigin'));
    expect(control('Runner seed').value).toBe('');
  });

  it('keeps the run name, clustering and mode when the preset changes', async () => {
    await renderPage();
    fireEvent.change(control('Run name'), { target: { value: 'kept-name' } });
    fireEvent.click(button('Tracks density over time and fades stale regions.'));
    fireEvent.click(button('Final result only'));

    fireEvent.click(button('Knapsack'));

    expect(control('Run name').value).toBe('kept-name');
    expect(summary('Clustering')).toBe('LSH → BIRCH');
    expect(summary('Mode')).toBe('Final only');
  });

  it('sums up the settings that will be sent', async () => {
    await renderPage();

    expect([summary('Preset'), summary('Islands'), summary('Budget'), summary('Generations')]).toEqual(['DE_Rastrigin', '5', '100,000', '200']);
    expect([summary('Migration'), summary('Schedule'), summary('Clustering'), summary('Mode')]).toEqual([
      'Ring',
      '5 every 20 gens',
      'LSH → BIRCH → DenStream',
      'Live',
    ]);

    fireEvent.change(control('Evaluation budget'), { target: { value: 'lots' } });
    expect(summary('Budget')).toBe('—');
  });

  it("steps the islands only within the runner's range", async () => {
    await renderPage();
    const [fewer, more] = [control('Fewer islands'), control('More islands')];

    fireEvent.click(more);
    expect(summary('Islands')).toBe('6');
    expect(more.disabled).toBe(true);

    fireEvent.click(fewer);
    fireEvent.click(fewer);
    expect(summary('Islands')).toBe('4');
    expect(fewer.disabled).toBe(true);
  });

  it('cannot start with every clustering stage off', async () => {
    await renderPage();
    const start = findStart();

    for (const stage of [
      'Hashes genomes into buckets of near-duplicates. Fast first pass.',
      'Builds compact sub-clusters inside each bucket.',
      'Tracks density over time and fades stale regions.',
    ])
      fireEvent.click(button(stage));

    expect(screen.getByText('Enable at least one stage.')).toBeTruthy();
    expect(start.disabled).toBe(true);
  });

  it('turns migration off for the whole section, the summary and the request', async () => {
    const fetchMock = await renderPage();
    const start = findStart();

    fireEvent.click(migrationToggle('Off'));

    expect((document.querySelector('fieldset.migration-fieldset') as HTMLFieldSetElement).disabled).toBe(true);
    expect(summary('Migration')).toBe('—');
    expect(summary('Schedule')).toBeUndefined();

    fireEvent.click(start);
    await wait(400);
    expect((bodyOf(runRequests(fetchMock)[0]!) as { run_settings: Record<string, unknown> }).run_settings['migration.enabled']).toBe(false);
  });

  it('only allows a torus once the islands make one', async () => {
    await renderPage();
    const start = findStart();

    fireEvent.click(button('Torus'));
    expect(screen.getByText('A torus needs 6 islands.')).toBeTruthy();
    expect(start.disabled).toBe(true);

    fireEvent.click(control('More islands'));
    expect(screen.queryByText('A torus needs 6 islands.')).toBeNull();
    expect(start.disabled).toBe(false);
  });

  it("offers quick picks and rolls seeds only within the runner's limits", async () => {
    const overrides = {
      ...PRESETS.overrides,
      target_generations: { type: 'int' as const, min: 60, max: 300 },
      seed: { type: 'int' as const, min: 0, max: 999 },
    };
    await renderPage({ presets: { ...PRESETS, overrides } });

    const quickPicks = [...control('Target generations').parentElement!.querySelectorAll('.search-setting-quick-picks button')].map(
      (each) => each.textContent
    );
    expect(quickPicks).toEqual(['100', '200']);

    vi.spyOn(Math, 'random').mockReturnValue(0.99999);
    fireEvent.click(button('Roll one'));
    expect(control('Runner seed').value).toBe('999');
  });

  it('keeps the stepped interval between 1 and the target generations', async () => {
    await renderPage();
    const interval = control('Generations between migrations');

    fireEvent.change(interval, { target: { value: '195' } });
    fireEvent.keyDown(interval, { key: 'ArrowUp', shiftKey: true });
    expect(interval.value).toBe('200');
    fireEvent.keyDown(interval, { key: 'ArrowUp' });
    expect(interval.value).toBe('200');

    fireEvent.change(interval, { target: { value: '1' } });
    fireEvent.keyDown(interval, { key: 'ArrowDown' });
    expect(interval.value).toBe('1');
  });

  it('sets the stagnation limit along the target run, and sends 0 for Off', async () => {
    const fetchMock = await renderPage();
    const plot = document.querySelector<HTMLElement>('[role="slider"]')!;
    const limit = control('Stagnation limit');
    Object.assign(plot, { setPointerCapture: vi.fn(), hasPointerCapture: () => true });
    vi.spyOn(plot, 'getBoundingClientRect').mockReturnValue(DOMRect.fromRect({ x: 0, width: 400 }));

    // A quarter of the way along DE_Rastrigin's 200 target generations.
    fireEvent.pointerDown(plot, { clientX: 100, pointerId: 1 });
    expect(limit.value).toBe('50');
    fireEvent.keyDown(plot, { key: 'ArrowRight', shiftKey: true });
    expect(limit.value).toBe('60');
    fireEvent.pointerMove(plot, { clientX: 900, pointerId: 1 });
    expect(limit.value).toBe('200');
    fireEvent.change(limit, { target: { value: '201' } });
    expect(limit.closest('.search-stagnation')!.textContent).toContain('Must not exceed target generations');

    fireEvent.click(within(limit.closest('.search-stagnation')!).getByText('Off'));
    expect(limit.value).toBe('Off');
    expect(summary('Stagnation')).toBe('—');
    fireEvent.click(findStart());
    await wait(400);
    expect((bodyOf(runRequests(fetchMock)[0]!) as { run_settings: Record<string, unknown> }).run_settings['termination.stagnation_generations']).toBe(
      0
    );
  });

  it("keeps the migrants below the island's population, whether stepped or typed", async () => {
    await renderPage();
    const start = findStart();
    const migrants = control('Migrants per route');

    // The first preset's islands hold 100 each.
    fireEvent.change(migrants, { target: { value: '98' } });
    fireEvent.keyDown(migrants, { key: 'ArrowUp', shiftKey: true });
    expect(migrants.value).toBe('99');

    fireEvent.change(migrants, { target: { value: '100' } });
    expect(screen.getByText("Must be below the island's population of 100")).toBeTruthy();
    expect(start.disabled).toBe(true);
  });

  it('groups generations into squares on a long run, each standing for its last generation', async () => {
    await renderPage();

    fireEvent.change(control('Target generations'), { target: { value: '1000' } });

    expect(screen.getByText(/each square is 4 generations/)).toBeTruthy();
    expect(document.querySelector('[aria-label="Generation 39"]')).toBeNull();
    fireEvent.click(control('Generation 40'));
    expect(control('Generations between migrations').value).toBe('40');
  });

  it("sets the interval from a calendar day and counts the run's migrations", async () => {
    await renderPage();

    fireEvent.click(control('Generation 40'));

    const interval = control('Generations between migrations');
    expect(interval.value).toBe('40');
    expect(interval.closest('.migration-control-header')!.textContent).toContain('5 migration events');
  });

  it('previews a hovered calendar day in the readout, and goes back to the chosen interval on leaving', async () => {
    await renderPage();
    fireEvent.click(control('Generation 40'));
    const interval = control('Generations between migrations');

    fireEvent.pointerEnter(control('Generation 25'));
    expect(interval.value).toBe('25');
    expect(interval.closest('.migration-control-header')!.textContent).toContain('8 migration events');

    fireEvent.pointerLeave(control('Interval'));
    expect(interval.value).toBe('40');
    expect(interval.closest('.migration-control-header')!.textContent).toContain('5 migration events');
  });
});

describe('NewRunPage unknown presets', () => {
  // The runner can add presets, algorithms, benchmarks and topologies the dashboard has no drawings or names for.
  it('lists and starts what it has never seen, under the names the runner gives', async () => {
    const preset = {
      preset: 'CMAES_Rosenbrock',
      algorithm: 'cmaes',
      benchmark: 'rosenbrock',
      description: 'CMA-ES on Rosenbrock.',
      defaults: { ...PRESETS.presets[0]!.defaults, 'migration.topology': 'small_world' },
    };
    const topology = { type: 'choice' as const, choices: ['ring', 'small_world'] };
    const fetchMock = await renderPage({ presets: { overrides: { ...PRESETS.overrides, 'migration.topology': topology }, presets: [preset] } });
    const start = findStart();

    expect(button('Rosenbrock').textContent).toContain('CMAES');
    expect(within(control('Migration topology')).getByText('small_world').getAttribute('aria-checked')).toBe('true');

    fireEvent.click(start);
    await wait(400);
    expect(bodyOf(runRequests(fetchMock)[0]!)).toMatchObject({ preset: 'CMAES_Rosenbrock', run_settings: { 'migration.topology': 'small_world' } });
  });
});

describe('NewRunPage detail preview', () => {
  // The coarse end once drew clusters far outside the preview's box.
  it('draws every cluster inside the box at any detail', async () => {
    await renderPage();
    const slider = control('Detail');

    for (const detail of ['0.5', '0.8', '1', '1.5', '2']) {
      fireEvent.change(slider, { target: { value: detail } });
      for (const ellipse of document.querySelectorAll('.detail-preview ellipse')) {
        const [cx, cy, rx, ry] = ['cx', 'cy', 'rx', 'ry'].map((name) => Number(ellipse.getAttribute(name)));
        expect(cx! - rx!, `detail ${detail}`).toBeGreaterThanOrEqual(0);
        expect(cx! + rx!, `detail ${detail}`).toBeLessThanOrEqual(280);
        expect(cy! - ry!, `detail ${detail}`).toBeGreaterThanOrEqual(0);
        expect(cy! + ry!, `detail ${detail}`).toBeLessThanOrEqual(84);
      }
    }
  });
});

describe('NewRunPage loading', () => {
  it('retries presets once, then says the backend is unavailable', async () => {
    vi.useFakeTimers();
    const fetchMock = mockBackend({ 'GET /presets': () => ({ status: 500 }) });
    renderWithQuery(<NewRunPage />);
    await wait(0);
    expect(screen.queryByText('Currently Unavailable')).toBeNull();

    await wait(1000);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screen.getByText('Currently Unavailable')).toBeTruthy();
  });

  it('says so when the runner has no presets', async () => {
    await renderPage({ presets: { ...PRESETS, presets: [] } });

    expect(screen.getByText('The runner has no presets to start from.')).toBeTruthy();
  });
});
