export type RunStatusName = 'queued' | 'running' | 'clustering' | 'done' | 'failed' | 'cancelling' | 'cancelled';

export type Run = {
  run_id: string;
  status: RunStatusName;
  stream: boolean;
  preset: string;
  run_settings: { num_islands: number; evaluation_budget: number } & Record<string, unknown>;
  error: { phase: 'runner' | 'clustering' | 'internal'; message: string } | null;
  created_at: string;
  updated_at: string;
};

type RunPage = { runs: Run[]; next_cursor: string | null };

export type Preset = { preset: string };

export type Health = { status: 'ok' | 'unavailable'; version: string; ready: boolean };

type RunQuery = { status?: RunStatusName; preset?: string; cursor?: string };

type Api = {
  health: (signal?: AbortSignal) => Promise<Health>;
  presets: (signal?: AbortSignal) => Promise<Preset[]>;
  listRuns: (query: RunQuery, signal?: AbortSignal) => Promise<RunPage>;
};

const TIMEOUT_MS = 15000;

function detail(body: unknown): string | null {
  const value = (body as { detail?: unknown } | null)?.detail;
  return typeof value === 'string' ? value : null;
}

function createApi(baseUrl: string): Api {
  const base = baseUrl.replace(/\/+$/, '');
  // `tolerate` is an error status whose body is still a valid answer.
  async function get<T>(path: string, signal?: AbortSignal, tolerate?: number): Promise<T> {
    const timeout = AbortSignal.timeout(TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(base + path, { headers: { accept: 'application/json' }, signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
    } catch (reason) {
      if (signal?.aborted) throw reason;
      throw new Error(timeout.aborted ? 'Backend request timed out.' : 'Cannot reach the backend.');
    }
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok && response.status !== tolerate) throw new Error(detail(body) ?? `Backend request failed (HTTP ${response.status}).`);
    if (body === null) throw new Error('Backend returned a non-JSON response.');
    return body as T;
  }
  return {
    // A degraded backend answers /health with 503 and the same body.
    health: (signal) => get<Health>('/health', signal, 503),
    presets: async (signal) => (await get<{ presets: Preset[] }>('/presets', signal)).presets,
    listRuns: (query, signal) => {
      const params = new URLSearchParams(Object.entries(query).filter((entry): entry is [string, string] => Boolean(entry[1])));
      return get<RunPage>(`/runs${params.size ? `?${params}` : ''}`, signal);
    },
  };
}

export const api = createApi(import.meta.env.VITE_BACKEND_URL || 'http://127.0.0.1:8000');
