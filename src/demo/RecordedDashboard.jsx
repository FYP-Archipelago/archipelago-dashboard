import React, { useEffect, useState } from 'react';
import DashboardApp from '../app/DashboardApp.jsx';
import { recordedApi, recordingStorage } from './recorded-api.js';

export default function RecordedDashboard({ api = recordedApi, Workspace }) {
  const [state, setState] = useState(null),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    Promise.all([api.recordings({ signal: controller.signal }), api.identity()])
      .then(([entries, identity]) => {
        if (active) setState({ api, retry, storage: recordingStorage(entries, identity), error: '' });
      })
      .catch((error) => {
        if (active) setState({ api, retry, storage: null, error: error.message });
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [api, retry]);
  const loaded = state?.api === api && state.retry === retry ? state : null;
  if (loaded?.storage) return <DashboardApp api={api} storage={loaded.storage} Workspace={Workspace} />;
  return (
    <main className="workspace-main">
      <h1>Archipelago</h1>
      {loaded?.error ? (
        <div className="notice" role="alert">
          {loaded.error}{' '}
          <button className="secondary" onClick={() => setRetry((value) => value + 1)}>
            Retry
          </button>
        </div>
      ) : (
        <p role="status">Loading saved recordings…</p>
      )}
    </main>
  );
}
