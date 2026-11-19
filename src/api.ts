export type RunStatusName = 'queued' | 'running' | 'clustering' | 'done' | 'failed' | 'cancelling' | 'cancelled';

export type RunSettings = {
  num_islands: number;
  evaluation_budget: number;
  target_generations: number;
  'migration.enabled': boolean;
  'migration.topology': string;
  'migration.interval': number;
  'migration.num_migrants': number;
  seed?: number;
};

// Mirrors archipelago's clustering Config. A null distance means auto.
export type Clustering = {
  lsh: boolean;
  birch: boolean;
  denstream: boolean;
  detail: number;
  birch_threshold: number | null;
  denstream_epsilon: number | null;
  denstream_half_life: number | null;
  denstream_mu: number;
  denstream_beta: number;
  lsh_hashes: number;
  seed: number;
};

export type Run = {
  run_id: string;
  run_name: string;
  status: RunStatusName;
  stream: boolean;
  preset: string;
  run_settings: RunSettings;
  clustering: Clustering;
  error: { phase: 'runner' | 'clustering' | 'internal'; message: string } | null;
  created_at: string;
};

export type NewRun = {
  run_name: string;
  preset: string;
  run_settings: RunSettings;
  stream: boolean;
  clustering: Partial<Clustering>;
};

type RunPage = { runs: Run[]; next_cursor: string | null };

export type OverrideSpec = { type: 'int'; min?: number; max?: number; optional?: boolean } | { type: 'bool' } | { type: 'choice'; choices: string[] };

export type Preset = { preset: string; algorithm: string; benchmark: string; description: string; defaults: RunSettings };

export type Presets = { overrides: Partial<Record<keyof RunSettings, OverrideSpec>>; presets: Preset[] };

export type Health = { status: 'ok' | 'unavailable'; version: string; ready: boolean };

type RunQuery = { status?: RunStatusName; cursor?: string };

type Api = {
  health: (signal?: AbortSignal) => Promise<Health>;
  listRuns: (query: RunQuery, signal?: AbortSignal) => Promise<RunPage>;
  listPresets: (signal?: AbortSignal) => Promise<Presets>;
  createRun: (body: NewRun) => Promise<Run>;
};

type RequestOptions = { body?: unknown; signal?: AbortSignal; tolerate?: number };

const TIMEOUT_MS = 15000;

// FastAPI sends `detail` as a string for HTTPException and as a list of {msg} for validation errors.
function detail(body: unknown): string | null {
  const value = (body as { detail?: unknown } | null)?.detail;
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map((item: { msg?: unknown }) => String(item?.msg ?? '')).join('; ') || null;
  return null;
}

function createApi(baseUrl: string): Api {
  const base = baseUrl.replace(/\/+$/, '');
  // `tolerate` is an error status whose body is still a valid answer.
  async function request<T>(method: 'GET' | 'POST', path: string, { body, signal, tolerate }: RequestOptions = {}): Promise<T> {
    const timeout = AbortSignal.timeout(TIMEOUT_MS);
    const headers: Record<string, string> = { accept: 'application/json' };
    if (body !== undefined) headers['content-type'] = 'application/json';
    let response: Response;
    try {
      response = await fetch(base + path, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      });
    } catch (reason) {
      if (signal?.aborted) throw reason;
      throw new Error(timeout.aborted ? 'Backend request timed out.' : 'Cannot reach the backend.');
    }
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok && response.status !== tolerate) throw new Error(detail(payload) ?? `Backend request failed (HTTP ${response.status}).`);
    if (payload === null) throw new Error('Backend returned a non-JSON response.');
    return payload as T;
  }
  return {
    // A degraded backend answers /health with 503 and the same body.
    health: (signal) => request<Health>('GET', '/health', { signal, tolerate: 503 }),
    listRuns: (query, signal) => {
      const params = new URLSearchParams(Object.entries(query).filter((entry): entry is [string, string] => Boolean(entry[1])));
      return request<RunPage>('GET', `/runs${params.size ? `?${params}` : ''}`, { signal });
    },
    listPresets: (signal) => request<Presets>('GET', '/presets', { signal }),
    createRun: (body) => request<Run>('POST', '/runs', { body }),
  };
}

export const api = createApi(import.meta.env.VITE_BACKEND_URL || 'http://127.0.0.1:8000');
