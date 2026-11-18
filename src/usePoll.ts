import { useEffect, useEffectEvent, useState } from 'react';

// How often run lists refresh while the tab is visible.
export const POLL_MS = 10000;

type Polled<T> = { key: string; data?: T; error: string };

// Loads now and every POLL_MS after. A new `key` restarts polling and drops the old result.
export function usePoll<T>(key: string, load: (signal: AbortSignal) => Promise<T>): { data?: T; error: string; loading: boolean } {
  const [state, setState] = useState<Polled<T>>({ key, error: '' });
  const run = useEffectEvent(async (signal: AbortSignal) => {
    try {
      const data = await load(signal);
      if (!signal.aborted) setState({ key, data, error: '' });
    } catch (reason) {
      if (!signal.aborted) setState((prev) => ({ key, data: prev.key === key ? prev.data : undefined, error: (reason as Error).message }));
    }
  });
  useEffect(() => {
    const controller = new AbortController();
    let busy = false;
    const tick = async () => {
      if (busy) return;
      busy = true;
      await run(controller.signal);
      busy = false;
    };
    tick();
    const timer = setInterval(() => {
      if (!document.hidden) tick();
    }, POLL_MS);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [key]);
  const current = state.key === key;
  return {
    data: current ? state.data : undefined,
    error: current ? state.error : '',
    loading: !current || (state.data === undefined && !state.error),
  };
}
