import { QueryClient, QueryClientProvider, notifyManager } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';

notifyManager.setScheduler(queueMicrotask);

export function renderWithQuery(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  return { ...render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>), client };
}
