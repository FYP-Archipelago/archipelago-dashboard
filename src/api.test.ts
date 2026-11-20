import { describe, expect, it, vi } from 'vitest';

import { api } from './api.ts';
import { bodyOf, mockBackend } from '@/test/backend.ts';
import { makeRun } from '@/test/fixtures.ts';

describe('api', () => {
  it("shows FastAPI's message for an HTTPException", async () => {
    mockBackend({ 'POST /runs': () => ({ status: 502, body: { detail: 'runner unreachable' } }) });

    await expect(api.createRun({} as never)).rejects.toThrow('runner unreachable');
  });

  it("joins FastAPI's validation messages", async () => {
    mockBackend({ 'POST /runs': () => ({ status: 422, body: { detail: [{ msg: 'too small' }, { msg: 'not a string' }] } }) });

    await expect(api.createRun({} as never)).rejects.toThrow('too small; not a string');
  });

  it('falls back to the status code when the error has no detail', async () => {
    mockBackend({ 'GET /runs': () => ({ status: 500 }) });

    await expect(api.listRuns({})).rejects.toThrow('HTTP 500');
  });

  it('says the backend is unreachable when the request never gets an answer', async () => {
    mockBackend({
      'GET /runs': () => {
        throw new TypeError('Failed to fetch');
      },
    });

    await expect(api.listRuns({})).rejects.toThrow('Cannot reach the backend.');
  });

  it('says the request timed out when the backend never answers', async () => {
    // AbortSignal.timeout runs on a clock fake timers cannot reach, so the test fires the timeout itself.
    const timeout = new AbortController();
    vi.spyOn(AbortSignal, 'timeout').mockReturnValue(timeout.signal);
    mockBackend({
      'GET /runs': (_, init) => new Promise((_resolve, reject) => init.signal!.addEventListener('abort', () => reject(init.signal!.reason))),
    });

    const request = api.listRuns({});
    timeout.abort(new DOMException('timed out', 'TimeoutError'));

    await expect(request).rejects.toThrow('Backend request timed out.');
  });

  // Pages tell a cancelled request from a failed one by the abort, so it must not become "unreachable".
  it("passes the caller's own abort through untouched", async () => {
    const controller = new AbortController();
    mockBackend({
      'GET /runs': () => {
        controller.abort();
        throw new DOMException('aborted', 'AbortError');
      },
    });

    await expect(api.listRuns({}, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('rejects a successful answer that is not JSON', async () => {
    mockBackend({ 'GET /presets': () => ({ status: 200 }) });

    await expect(api.listPresets()).rejects.toThrow('non-JSON');
  });

  it("reads a degraded backend's 503 health answer instead of failing", async () => {
    mockBackend({ 'GET /health': () => ({ status: 503, body: { status: 'unavailable', version: '0.2.0', ready: false } }) });

    await expect(api.health()).resolves.toMatchObject({ status: 'unavailable', ready: false });
  });

  it('sends only the filters that are set, and the cursor as given', async () => {
    const fetchMock = mockBackend({ 'GET /runs': () => ({ body: { runs: [], next_cursor: null } }) });

    await api.listRuns({});
    await api.listRuns({ status: 'failed', cursor: 'eyJ+/=' });

    const urls = fetchMock.mock.calls.map(([input]) => new URL(input));
    expect(urls[0]!.search).toBe('');
    expect(Object.fromEntries(urls[1]!.searchParams)).toEqual({ status: 'failed', cursor: 'eyJ+/=' });
  });

  it('posts a new run as JSON', async () => {
    const fetchMock = mockBackend({ 'POST /runs': () => ({ status: 201, body: makeRun('run-1') }) });

    await api.createRun({ run_name: 'x', preset: 'DE_Rastrigin', run_settings: {} as never, stream: true, clustering: {} });

    const init = fetchMock.mock.calls[0]![1]!;
    expect((init.headers as Record<string, string>)['content-type']).toBe('application/json');
    expect(bodyOf(fetchMock.mock.calls[0]!)).toMatchObject({ run_name: 'x', preset: 'DE_Rastrigin' });
  });
});
