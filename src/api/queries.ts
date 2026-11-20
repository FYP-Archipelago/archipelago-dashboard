import { infiniteQueryOptions, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { NewRun, RunStatusName } from '@/types.ts';

import { getHealth } from './health.ts';
import { getPresets } from './presets.ts';
import { createRun, getRuns } from './runs.ts';

function runList(status?: RunStatusName) {
  return infiniteQueryOptions({
    queryKey: ['runs', 'list', status ?? 'all'],
    queryFn: ({ pageParam, signal }) => getRuns({ status, cursor: pageParam }, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.next_cursor ?? undefined,
    refetchInterval: 10000,
  });
}

export const useHealth = () => useQuery({ queryKey: ['health'], queryFn: ({ signal }) => getHealth(signal), refetchInterval: 10000 });

export const useRuns = (status?: RunStatusName) => useInfiniteQuery(runList(status));

export const useRecentRuns = () => useInfiniteQuery({ ...runList(), select: (data) => data.pages[0] });

export const usePresets = () =>
  useQuery({ queryKey: ['presets'], queryFn: ({ signal }) => getPresets(signal), staleTime: Infinity, gcTime: Infinity });

export function useCreateRun() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: NewRun) => createRun(body),
    // Not awaited, so the start button does not wait on the lists refreshing.
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['runs'] }),
  });
}
