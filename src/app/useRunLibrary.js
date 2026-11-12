import { useCallback, useEffect, useState } from 'react';
import { HISTORY_KEY, readRecentRuns, rememberRun, forgetRun } from '../runs/recent-runs.js';

export function browserStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
const CHANGED = 'archipelago:run-history';
const load = (backendKey, storage) => ({ backendKey, storage, entries: readRecentRuns(storage, backendKey), error: '' });
const withEntries =
  (entries, change = {}) =>
  (previous) => ({ ...previous, entries, ...change });

export default function useRunLibrary({ api, storage }) {
  const backendKey = api.baseUrl;
  const [stored, setStored] = useState(() => load(backendKey, storage));
  const library = stored.backendKey === backendKey && stored.storage === storage ? stored : load(backendKey, storage);
  if (library !== stored) setStored(library);
  useEffect(() => {
    const sync = (event) => {
      if (event.type === 'storage' && event.key !== null && event.key !== HISTORY_KEY) return;
      setStored(withEntries(readRecentRuns(storage, backendKey)));
    };
    window.addEventListener('storage', sync);
    window.addEventListener(CHANGED, sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener(CHANGED, sync);
    };
  }, [backendKey, storage]);
  const remember = useCallback(
    (entry) => {
      const next = rememberRun(storage, backendKey, entry);
      setStored(withEntries(next));
      window.dispatchEvent(new window.Event(CHANGED));
      return next;
    },
    [backendKey, storage]
  );
  const remove = useCallback(
    (id) => {
      try {
        setStored(withEntries(forgetRun(storage, backendKey, id), { error: '' }));
        window.dispatchEvent(new window.Event(CHANGED));
      } catch (reason) {
        setStored((previous) => ({ ...previous, error: reason.message }));
      }
    },
    [backendKey, storage]
  );
  return { backendKey, entries: library.entries, error: library.error, remember, remove };
}
