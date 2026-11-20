import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { usePoll } from './usePoll.ts';

const setHidden = (hidden: boolean) => Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });

describe('usePoll', () => {
  afterEach(() => setHidden(false));

  it('reloads every 10 s, and not while the tab is hidden', async () => {
    vi.useFakeTimers();
    const load = vi.fn(async () => 'data');
    renderHook(() => usePoll('key', load));
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(load).toHaveBeenCalledTimes(1);

    await act(() => vi.advanceTimersByTimeAsync(10000));
    expect(load).toHaveBeenCalledTimes(2);

    setHidden(true);
    await act(() => vi.advanceTimersByTimeAsync(30000));
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('keeps the last data through a failed reload', async () => {
    vi.useFakeTimers();
    const load = vi.fn<() => Promise<string>>().mockResolvedValueOnce('first').mockRejectedValueOnce(new Error('down'));
    const { result } = renderHook(() => usePoll('key', load));
    await act(() => vi.advanceTimersByTimeAsync(0));

    await act(() => vi.advanceTimersByTimeAsync(10000));

    expect(result.current).toEqual({ data: 'first', error: 'down' });
  });

  // A filtered list must never show the previous filter's runs while its own are loading.
  it("drops the old key's data as soon as the key changes", async () => {
    let finish: (value: string) => void = () => {};
    const load = vi.fn((key: string) => (key === 'all' ? Promise.resolve('all runs') : new Promise<string>((resolve) => (finish = resolve))));
    const { result, rerender } = renderHook(({ key }) => usePoll(key, () => load(key)), { initialProps: { key: 'all' } });
    await act(async () => {});
    expect(result.current.data).toBe('all runs');

    rerender({ key: 'failed' });
    expect(result.current.data).toBeUndefined();

    await act(async () => finish('failed runs'));
    expect(result.current.data).toBe('failed runs');
  });
});
