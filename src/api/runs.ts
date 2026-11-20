import type { NewRun, Run, RunPage, RunStatusName } from '@/types.ts';

import { request } from './client.ts';

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
