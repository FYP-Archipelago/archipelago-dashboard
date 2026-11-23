import { useSyncExternalStore } from 'react';

// A run page's tabs in display order; the first is where a run opens.
export const RUN_TABS = ['overview', 'network', 'migration', 'convergence', 'divergence', 'attribution', 'details'] as const;

export type RunTab = (typeof RUN_TABS)[number];

export type Route = { name: 'runs' } | { name: 'new'; sourceId?: string } | { name: 'run'; id: string; tab: RunTab } | { name: 'not-found' };

export const runsHref = '/runs';
export const newRunHref = '/runs/new';
export const rerunHref = (id: string) => `${newRunHref}?${new URLSearchParams({ from: id })}`;
export const runHref = (id: string, tab?: RunTab) => `/runs/${encodeURIComponent(id)}${tab ? `/${tab}` : ''}`;

const isRunTab = (value: string | undefined): value is RunTab => RUN_TABS.includes(value as RunTab);

function parseRoute({ pathname, searchParams }: URL): Route {
  const segments = pathname.split('/').filter(Boolean);
  const [first, second, third] = segments;
  if (first !== 'runs' || segments.length > 3) return { name: 'not-found' };
  if (second === 'new') {
    const sourceId = searchParams.get('from');
    return sourceId ? { name: 'new', sourceId } : { name: 'new' };
  }
  if (second) return { name: 'run', id: decodeURIComponent(second), tab: isRunTab(third) ? third : RUN_TABS[0] };
  return { name: 'runs' };
}

// pushState fires no event of its own, so navigate() announces it for useRoute.
const NAVIGATED = 'archipelago:navigate';

export function navigate(href: string) {
  if (href === window.location.pathname + window.location.search) return;
  window.history.pushState(null, '', href);
  window.dispatchEvent(new Event(NAVIGATED));
}

const subscribe = (onChange: () => void) => {
  window.addEventListener('popstate', onChange);
  window.addEventListener(NAVIGATED, onChange);
  return () => {
    window.removeEventListener('popstate', onChange);
    window.removeEventListener(NAVIGATED, onChange);
  };
};

export function useRoute(): Route {
  return parseRoute(new URL(useSyncExternalStore(subscribe, () => window.location.href)));
}
