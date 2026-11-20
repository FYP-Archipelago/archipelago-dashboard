import type { Presets } from '@/types.ts';

import { request } from './client.ts';

export function getPresets(signal?: AbortSignal): Promise<Presets> {
  return request<Presets>('GET', '/presets', { signal });
}
