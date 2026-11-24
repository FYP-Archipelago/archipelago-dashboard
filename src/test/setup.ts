import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// jsdom has no matchMedia. Reporting reduced motion also keeps looping previews (the Mode section) still in tests.
window.matchMedia = (query: string) =>
  ({
    matches: query.includes('prefers-reduced-motion: reduce'),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }) as MediaQueryList;

// jsdom has no ResizeObserver either. This one reports each element once when it starts observing, as the real one does.
window.ResizeObserver = class {
  constructor(private readonly report: ResizeObserverCallback) {}
  observe(target: Element) {
    this.report([{ target } as ResizeObserverEntry], this as unknown as ResizeObserver);
  }
  unobserve() {}
  disconnect() {}
};

// Nor EventSource. A streamed run's Network tab opens one; this one stays connecting and never sends anything.
window.EventSource = class {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;
  readyState = 0;
  addEventListener() {}
  removeEventListener() {}
  close() {
    this.readyState = 2;
  }
} as unknown as typeof EventSource;

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.history.replaceState(null, '', '/');
});
