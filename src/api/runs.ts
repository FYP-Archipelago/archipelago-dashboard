import type { NewRun, Run, RunPage, RunResult, RunStatusName } from '@/types.ts';

import { request } from './client.ts';

export const NAME_MAX = 100;

export const isFinished = (status: RunStatusName) => status === 'done' || status === 'failed' || status === 'cancelled';

type RunQuery = { status?: RunStatusName; cursor?: string };

export function getRuns(query: RunQuery, signal?: AbortSignal): Promise<RunPage> {
  const params = new URLSearchParams(Object.entries(query).filter((entry): entry is [string, string] => Boolean(entry[1])));
  return request<RunPage>('GET', `/runs${params.size ? `?${params}` : ''}`, { signal });
}

export function createRun(body: NewRun): Promise<Run> {
  return request<Run>('POST', '/runs', { body });
}

const runPath = (id: string) => `/runs/${encodeURIComponent(id)}`;

export function getRun(id: string, signal?: AbortSignal): Promise<Run> {
  return request<Run>('GET', runPath(id), { signal });
}

// Only a done run has a result; any other status answers 404.
export function getRunResult(id: string, signal?: AbortSignal): Promise<RunResult> {
  return request<RunResult>('GET', `${runPath(id)}/result`, { signal });
}

export function cancelRun(id: string): Promise<Run> {
  return request<Run>('POST', `${runPath(id)}/cancel`);
}

export function renameRun(id: string, name: string): Promise<Run> {
  return request<Run>('PATCH', runPath(id), { body: { run_name: name } });
}

export function deleteRun(id: string): Promise<void> {
  return request<void>('DELETE', runPath(id));
}
