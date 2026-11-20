import {
  infiniteQueryOptions,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from '@tanstack/react-query';
import { useEffect } from 'react';

import type { NewRun, Run, RunPage, RunStatusName } from '@/types.ts';

import { isNotFound } from './client.ts';
import { getHealth } from './health.ts';
import { getPresets } from './presets.ts';
import { createRun, getRun, getRuns } from './runs.ts';

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

const FINISHED: RunStatusName[] = ['done', 'failed', 'cancelled'];

// The run's row from the most recently fetched runs list that has it, and when that list was fetched.
function listedRun(queryClient: QueryClient, id: string): { run: Run; at: number } | null {
  let found: { run: Run; at: number } | null = null;
  for (const [key, data] of queryClient.getQueriesData<InfiniteData<RunPage>>({ queryKey: ['runs', 'list'] })) {
    const run = data?.pages.flatMap((page) => page.runs).find((row) => row.run_id === id);
    const at = queryClient.getQueryState(key)?.dataUpdatedAt ?? 0;
    if (run && (!found || at > found.at)) found = { run, at };
  }
  return found;
}

// Opened from the runs list or the sidebar, the run's row is already loaded. A finished run's row can no longer
// change, so it is used as is and /runs/{id} is never asked; an unfinished one is fetched at once and polled until
// it finishes. Opened from a typed or shared URL, nothing is loaded, so the run is fetched first.
// A failed first load keeps trying too, unless the run does not exist.
export function useRun(id: string) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: ['run', id],
    queryFn: ({ signal }) => getRun(id, signal),
    initialData: () => listedRun(queryClient, id)?.run,
    initialDataUpdatedAt: () => listedRun(queryClient, id)?.at,
    staleTime: ({ state }) => (state.data && FINISHED.includes(state.data.status) ? Infinity : 0),
    refetchInterval: ({ state }) => ((state.data ? !FINISHED.includes(state.data.status) : !isNotFound(state.error)) ? 5000 : false),
    retry: (failures, error) => failures < 1 && !isNotFound(error),
  });
}
