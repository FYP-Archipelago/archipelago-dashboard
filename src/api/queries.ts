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
import { isStreaming } from './events.ts';
import { getHealth } from './health.ts';
import { getPresets } from './presets.ts';
import { cancelRun, createRun, deleteRun, getRun, getRunResult, getRuns, isFinished, renameRun } from './runs.ts';

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

// Starts from the run's row in a loaded runs list; a finished run is never refetched. An unfinished one is polled
// until it finishes, except while its live stream reports its status.
export function useRun(id: string) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: ['run', id],
    queryFn: ({ signal }) => getRun(id, signal),
    initialData: () => listedRun(queryClient, id)?.run,
    initialDataUpdatedAt: () => listedRun(queryClient, id)?.at,
    staleTime: ({ state }) => (state.data && isFinished(state.data.status) ? Infinity : 0),
    refetchInterval: ({ state }) => ((state.data ? !isFinished(state.data.status) && !isStreaming(id) : !isNotFound(state.error)) ? 5000 : false),
    retry: (failures, error) => failures < 1 && !isNotFound(error),
  });
}

// A result never changes once stored. Its key sits outside ['runs'], so refreshing the lists never refetches it.
export const useRunResult = (id: string, enabled: boolean) =>
  useQuery({ queryKey: ['run-result', id], queryFn: ({ signal }) => getRunResult(id, signal), enabled, staleTime: Infinity });

export function useCancelRun(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => cancelRun(id),
    onSuccess: (run) => {
      queryClient.setQueryData(['run', id], run);
      void queryClient.invalidateQueries({ queryKey: ['runs'] });
    },
  });
}

// Rewrites the run's row in every loaded runs list, so a change shows at once instead of at the next poll.
function patchListedRuns(queryClient: QueryClient, update: (runs: Run[]) => Run[]) {
  queryClient.setQueriesData<InfiniteData<RunPage>>(
    { queryKey: ['runs', 'list'] },
    (data) => data && { ...data, pages: data.pages.map((page) => ({ ...page, runs: update(page.runs) })) }
  );
}

export function useRenameRun(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => renameRun(id, name),
    onSuccess: (run) => {
      queryClient.setQueryData(['run', id], run);
      patchListedRuns(queryClient, (runs) => runs.map((row) => (row.run_id === id ? run : row)));
    },
  });
}

// A finished run is never refetched, so its cached copy is dropped too, or going back to it would show it as if it still existed.
export function useDeleteRun(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => deleteRun(id),
    onSuccess: () => {
      patchListedRuns(queryClient, (runs) => runs.filter((row) => row.run_id !== id));
      queryClient.removeQueries({ queryKey: ['run', id], exact: true });
      queryClient.removeQueries({ queryKey: ['run-result', id], exact: true });
      void queryClient.invalidateQueries({ queryKey: ['runs'] });
    },
  });
}
