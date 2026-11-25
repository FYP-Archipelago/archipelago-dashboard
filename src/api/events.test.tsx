import { type InfiniteData, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { mockBackend } from '@/test/backend.ts';
import { makeResult, makeRun } from '@/test/fixtures.ts';
import type { Graph, GraphDelta, RunPage, RunStatusName } from '@/types.ts';

import { useLiveGraph } from './events.ts';
import { useRun } from './queries.ts';

// An EventSource the test drives by hand; every one the hook opens is kept, newest last.
class FakeSource {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;
  static opened: FakeSource[] = [];
  readyState = 0;
  onopen: (() => void) | null = null;
  private readonly handlers = new Map<string, ((event: Event) => void)[]>();
  constructor() {
    FakeSource.opened.push(this);
  }
  addEventListener(type: string, handler: (event: Event) => void) {
    this.handlers.set(type, [...(this.handlers.get(type) ?? []), handler]);
  }
  close() {
    this.readyState = 2;
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  send(nodes: number) {
    this.emit(new MessageEvent('update', { data: JSON.stringify({ status: 'live', graph: firstNodes(nodes) }) }));
  }
  // The browser gives up on the connection, as it does when the backend answers with an error.
  giveUp() {
    this.readyState = 2;
    this.emit(new Event('error'));
  }
  status(status: string) {
    this.emit(new MessageEvent('status', { data: JSON.stringify({ status }) }));
  }
  private emit(event: Event) {
    this.handlers.get(event.type)?.forEach((handler) => handler(event));
  }
}

const none = { id: [] } as never;
const graph: Graph = makeResult().graph;
// An update holding the graph's first `count` nodes, as a stream replaying from the start sends them.
function firstNodes(count: number): GraphDelta {
  const nodes = Object.fromEntries(
    Object.entries(graph.nodes).map(([key, column]) => [key, Array.isArray(column) ? (column as unknown[]).slice(0, count) : column])
  );
  return {
    new_nodes: nodes as unknown as Graph['nodes'],
    updated_nodes: none,
    percentiles: none,
    weights: null,
    removed_nodes: [],
    positions: null,
    new_edges: { id: [], source: [], target: [], weight: [] },
    edge_updates: none,
    new_migrations: { id: [], source: [], target: [], count: [] },
    migration_updates: none,
    island_best: [],
    overall_best: null,
    overlap: 1,
  };
}

describe('useLiveGraph', () => {
  it('retries a lost connection with growing waits and keeps the graph on screen until the replay catches up', () => {
    vi.useFakeTimers();
    vi.stubGlobal('EventSource', FakeSource);
    FakeSource.opened = [];
    const client = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const { result } = renderHook(() => useLiveGraph('run-1', true), { wrapper });
    const nodes = () => result.current.graph?.nodes.id.length;

    act(() => {
      FakeSource.opened[0]!.open();
      FakeSource.opened[0]!.send(3);
    });
    expect(result.current.connection).toBe('open');
    expect(nodes()).toBe(3);

    act(() => FakeSource.opened[0]!.giveUp());
    expect(result.current.connection).toBe('lost');
    expect(result.current.retryAt).toBe(Date.now() + 2000);

    // The first retry fails before it opens, so the next wait doubles.
    act(() => vi.advanceTimersByTime(2000));
    act(() => FakeSource.opened[1]!.giveUp());
    expect(result.current.retryAt).toBe(Date.now() + 4000);

    // The next one opens and replays from the start: part way through, the three clusters already shown stay.
    act(() => vi.advanceTimersByTime(4000));
    act(() => {
      FakeSource.opened[2]!.open();
      FakeSource.opened[2]!.send(2);
    });
    expect(result.current.connection).toBe('open');
    expect(nodes()).toBe(3);
    act(() => FakeSource.opened[2]!.send(5));
    expect(nodes()).toBe(5);
  });

  it('pauses polling the run while its stream is open, resumes when the stream is lost, and keeps the lists in step', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('EventSource', FakeSource);
    FakeSource.opened = [];
    let status: RunStatusName = 'running';
    const fetches = mockBackend({ 'GET /runs/run-1': () => ({ body: makeRun('run-1', { status }) }) });
    const client = new QueryClient();
    // The sidebar's list, loaded before the run page opened.
    const listKey = ['runs', 'list', 'all'];
    client.setQueryData<InfiniteData<RunPage>>(listKey, {
      pages: [{ runs: [makeRun('run-1', { status })], next_cursor: null }],
      pageParams: [undefined],
    });
    const listedStatus = () => client.getQueryData<InfiniteData<RunPage>>(listKey)?.pages[0]!.runs[0]!.status;
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const { result } = renderHook(() => [useRun('run-1'), useLiveGraph('run-1', true)] as const, { wrapper });
    await act(() => vi.advanceTimersByTimeAsync(100));
    expect(fetches).toHaveBeenCalledTimes(1);

    act(() => FakeSource.opened[0]!.open());
    // At most the poll already due goes out; after that the stream alone reports the run.
    await act(() => vi.advanceTimersByTimeAsync(5000));
    const afterOpen = fetches.mock.calls.length;
    await act(() => vi.advanceTimersByTimeAsync(30000));
    expect(fetches).toHaveBeenCalledTimes(afterOpen);

    // A status the run does not have yet is fetched at once.
    status = 'clustering';
    act(() => FakeSource.opened[0]!.status('clustering'));
    await act(() => vi.advanceTimersByTimeAsync(100));
    expect(fetches).toHaveBeenCalledTimes(afterOpen + 1);
    expect(result.current[0].data?.status).toBe('clustering');
    expect(listedStatus()).toBe('clustering');

    // Lost, the run is fetched at once and polled again; the retry 2 s later never opens.
    act(() => FakeSource.opened[0]!.giveUp());
    await act(() => vi.advanceTimersByTimeAsync(100));
    expect(fetches).toHaveBeenCalledTimes(afterOpen + 2);
    await act(() => vi.advanceTimersByTimeAsync(10000));
    expect(fetches).toHaveBeenCalledTimes(afterOpen + 4);
  });
});
