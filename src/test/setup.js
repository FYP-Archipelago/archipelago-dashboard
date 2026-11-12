import { afterEach, beforeEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

beforeEach(() => {
  window.localStorage.clear();
  window.history.replaceState(null, '', '#library');
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
