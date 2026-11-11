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

export default function useRunLibrary({ api, storage }) {
  const [backendKey, setBackendKey] = useState(null),
    [entries, setEntries] = useState([]);
  const [error, setError] = useState(''),
    [revision, setRevision] = useState(0),
    [loading, setLoading] = useState(true);
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
    setBackendKey(null);
    setEntries([]);
    setError('');
    setLoading(true);
    Promise.resolve()
      .then(() => (api.identity ? api.identity({ signal: controller.signal }) : api.baseUrl))
      .then((key) => {
        if (!active) return;
        setBackendKey(key);
        setEntries(readRecentRuns(storage, key));
      })
      .catch((reason) => {
        if (active) setError(reason.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [api, storage, revision]);
  useEffect(() => {
    const sync = (event) => {
      if (event.type === 'storage' && event.key !== null && event.key !== HISTORY_KEY) return;
      setEntries(backendKey ? readRecentRuns(storage, backendKey) : []);
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
      if (alive.current) setEntries(next);
      window.dispatchEvent(new window.Event(CHANGED));
      return next;
    },
    [backendKey, storage]
  );
  const remove = useCallback(
    (id) => {
      if (!backendKey) return;
      try {
        setEntries(forgetRun(storage, backendKey, id));
        setError('');
        window.dispatchEvent(new window.Event(CHANGED));
      } catch (reason) {
        setError(reason.message);
      }
    },
    [backendKey, storage]
  );
  return { backendKey, entries, error, loading, remember, remove, retry: () => setRevision((value) => value + 1) };
}
