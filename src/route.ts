import { useSyncExternalStore } from 'react';

export type Route = { name: 'runs' } | { name: 'new' } | { name: 'run'; id: string };

export const runsHref = '/runs';
export const newRunHref = '/runs/new';
export const runHref = (id: string) => `/runs/${encodeURIComponent(id)}`;

function parseRoute(pathname: string): Route {
  const [first, second] = pathname.split('/').filter(Boolean);
  if (first === 'runs' && second === 'new') return { name: 'new' };
  if (first === 'runs' && second) return { name: 'run', id: decodeURIComponent(second) };
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
  return parseRoute(useSyncExternalStore(subscribe, () => window.location.pathname));
}
