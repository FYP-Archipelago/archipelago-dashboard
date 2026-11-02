import React from 'react';

// Person 2's integration point. Replace this boundary with status + result +
// graph rendering; keep the runId prop and use the shared api client.
export default function RunWorkspace({runId, api, onBack, warning=''}) {
  return <section className="backend-run-workspace" aria-label="Selected backend run">
    <header className="page-head"><h1>Archipelago</h1><p className="question">Your selected backend run.</p></header>
    <h3>Run ID</h3><p className="backend-run-id"><code>{runId}</code></p>
    {warning && <div className="notice" role="status">{warning}</div>}
    <div className="notice">The live viewer is not available in this workspace yet. Keep this run ID to return to the run.</div>
    <p className="caption">This page's address retains the run ID when you refresh or share it with someone using the same backend.</p>
    <button className="primary" type="button" onClick={onBack}>Back to Runs</button>
  </section>;
}
