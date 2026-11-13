import React from 'react';

export default function RecordedRunsPage({entries,onOpenRun}) {
  return <section className="runs-page">
    <header className="page-head"><h1>Saved runs</h1><p className="question">Choose a completed search to explore its graph and analysis.</p></header>
    {entries.map(entry=><article className="configuration-card" key={entry.run_id}>
      <h2>{entry.preset}</h2><p className="run-reference"><code>{entry.run_id}</code></p>
      <p className="caption">{new Date(entry.at).toLocaleString()}</p>
      <div className="configuration-summary"><div><span>Islands</span><strong>{entry.configuration?.overrides?.num_islands??'Unavailable'}</strong></div><div><span>Evaluation budget</span><strong>{entry.configuration?.overrides?.evaluation_budget?.toLocaleString()??'Unavailable'}</strong></div></div>
      <button className="primary" onClick={()=>onOpenRun(entry.run_id)}>Open recording</button>
    </article>)}
  </section>;
}
