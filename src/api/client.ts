type RequestOptions = { body?: unknown; signal?: AbortSignal; tolerate?: number };

// An answer the backend gave with an error status; errors without an answer (unreachable, timeout) stay plain Errors.
class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

export const isNotFound = (error: unknown) => error instanceof ApiError && error.status === 404;

const TIMEOUT_MS = 15000;
const base = (import.meta.env.VITE_BACKEND_URL || 'http://127.0.0.1:8000').replace(/\/+$/, '');

export const backendUrl = (path: string) => base + path;

// FastAPI sends `detail` as a string for HTTPException and as a list of {msg} for validation errors.
function detail(body: unknown): string | null {
  const value = (body as { detail?: unknown } | null)?.detail;
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map((item: { msg?: unknown }) => String(item?.msg ?? '')).join('; ') || null;
  return null;
}

export async function request<T>(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  { body, signal, tolerate }: RequestOptions = {}
): Promise<T> {
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
  if (!response.ok && response.status !== tolerate)
    throw new ApiError(detail(payload) ?? `Backend request failed (HTTP ${response.status}).`, response.status);
  if (response.status === 204) return undefined as T;
  if (payload === null) throw new Error('Backend returned a non-JSON response.');
  return payload as T;
}
