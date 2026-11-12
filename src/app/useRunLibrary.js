import { useCallback, useEffect, useRef, useState } from 'react';
import { HISTORY_KEY, readRecentRuns, rememberRun, forgetRun } from '../runs/recent-runs.js';

export function browserStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
const CHANGED = 'archipelago:run-history';
const NO_ENTRIES = [];
const withEntries =
  (entries, change = {}) =>
  (previous) =>
    previous && { ...previous, entries, ...change };

export default function useRunLibrary({ api, storage }) {
  const [revision, setRevision] = useState(0);
  const [library, setLibrary] = useState(null);
  const current = library?.api === api && library.storage === storage && library.revision === revision ? library : null;
  const backendKey = current?.backendKey ?? null,
    entries = current?.entries ?? NO_ENTRIES,
    error = current?.error ?? '',
    loading = !current?.loaded;
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const report = (change) => {
      if (!active) return;
      setLibrary((previous) => ({
        ...(previous?.api === api && previous.storage === storage && previous.revision === revision ? previous : { api, storage, revision }),
        ...change,
      }));
    };
    Promise.resolve()
      .then(() => (api.identity ? api.identity({ signal: controller.signal }) : api.baseUrl))
      .then((key) => report({ backendKey: key, entries: readRecentRuns(storage, key) }))
      .catch((reason) => report({ error: reason.message }))
      .finally(() => report({ loaded: true }));
    return () => {
      active = false;
      controller.abort();
    };
  }, [api, storage, revision]);
  useEffect(() => {
    const sync = (event) => {
      if (event.type === 'storage' && event.key !== null && event.key !== HISTORY_KEY) return;
      setLibrary(withEntries(backendKey ? readRecentRuns(storage, backendKey) : []));
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
      if (!backendKey) throw new Error('This browser could not remember the run because the backend identity is unavailable. Keep its run ID.');
      const next = rememberRun(storage, backendKey, entry);
      if (alive.current) setLibrary(withEntries(next));
      window.dispatchEvent(new window.Event(CHANGED));
      return next;
    },
    [backendKey, storage]
  );
  const remove = useCallback(
    (id) => {
      if (!backendKey) return;
      try {
        setLibrary(withEntries(forgetRun(storage, backendKey, id), { error: '' }));
        window.dispatchEvent(new window.Event(CHANGED));
      } catch (reason) {
        setLibrary((previous) => previous && { ...previous, error: reason.message });
      }
    },
    [backendKey, storage]
  );
  return { backendKey, entries, error, loading, remember, remove, retry: () => setRevision((value) => value + 1) };
}
