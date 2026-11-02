const STATUSES = new Set(['queued', 'running', 'clustering', 'done', 'failed', 'cancelled']);
const UNCERTAIN = ' The run may have been accepted. Check the backend before starting it again.';

export class BackendError extends Error {
  constructor(message, {status=0, ambiguous=false}={}) {
    super(message + (ambiguous ? UNCERTAIN : ''));
    this.name = 'BackendError';
    this.status = status;
    this.ambiguous = ambiguous;
  }
}

function errorDetail(body) {
  const detail = body?.detail ?? body?.error ?? body?.message;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) return detail.map(item => {
    const path = (item.loc || []).filter(part => part !== 'body').join('.');
    return `${path ? path + ': ' : ''}${item.msg || 'Invalid value'}`;
  }).join('; ');
  return null;
}

export function createBackendClient({baseUrl='/backend', identityUrl, fetchImpl=globalThis.fetch, timeoutMs=15000}={}) {
  const base = String(baseUrl).replace(/\/+$/, '');
  if (!/^https?:\/\/[^\s]+$/.test(base) && !/^\/(?!\/)[^?#\s]*$/.test(base)) throw new Error('Backend URL must be HTTP(S) or a same-origin path.');
  const url = path => {
    if (!/^\/(?!\/)/.test(path)) throw new Error('Backend endpoint must start with one slash.');
    return base + path;
  };

  async function requestAt(target, {method='GET', body, signal, creating=false}={}) {
    const timeout = AbortSignal.timeout(timeoutMs);
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
    let response, text;
    try {
      response = await fetchImpl(target, {
        method, signal:combined, headers:{accept:'application/json', ...(body === undefined ? {} : {'content-type':'application/json'})},
        ...(body === undefined ? {} : {body:JSON.stringify(body)}),
      });
      text = await response.text();
    } catch (error) {
      if (signal?.aborted) throw signal.reason;
      throw new BackendError(timeout.aborted ? 'Backend request timed out.' : 'Cannot reach the backend. Check that it is running and the backend URL is correct.', {ambiguous:creating});
    }
    let value;
    try {value = JSON.parse(text);} catch {
      throw new BackendError(`Backend returned ${response.ok ? 'a' : `HTTP ${response.status} with a`} non-JSON response. Check the backend URL and service logs.`, {status:response.status, ambiguous:creating && (response.ok || response.status >= 500)});
    }
    if (!response.ok) throw new BackendError(errorDetail(value) || `Backend request failed (HTTP ${response.status}).`, {status:response.status, ambiguous:creating && response.status >= 500});
    return value;
  }
  const request = (path,options={}) => requestAt(url(path),{...options,creating:options.method === 'POST' && path === '/runs'});
  const identityEndpoint = identityUrl === undefined && base === '/backend' ? '/api/backend-config' : identityUrl;

  return {
    baseUrl:base, url, request,
    async identity(options) {
      if (!identityEndpoint) return base;
      const value = await requestAt(identityEndpoint,options);
      if (typeof value?.backend_id !== 'string' || !/^https?:\/\//.test(value.backend_id)) throw new BackendError('Cannot identify the configured backend. Check the dashboard proxy configuration.');
      return value.backend_id;
    },
    health: options => request('/health', options),
    presets: options => request('/presets', options),
    result: (runId, options) => request(`/runs/${encodeURIComponent(runId)}/result`, options),
    cancelRun: runId => request(`/runs/${encodeURIComponent(runId)}/cancel`, {method:'POST'}),
    async createRun(body) {
      const value = await request('/runs', {method:'POST', body});
      if (!value || typeof value.run_id !== 'string' || !/^run-\d{8}T\d{6}Z-[a-f0-9]{8}$/.test(value.run_id) || !STATUSES.has(value.status)) {
        throw new BackendError('Backend returned an invalid run response.', {ambiguous:true});
      }
      return value;
    },
  };
}

export const backendApi = createBackendClient({baseUrl:import.meta.env?.VITE_BACKEND_URL || '/backend'});
