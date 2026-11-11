import React from 'react';
const VIEWS = {
  migration: ['Migration explorer', 'Exchanges between the selected run’s islands.'],
  convergence: ['Convergence & diversity', 'Search progress for the selected run.'],
  diagnostics: ['Clustering & island separation', 'Clustering statistics, warnings and island separation supplied by the backend.'],
  run: ['Run details', 'Algorithm, benchmark and provenance supplied by the backend.'],
};
export default function AnalysisPlaceholder({ view, runId }) {
  const [title, description] = VIEWS[view];
  return (
    <section className="analysis-placeholder">
      <header className="page-head">
        <h1>{title}</h1>
        <p className="question">{description}</p>
      </header>
      <p className="run-reference">
        <code>{runId}</code>
      </p>
      <div className="notice">No backend result loaded for this view.</div>
      <p className="caption">This view is reserved for the backend visualization integration. Its metrics will come from the backend.</p>
    </section>
  );
}
