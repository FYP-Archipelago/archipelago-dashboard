import React from 'react';
const display=value=>value===null?'Automatic':typeof value==='object'?JSON.stringify(value):typeof value==='boolean'?(value?'Enabled':'Disabled'):String(value);
function Fields({values}) {
  return <dl className="configuration-fields">{Object.entries(values).map(([key,value])=><React.Fragment key={key}><dt>{key.replaceAll('_',' ')}</dt><dd>{display(value)}</dd></React.Fragment>)}</dl>;
}
export default function RunConfiguration({configuration,runId,recorded=false}) {
  return <section className="run-configuration">
    <header className="page-head"><h1>Run configuration</h1><p className="question">{recorded?'Recorded execution and offline clustering parameters.':'Accepted execution and clustering parameters.'}</p></header>
    <p className="run-reference"><code>{runId}</code></p>
    {!configuration?<div className="notice">No configuration remembered for this run. Runs opened by ID may have been started in another browser. This backend does not provide a run-configuration lookup.</div>:<>
      <div className="configuration-summary"><div><span>{recorded?'Recording':'Preset'}</span><strong>{configuration.preset}</strong></div><div><span>{recorded?'Display':'Requested display'}</span><strong>{configuration.stream?'Live updates':'Final result only'}</strong></div></div>
      <section className="configuration-card"><h2>{recorded?'Recorded runner settings':'Runner overrides'}</h2>{Object.keys(configuration.overrides).length?<Fields values={configuration.overrides}/>:<p className="caption">No overrides. The preset's defaults were requested.</p>}</section>
      <section className="configuration-card"><h2>{recorded?'Offline clustering':'Clustering settings'}</h2><Fields values={configuration.clustering}/></section>
      <p className="caption">{recorded?'Runner settings are from the recorded run. Clustering parameters describe the Python export used for this demonstration.':'Accepted request parameters. Data-dependent settings are resolved during backend analysis.'}</p>
    </>}
  </section>;
}
