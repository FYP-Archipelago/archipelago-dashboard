import React from 'react';
import useRunSession from './useRunSession.js';
import GraphViewer from './GraphViewer.jsx';
import './run-workspace.css';

const show=value=>value===null||value===undefined?'Unavailable':typeof value==='number'?value.toLocaleString():String(value);
const entries=value=>Object.entries(value||{});
const variance=value=>typeof value==='number'&&Number.isFinite(value)?new Intl.NumberFormat('en',{style:'percent',maximumFractionDigits:2}).format(value):'Unavailable';
const MmdBar=({value,max})=><div className="mmd-bar" title={`MMD squared: ${show(value)}`}><span style={{width:`${Math.max(0,Math.min(100,100*value/(max||1)))}%`}}/><strong>{show(value)}</strong></div>;

function Diagnostics({session}) {
  const clustering=session.clustering;
  const separation=session.result?.separation;
  if(!clustering)return <p className="notice">Clustering diagnostics will appear when the backend sends an update or final result.</p>;
  const counts=clustering.counts||{};
  let maxMmd=0;
  for(const value of [...(separation?.pairs.mmd2||[]),...(separation?.window_pairs.mmd2||[])]) maxMmd=Math.max(maxMmd,value);
  return <>
    <div className="run-cards"><article><h2>Clustering</h2><p>Stages: {clustering.stages?.join(' → ')||'Unavailable'}</p><dl>{entries(counts).map(([key,value])=><React.Fragment key={key}><dt>{key.replaceAll('_',' ')}</dt><dd>{show(value)}</dd></React.Fragment>)}</dl><p>Elapsed: {show(clustering.elapsed_seconds)} seconds</p></article>
    <article><h2>Resolved settings</h2><dl>{entries(clustering.resolved).map(([key,value])=><React.Fragment key={key}><dt>{key.replaceAll('_',' ')}</dt><dd>{show(value)}</dd></React.Fragment>)}</dl></article></div>
    {entries(clustering.diagnostics).map(([stage,details])=><article className="run-card" key={stage}><h2>{stage}</h2><dl>{entries(details).map(([key,value])=><React.Fragment key={key}><dt>{key.replaceAll('_',' ')}</dt><dd>{Array.isArray(value)?value.map(show).join(', '):show(value)}</dd></React.Fragment>)}</dl></article>)}
    <h2>Island separation</h2>
    {!separation?<p className="notice">Island separation is available in the final result.</p>:<>
      <p>MMD distance in genome space. Larger MMD² means greater separation; smaller p values indicate stronger evidence of a difference. Typical distance: {show(separation.typical_distance)}.</p>
      <div className="run-table-wrap"><table><caption>Island pairs across the run</caption><thead><tr><th>Island A</th><th>Island B</th><th>MMD²</th><th>p</th></tr></thead><tbody>{separation.pairs.a.map((a,i)=><tr key={`${a}-${separation.pairs.b[i]}`}><td>{a}</td><td>{separation.pairs.b[i]}</td><td><MmdBar value={separation.pairs.mmd2[i]} max={maxMmd}/></td><td>{show(separation.pairs.p[i])}</td></tr>)}</tbody></table></div>
      {separation.pairs.a.length===0&&<p className="notice">No island pairs were available for comparison.</p>}
      <div className="run-table-wrap"><table><caption>Separation by generation window</caption><thead><tr><th>From generation</th><th>Typical distance</th><th>Island A</th><th>Island B</th><th>MMD²</th></tr></thead><tbody>{separation.window_pairs.window.map((windowIndex,i)=><tr key={`${windowIndex}-${i}`}><td>{show(separation.windows.from_generation[windowIndex])}</td><td>{show(separation.windows.typical_distance[windowIndex])}</td><td>{separation.window_pairs.a[i]}</td><td>{separation.window_pairs.b[i]}</td><td><MmdBar value={separation.window_pairs.mmd2[i]} max={maxMmd}/></td></tr>)}</tbody></table></div>
      {separation.window_pairs.window.length===0&&<p className="notice">No generation window comparisons are available.</p>}
    </>}
  </>;
}

function Migration({session}) {
  const routes=[...session.graph.migrations.values()];
  const nodes=session.graph.nodes;
  return <><p>These are aggregate migration routes in the backend graph. Individual migration times and latencies are not supplied by the current result.</p>
    {routes.length?<div className="run-table-wrap"><table><caption>Migration routes</caption><thead><tr><th>Source node</th><th>Source island</th><th>Arrival node</th><th>Arrival island</th><th>Migrants</th></tr></thead><tbody>{routes.map(route=><tr key={route.id}><td>{route.source}</td><td>{show(nodes.get(route.source)?.island)}</td><td>{route.target}</td><td>{show(nodes.get(route.target)?.island)}</td><td>{show(route.count)}</td></tr>)}</tbody></table></div>:<p className="notice">No migration routes are available yet.</p>}</>;
}

function RunDetails({session,runId}) {
  const run=session.result?.run;
  const layout=session.layout;
  return <><div className="run-card"><h2>Run</h2><dl><dt>Run ID</dt><dd><code>{runId}</code></dd><dt>Status</dt><dd>{session.status}</dd>{run&&entries(run).filter(([key])=>key!=='run_id').map(([key,value])=><React.Fragment key={key}><dt>{key.replaceAll('_',' ')}</dt><dd>{Array.isArray(value)?value.join(', '):show(value)}</dd></React.Fragment>)}<dt>Malformed rows</dt><dd>{show(session.malformedRows)}</dd><dt>Graph overlap</dt><dd>{show(session.graph.overlap)}</dd></dl></div>
    {!run&&<p className="notice">Algorithm, benchmark, and island details arrive with the final backend result.</p>}
    <div className="run-card"><h2>Layout diagnostics</h2><dl><dt>Method</dt><dd>{layout?.method?.toUpperCase()||'Unavailable'}</dd><dt>2D variance retained</dt><dd>{variance(layout?.variance_kept_2d)}</dd><dt>3D variance retained</dt><dd>{variance(layout?.variance_kept_3d)}</dd></dl></div>
    <h2>Warnings</h2>{session.warnings.length?<ul>{session.warnings.map((warning,i)=><li key={i}>{warning}</li>)}</ul>:<p>No warnings reported.</p>}
  </>;
}

export default function RunWorkspace({runId,api,onBack,warning='',view='archipelago',eventSourceFactory}) {
  const session=useRunSession({runId,api,eventSourceFactory});
  const titles={archipelago:'Archipelago',migration:'Migration',convergence:'Convergence',diagnostics:'Clustering',run:'Run details'};
  const best=[...session.graph.nodes.values()].find(node=>node.overall_best)?.best_fitness;
  const run=session.result?.run;
  const islands=run?.islands?.length??new Set([...session.graph.nodes.values()].map(node=>node.island)).size;
  const evaluations=session.clustering?.counts?.evaluations;
  return <section className="backend-run-workspace" aria-label="Selected backend run">
    <button className="run-back" type="button" onClick={onBack}>← Back to Runs</button>
    <header className="page-head"><h1>{titles[view]||'Archipelago'}</h1><p className="question">{view==='archipelago'?'Clustered search trajectories and inter-island migration.':<>{api.isDemo?'Recorded run':'Backend run'} <code>{runId}</code></>}</p>{view==='archipelago'&&<><div className="run-facts-inline"><span>Islands {islands||'—'}</span><span>Evaluations {show(evaluations)}</span><span>Goal {run?run.maximising?'Maximise':'Minimise':'—'}</span><span>Best {show(best)}</span></div><details className="reading"><summary>Graph representation and controls</summary><div className="deck">Nodes represent evaluation clusters; edges encode aggregated trajectories and migration. Controls filter islands and paths, select height metrics and identify best-fitness clusters. Select a node for cluster attributes. Camera: drag to rotate, scroll to zoom.</div></details></>}</header>
    {warning&&<div className="notice" role="status">{warning}</div>}
    <div className="run-status" role="status"><strong>Status: {session.status.replaceAll('_',' ')}</strong><span>{api.isDemo?'Source: saved result':`Events: ${session.connection}`}</span>{session.result&&<span>{api.isDemo?'Recorded result loaded':'Final result loaded'}</span>}{session.status==='done'&&!session.result&&session.connection==='loading result'&&<span>Loading final result…</span>}{['queued','running','clustering','warming_up','live'].includes(session.status)&&<button className="secondary" type="button" disabled={session.cancelPending} onClick={session.cancelRun}>{session.cancelPending?'Cancelling…':'Cancel run'}</button>}</div>
    {session.cancelError&&<div className="notice run-error" role="alert">Cancellation request failed: {session.cancelError}</div>}
    {session.cancelNotice&&<div className="notice" role="status">{session.cancelNotice}</div>}
    {session.error&&<div className="notice run-error" role="alert">{session.error} <button className="secondary" type="button" onClick={session.retry}>Retry connection</button></div>}
    {view==='archipelago'&&<GraphViewer graph={session.graph} runId={runId} canReplay={session.status==='done'}/>}
    {view==='migration'&&<Migration session={session}/>}
    {view==='convergence'&&<p className="notice">The backend does not provide a fitness-over-generation time series. Inspect the graph's current best fitness and node details instead.</p>}
    {view==='diagnostics'&&<Diagnostics session={session}/>}
    {view==='run'&&<RunDetails session={session} runId={runId}/>}
  </section>;
}
