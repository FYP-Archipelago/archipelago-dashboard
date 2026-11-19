import { vi } from 'vitest';

type Reply = { status?: number; body?: unknown };
type Handler = (url: URL, init: RequestInit) => Reply | Promise<Reply>;

// Stands in for the backend: `routes` maps "METHOD /path" to a reply, and a handler that throws is a request
// that never got an answer. The returned mock records every call.
export function mockBackend(routes: Record<string, Handler>) {
  const fetchMock = vi.fn(async (input: string, init: RequestInit = {}) => {
    const url = new URL(input);
    const route = routes[`${init.method ?? 'GET'} ${url.pathname}`];
    if (!route) throw new Error(`No mock for ${init.method ?? 'GET'} ${url.pathname}`);
    const reply = await route(url, init);
    return new Response(reply.body === undefined ? null : JSON.stringify(reply.body), { status: reply.status ?? 200 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

// The parsed JSON body of a recorded fetch call.
export const bodyOf = (call: unknown[]) => JSON.parse((call[1] as RequestInit).body as string) as unknown;
