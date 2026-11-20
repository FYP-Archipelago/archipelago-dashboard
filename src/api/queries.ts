import { infiniteQueryOptions, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

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
    retry: false,
  });
}

export const useHealth = () => useQuery({ queryKey: ['health'], queryFn: ({ signal }) => getHealth(signal), refetchInterval: 60000, retry: false });

export function useRuns(status?: RunStatusName) {
  const queryClient = useQueryClient();
  // The sidebar keeps "All" polling after the runs page stops showing it, and every poll refetches each loaded page.
  // So a list the page leaves goes back to its first page. An in-flight refetch is cancelled first, or it would put the pages back.
  useEffect(
    () => () => {
      const { queryKey } = runList(status);
      void queryClient
        .cancelQueries({ queryKey })
        .then(() => queryClient.setQueryData(queryKey, (data) => data && { pages: data.pages.slice(0, 1), pageParams: data.pageParams.slice(0, 1) }));
    },
    [queryClient, status]
  );
  return useInfiniteQuery(runList(status));
}

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
