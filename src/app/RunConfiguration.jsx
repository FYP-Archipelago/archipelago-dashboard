import React from 'react';
const display=value=>value===null?'Automatic':typeof value==='object'?JSON.stringify(value):typeof value==='boolean'?(value?'Enabled':'Disabled'):String(value);
function Fields({values}) {
  return <dl className="configuration-fields">{Object.entries(values).map(([key,value])=><React.Fragment key={key}><dt>{key.replaceAll('_',' ')}</dt><dd>{display(value)}</dd></React.Fragment>)}</dl>;
}
export default function RunConfiguration({configuration,runId}) {
  return <section className="run-configuration">
    <header className="page-head"><h1>Run configuration</h1><p className="question">The settings accepted when this search was started.</p></header>
    <p className="run-reference"><code>{runId}</code></p>
    {!configuration?<div className="notice">No configuration remembered for this run. Runs opened by ID may have been started in another browser. This backend does not provide a run-configuration lookup.</div>:<>
      <div className="configuration-summary"><div><span>Preset</span><strong>{configuration.preset}</strong></div><div><span>Requested display</span><strong>{configuration.stream?'Live updates':'Final result only'}</strong></div></div>
      <section className="configuration-card"><h2>Runner overrides</h2>{Object.keys(configuration.overrides).length?<Fields values={configuration.overrides}/>:<p className="caption">No overrides. The preset's defaults were requested.</p>}</section>
      <section className="configuration-card"><h2>Clustering settings</h2><Fields values={configuration.clustering}/></section>
      <p className="caption">These are the accepted request settings, not run status or computed results. Automatic values are resolved by the backend from the run's data.</p>
    </>}
  </section>;
}
