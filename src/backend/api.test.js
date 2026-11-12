import { test, expect } from 'vitest';
import { createBackendClient, BackendError } from './api.js';

const run = {
  run_id: 'run-20261102T120000Z-aabbccdd',
  status: 'queued',
  stream: true,
  preset: 'de_rastrigin',
  overrides: {},
  clustering: { birch: true },
  error: null,
};
const reply = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });

test('cancel validates run identity and preserves terminal completion races', async () => {
  for (const value of [
    { ...run, status: 'cancelling' },
    { ...run, status: 'cancelled' },
    { ...run, status: 'done' },
  ]) {
    let options;
    const api = createBackendClient({
      fetchImpl: async (_, request) => {
        options = request;
        return reply(value, 202);
      },
    });
    expect(await api.cancelRun(run.run_id)).toStrictEqual(value);
    expect(options.method).toBe('POST');
  }
  for (const value of [
    { ...run, run_id: 'other' },
    { ...run, status: 'finished' },
  ]) {
    await expect(createBackendClient({ fetchImpl: async () => reply(value) }).cancelRun(run.run_id)).rejects.toThrow(/invalid cancellation response/);
  }
});

test('current backend uses its own namespace and preserves the real create response', async () => {
  const calls = [];
  const api = createBackendClient({
    baseUrl: '/backend/',
    fetchImpl: async (url, options) => {
      calls.push([url, options]);
      return reply(run, 202);
    },
  });
  const body = { preset: 'de_rastrigin', overrides: { seed: 0 }, stream: true, clustering: { birch: true } };
  expect(await api.createRun(body)).toStrictEqual(run);
  expect(calls[0][0]).toBe('/backend/runs');
  expect(calls[0][1].method).toBe('POST');
  expect(JSON.parse(calls[0][1].body)).toStrictEqual(body);
  expect(api.url(`/runs/${run.run_id}/events`)).toBe(`/backend/runs/${run.run_id}/events`);
  expect(() => api.url('//elsewhere/health')).toThrow();
  expect(() => createBackendClient({ baseUrl: 'javascript:bad' })).toThrow();
});

test('health, presets and result share the client and support URL prefixes', async () => {
  const calls = [];
  const api = createBackendClient({
    baseUrl: 'http://localhost:8000/service/',
    fetchImpl: async (url) => {
      calls.push(url);
      return reply({ status: 'ok', db: true, redis: true });
    },
  });
  expect((await api.health()).status).toBe('ok');
  await api.presets();
  await api.result(run.run_id);
  expect(calls).toStrictEqual([
    'http://localhost:8000/service/health',
    'http://localhost:8000/service/presets',
    `http://localhost:8000/service/runs/${run.run_id}/result`,
  ]);
});

test('FastAPI details, validation arrays and non-JSON errors are readable', async () => {
  for (const [response, pattern] of [
    [reply({ detail: 'runner unavailable' }, 502), /runner unavailable/],
    [reply({ detail: [{ loc: ['body', 'clustering', 'detail'], msg: 'must be at most 2' }] }, 422), /clustering.detail: must be at most 2/],
    [new Response('<html>bad gateway</html>', { status: 502 }), /HTTP 502.*non-JSON/],
    [new Response('broken', { status: 200 }), /non-JSON/],
  ]) {
    const api = createBackendClient({ fetchImpl: async () => response });
    await expect(api.health()).rejects.toSatisfy((error) => error instanceof BackendError && pattern.test(error.message));
  }
});

test('failed POST is not retried and a lost response warns of ambiguous acceptance', async () => {
  let calls = 0;
  const api = createBackendClient({
    fetchImpl: async () => {
      calls++;
      throw new TypeError('Failed to fetch');
    },
  });
  await expect(api.createRun({})).rejects.toSatisfy((error) => error.ambiguous && /may have been accepted/.test(error.message));
  expect(calls).toBe(1);
});

test('HTML gateway failure after create carries an ambiguous-acceptance warning', async () => {
  const api = createBackendClient({ fetchImpl: async () => new Response('<html>Gateway timeout</html>', { status: 504 }) });
  await expect(api.createRun({})).rejects.toSatisfy(
    (error) => error.status === 504 && error.ambiguous && /may have been accepted/.test(error.message)
  );
});

test('malformed create success never yields an invented run ID', async () => {
  for (const value of [{ job_id: 'old-job' }, { ...run, run_id: '' }, { ...run, status: 'finished' }]) {
    const api = createBackendClient({ fetchImpl: async () => reply(value, 202) });
    await expect(api.createRun({})).rejects.toSatisfy((error) => error.ambiguous && /run response/.test(error.message));
  }
});

test('external abort stays an AbortError and timeouts are readable', async () => {
  const fetchImpl = (_, { signal }) =>
    new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
  const controller = new AbortController();
  const api = createBackendClient({ fetchImpl, timeoutMs: 10 });
  const pending = api.presets({ signal: controller.signal });
  controller.abort();
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  // Keep the loop alive: AbortSignal timeout timers alone are unref'd in Node.
  const keepAlive = setInterval(() => {}, 100);
  try {
    await expect(api.health()).rejects.toThrow(/timed out/);
  } finally {
    clearInterval(keepAlive);
  }
});
