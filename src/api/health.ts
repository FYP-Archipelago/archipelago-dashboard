import type { Health } from '@/types.ts';

import { request } from './client.ts';

// A degraded backend answers /health with 503 and the same body.
export function getHealth(signal?: AbortSignal): Promise<Health> {
  return request<Health>('GET', '/health', { signal, tolerate: 503 });
}
