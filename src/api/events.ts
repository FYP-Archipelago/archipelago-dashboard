import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { Graph, MigrationRoute, Run, RunResult, RunUpdate } from '@/types.ts';

import { backendUrl } from './client.ts';
import { applyDelta, emptyLiveGraph, liveGraphColumns } from './graph.ts';

// reconnecting: the browser is retrying on its own. lost: it gave up, so we retry at `retryAt`.
type Connection = 'connecting' | 'open' | 'reconnecting' | 'lost' | 'closed';

type Snapshot = {
  graph: Graph | null;
  maximising: boolean | null;
  routes: MigrationRoute[];
  connection: Connection;
  updatedAt: number | null;
  retryAt: number | null;
};

export type LiveGraphState = Snapshot & { retry: () => void };

const CLOSED: Snapshot = { graph: null, maximising: null, routes: [], connection: 'closed', updatedAt: null, retryAt: null };
const CONNECTING: Snapshot = { ...CLOSED, connection: 'connecting' };

// Runs whose stream is open. The stream reports every status change, so useRun stops polling these.
const streaming = new Set<string>();
export const isStreaming = (id: string) => streaming.has(id);

// Seconds before each retry once the browser has given up on the connection; the last one repeats.
const RETRY_SECONDS = [2, 4, 8, 16, 30];

// A streamed run's graph as it grows. EventSource's own reconnects resume after the last update the backend sent.
// When it gives up, a new connection replays every update from the start, so the graph is rebuilt.
export function useLiveGraph(id: string, enabled: boolean): LiveGraphState {
  const queryClient = useQueryClient();
  // Tagged with the run it belongs to, so a new run starts from CONNECTING rather than the last run's graph.
  const [state, setState] = useState<Snapshot & { id: string }>({ ...CLOSED, id: '' });
  const retryNow = useRef(() => {});

  useEffect(() => {
    if (!enabled) return;
    let source: EventSource | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;
    let shownNodes = 0;
    const update = (patch: Partial<Snapshot>) => setState((current) => ({ ...(current.id === id ? current : CONNECTING), ...patch, id }));
    const refreshRun = () => void queryClient.invalidateQueries({ queryKey: ['run', id] });
    // Polling takes over again; refreshing the run is what restarts it.
    const stopStreaming = () => {
      if (streaming.delete(id)) refreshRun();
    };
    const finish = () => {
      streaming.delete(id);
      clearTimeout(timer);
      source?.close();
      update({ connection: 'closed', retryAt: null });
    };

    const connect = () => {
      clearTimeout(timer);
      source?.close();
      let live = emptyLiveGraph();
      let catchingUp = shownNodes > 0;
      const opened = Date.now();
      const current = new EventSource(backendUrl(`/runs/${encodeURIComponent(id)}/events`));
      source = current;

      current.onopen = () => {
        failures = 0;
        streaming.add(id);
        update({ connection: 'open', retryAt: null });
      };
      current.addEventListener('update', (event) => {
        const message = JSON.parse((event as MessageEvent<string>).data) as RunUpdate;
        live = applyDelta(live, message.graph);
        const graph = liveGraphColumns(live);
        // While a rebuild is behind the graph on screen, keep showing that one; a graph that shrank (DenStream drops
        // clusters) would never catch up, so after two seconds the rebuild shows regardless.
        if (catchingUp && graph.nodes.id.length < shownNodes && Date.now() - opened < 2000) return;
        catchingUp = false;
        shownNodes = graph.nodes.id.length;
        update({ graph, maximising: message.maximising, routes: message.migration_routes, connection: 'open', updatedAt: Date.now(), retryAt: null });
      });
      current.addEventListener('status', (event) => {
        const { status } = JSON.parse((event as MessageEvent<string>).data) as { status: string };
        // The run's other fields (started and finished times, error) change with its status, so fetch it whole.
        if (queryClient.getQueryData<Run>(['run', id])?.status !== status) refreshRun();
        // The backend ends a cancelled run's stream, which EventSource would otherwise take for a drop and retry.
        if (status === 'cancelled') finish();
      });
      current.addEventListener('final', (event) => {
        queryClient.setQueryData(['run-result', id], JSON.parse((event as MessageEvent<string>).data) as RunResult);
        refreshRun();
        finish();
      });
      // The backend's own error event carries data and ends the stream. A bare one is the connection dropping: while
      // EventSource is still CONNECTING it retries by itself; once it is CLOSED it has given up, so we retry later.
      current.addEventListener('error', (event) => {
        if ((event as MessageEvent).data !== undefined) {
          refreshRun();
          finish();
        } else if (current.readyState === EventSource.CLOSED) {
          streaming.delete(id);
          const wait = RETRY_SECONDS[Math.min(failures, RETRY_SECONDS.length - 1)]! * 1000;
          failures++;
          // The run may have ended while the connection was down; if it has, the tab stops streaming.
          refreshRun();
          timer = setTimeout(connect, wait);
          update({ connection: 'lost', retryAt: Date.now() + wait });
        } else {
          stopStreaming();
          update({ connection: 'reconnecting' });
        }
      });
    };

    retryNow.current = () => {
      failures = 0;
      update({ connection: 'connecting', retryAt: null });
      connect();
    };
    connect();
    return () => {
      clearTimeout(timer);
      source?.close();
      stopStreaming();
      retryNow.current = () => {};
      // A later stream of the same run starts from nothing, not from where this one stopped.
      setState({ ...CLOSED, id: '' });
    };
  }, [id, enabled, queryClient]);

  const retry = useCallback(() => retryNow.current(), []);
  if (!enabled) return { ...CLOSED, retry };
  if (state.id !== id) return { ...CONNECTING, retry };
  const { graph, maximising, routes, connection, updatedAt, retryAt } = state;
  return { graph, maximising, routes, connection, updatedAt, retryAt, retry };
}
