import React from 'react';
import useRunSession from './useRunSession.js';
import GraphViewer from './GraphViewer.jsx';
import MigrationOverview from './MigrationOverview.jsx';
import RecordedConvergence from '../demo/RecordedConvergence.jsx';
import RunConfiguration from '../app/RunConfiguration.jsx';
import {runValueLabel} from '../runs/run-form.js';
import {acceptedConfiguration} from '../runs/recent-runs.js';
import {formatFitness} from './format-fitness.js';
import './run-workspace.css';

const show=value=>value===null||value===undefined?'Unavailable':typeof value==='number'?value.toLocaleString():String(value);
const entries=value=>Object.entries(value||{});
const variance=value=>typeof value==='number'&&Number.isFinite(value)?new Intl.NumberFormat('en',{style:'percent',maximumFractionDigits:2}).format(value):'Unavailable';
const exact=value=>value===null||value===undefined?'Unavailable':String(value);
const pairKey=(a,b)=>`${Math.min(a,b)}:${Math.max(a,b)}`;
const STAGES={lsh:'LSH',birch:'BIRCH',denstream:'DenStream'};
const STAGE_SETTINGS={lsh:[['Family','family'],['Bucket width','lsh_bucket_width']],birch:[['Threshold','birch_threshold']],denstream:[['Epsilon','denstream_epsilon'],['Half life','denstream_half_life']]};
const STAGE_SETTING_KEYS={lsh:new Set(['family','bucket_width']),birch:new Set(['threshold']),denstream:new Set(['epsilon','half_life'])};
const displayMetric=value=>typeof value==='number'&&Number.isInteger(value)?show(value):exact(value);

function StageRunValues({stage,values}) {
  const rows=entries(values).filter(([key])=>!STAGE_SETTING_KEYS[stage]?.has(key));
  if(!rows.length)return null;
  return <article className="stage-run-values"><h3>{STAGES[stage]||stage.toUpperCase()} run values</h3><dl>{rows.map(([key,value])=><div className="metric-row" key={key}><dt>{key.replaceAll('_',' ')}</dt><dd>{Array.isArray(value)?<span className="metric-series">{value.map((item,i)=><span key={i}>{displayMetric(item)}</span>)}</span>:displayMetric(value)}</dd></div>)}</dl></article>;
}

function ComparisonMatrix({islands,pairs,selected,onSelect,label}) {
  const byPair=new Map(pairs.map(pair=>[pairKey(pair.a,pair.b),pair]));
  const max=Math.max(0,...pairs.map(pair=>pair.value));
  return <div className="comparison-matrix" role="group" aria-label={label} style={{'--island-count':islands.length}}>
    <span className="matrix-axis-corner" aria-hidden="true">Island</span>
    {islands.map(island=><span className="matrix-axis" key={`column-${island}`}>{island}</span>)}
    {islands.map(a=><React.Fragment key={`row-${a}`}><span className="matrix-axis">{a}</span>
      {islands.map(b=>{
        const key=pairKey(a,b),pair=byPair.get(key);
        if(a===b)return <span className="matrix-diagonal" key={b} aria-label={`Island ${a} compared with itself`}>—</span>;
        if(!pair)return <span className="matrix-missing" key={b} aria-label={`No comparison for islands ${a} and ${b}`}>·</span>;
        const intensity=max>0?pair.value/max:0;
        return <button className={`matrix-cell${selected===key?' selected':''}`} key={b} type="button" aria-pressed={selected===key} aria-label={`Island ${a} and island ${b}: MMD squared ${exact(pair.value)}${pair.p===undefined?'':`, p value ${exact(pair.p)}`}`} style={{'--heat-opacity':0.5*intensity}} onClick={()=>onSelect(key)}><span className="matrix-fill" aria-hidden="true"/><span className="matrix-value">{pair.value===0?'0':pair.value.toPrecision(2)}</span></button>;
      })}</React.Fragment>)}
  </div>;
}

function SeparationVisuals({separation,islands,pairs,leftCards,rightCards}) {
  const [windowIndex,setWindowIndex]=React.useState(0);
  const [wholeKey,setWholeKey]=React.useState(null);
  const [windowKey,setWindowKey]=React.useState(null);
  const windows=separation.windows.from_generation;
  const activeWindow=Math.min(windowIndex,Math.max(0,windows.length-1));
  const windowPairs=separation.window_pairs.window.flatMap((index,i)=>index===activeWindow?[{a:separation.window_pairs.a[i],b:separation.window_pairs.b[i],value:separation.window_pairs.mmd2[i]}]:[]);
  const wholeSelected=pairs.find(pair=>pairKey(pair.a,pair.b)===wholeKey)||pairs[0];
  const windowSelected=windowPairs.find(pair=>pairKey(pair.a,pair.b)===windowKey)||windowPairs[0];
  const changeWindow=index=>{setWindowIndex(index);setWindowKey(null);};
  return <div className="separation-visuals">
    <div className="metric-column">
    {leftCards}
    <section className="separation-panel" aria-label="Whole-run island comparisons">
      <h3>Whole run</h3>
      <div className="matrix-toolbar matrix-legend" aria-label="Colour scale from lower to higher MMD squared"><span className="matrix-scale-label">MMD² colour scale</span><span className="matrix-gradient" aria-hidden="true"/><div className="matrix-scale-ends"><span>Lower</span><span>Higher</span></div></div>
      {pairs.length?<><ComparisonMatrix islands={islands} pairs={pairs} selected={pairKey(wholeSelected.a,wholeSelected.b)} onSelect={setWholeKey} label="Whole-run island separation matrix"/>
        <div className="matrix-selection" role="status"><strong>Island {wholeSelected.a} ↔ Island {wholeSelected.b}</strong><span>MMD² <b>{exact(wholeSelected.value)}</b></span><span>p value <b>{exact(wholeSelected.p)}</b></span></div>
      </>:<p className="notice">No island pairs were available for comparison.</p>}
      <p className="matrix-note">Larger MMD² indicates more distinct distributions of candidate positions.</p>
    </section>
    </div>
    <div className="metric-column">
    {rightCards}
    <section className="separation-panel" aria-label="Generation-window island comparisons">
      <h3>Generation window</h3>
      {windows.length?<><div className="matrix-toolbar window-toolbar"><div className="window-navigation"><button className="secondary" type="button" disabled={activeWindow===0} onClick={()=>changeWindow(activeWindow-1)}>← Previous</button><span>Generation <strong>{show(windows[activeWindow])}</strong><small>Window {activeWindow+1} of {windows.length}</small></span><button className="secondary" type="button" disabled={activeWindow===windows.length-1} onClick={()=>changeWindow(activeWindow+1)}>Next →</button></div>
        <input id="separation-window" className="window-slider" type="range" min="0" max={windows.length-1} value={activeWindow} disabled={windows.length===1} onChange={event=>changeWindow(Number(event.target.value))} aria-label="Generation window"/></div>
        {windowPairs.length?<><ComparisonMatrix islands={islands} pairs={windowPairs} selected={pairKey(windowSelected.a,windowSelected.b)} onSelect={setWindowKey} label={`Island separation matrix from generation ${windows[activeWindow]}`}/>
          <div className="matrix-selection" role="status"><strong>Island {windowSelected.a} ↔ Island {windowSelected.b}</strong><span>MMD² <b>{exact(windowSelected.value)}</b></span><span>Typical distance <b>{exact(separation.windows.typical_distance[activeWindow])}</b></span></div>
        </>:<p className="notice">No island pairs were compared in this window.</p>}</>:<p className="notice">No generation window comparisons are available.</p>}
      <p className="matrix-note">Each window has its own colour scale.</p>
    </section>
    </div>
  </div>;
}

function Diagnostics({session}) {
  const clustering=session.clustering;
  const separation=session.result?.separation;
  if(!clustering)return <p className="notice">Clustering metrics will appear when the backend sends an update or final result.</p>;
  const counts=clustering.counts||{};
  const pairs=separation?.pairs.a.map((a,i)=>({a,b:separation.pairs.b[i],value:separation.pairs.mmd2[i],p:separation.pairs.p[i]}))||[];
  const stageCards=entries(clustering.diagnostics).filter(([stage,details])=>entries(details).some(([key])=>!STAGE_SETTING_KEYS[stage]?.has(key))).map(([stage,details])=><StageRunValues key={stage} stage={stage} values={details}/>);
  return <>
    <div className="clustering-overview">
      <div className="clustering-summary" aria-label="Clustering summary">
        <article><span>Evaluations</span><strong>{show(counts.evaluations)}</strong></article>
        <article><span>Graph nodes</span><strong>{show(counts.nodes)}</strong></article>
      </div>
    </div>
    <section className="clustering-section clustering-pipeline" aria-label="Clustering stages"><h2>Clustering stages and settings</h2>
      {clustering.stages?.length?<ol className="clustering-stages">{clustering.stages.map((stage,i)=>{
        const settings=(STAGE_SETTINGS[stage]||[]).map(([label,key])=>[label,key==='family'?clustering.diagnostics?.[stage]?.family:clustering.resolved?.[key]]).filter(([,value])=>value!==null&&value!==undefined);
        return <li key={`${stage}-${i}`}><div className="stage-heading"><span className="stage-number">{i+1}</span><strong>{STAGES[stage]||stage.toUpperCase()}</strong></div>{settings.length>0&&<dl>{settings.map(([label,value])=><React.Fragment key={label}><dt>{label}</dt><dd>{exact(value)}</dd></React.Fragment>)}</dl>}</li>;
      })}</ol>:<p className="notice">Stage information unavailable.</p>}
    </section>
    <section className="clustering-technical" aria-label="Clustering metrics"><h2>Clustering metrics</h2>
      <div className="clustering-counts" aria-label="Run totals">{entries(counts).filter(([key])=>key!=='evaluations'&&key!=='nodes').map(([key,value])=><div key={key}><span>{key.replaceAll('_',' ')}</span><strong>{displayMetric(value)}</strong></div>)}<div><span>Elapsed time</span><strong>{typeof clustering.elapsed_seconds==='number'?`${clustering.elapsed_seconds.toFixed(2)} s`:'Unavailable'}</strong></div></div>
      {separation?<SeparationVisuals key={session.runId} separation={separation} islands={session.result.run.islands} pairs={pairs} leftCards={stageCards.filter((_,i)=>i%2===0)} rightCards={stageCards.filter((_,i)=>i%2===1)}/>:<><div className="clustering-technical-cards">{stageCards}</div><p className="notice">Island separation is available in the final result.</p></>}
    </section>
  </>;
}

function RunDetails({session, configuration, api}) {
  const recorded = api.isDemo;
  const runId = session.runId;
  const [lookup, setLookup] = React.useState(null);
  const canFetch = !recorded && !configuration && typeof api.run === 'function';
  React.useEffect(() => {
    if (!canFetch) return;
    const controller = new AbortController();
    const request = { runId, api };
    api.run(runId, {signal: controller.signal}).then(response => {
      if (controller.signal.aborted) return;
      const settings = response?.run_id === runId ? acceptedConfiguration(response) : undefined;
      setLookup({...request, settings});
    }).catch(() => {
      if (!controller.signal.aborted) setLookup(request);
    });
    return () => controller.abort();
  }, [api, canFetch, runId]);
  const fetched = lookup?.runId === runId && lookup.api === api ? lookup : null;
  const notice = canFetch && (fetched ? 'Run settings are unavailable from the backend.' : 'Loading accepted run settings…');
  const run=session.result?.run;
  const layout=session.layout;
  const counts=session.clustering?.counts;
  const best=[...session.graph.nodes.values()].find(node=>node.overall_best)?.best_fitness;
  const number=value=>value==null?'—':new Intl.NumberFormat('en',{maximumSignificantDigits:21,notation:'standard'}).format(value);
  return <div className="run-overview">
    {run&&<dl className="run-identity" aria-label="Execution">
      <div className="run-algorithm"><dt>Algorithm</dt><dd><span className="algorithm-badge">{run.algorithm.toUpperCase()}</span></dd></div>
      <div><dt>Benchmark</dt><dd>{runValueLabel(run.benchmark)}</dd></div>
      <div><dt>Topology</dt><dd>{run.migration_topology?runValueLabel(run.migration_topology):'—'}</dd></div>
      <div><dt>Islands</dt><dd>{run.islands.join(', ')}</dd></div>
    </dl>}
    <dl className="run-outcomes" aria-label="Run results">
      <div><dt>Evaluations</dt><dd>{number(counts?.evaluations)}</dd></div>
      <div><dt>Clusters</dt><dd>{number(counts?.nodes)}</dd></div>
      <div><dt>Best fitness</dt><dd>{number(best)}</dd></div>
      <div><dt>Clustering time</dt><dd>{session.clustering?.elapsed_seconds==null?'—':session.clustering.elapsed_seconds.toLocaleString('en',{minimumFractionDigits:3,maximumFractionDigits:3,roundingMode:'trunc'})}{session.clustering?.elapsed_seconds!=null&&<small> s</small>}</dd></div>
    </dl>
    <RunConfiguration configuration={configuration || fetched?.settings} recorded={recorded} notice={notice}/>
    <details className="run-technical"><summary>Diagnostics <span>{session.warnings.length} warnings</span></summary>
      <div className="run-technical-columns">
        <section><h2>Layout</h2><dl><dt>Method</dt><dd>{layout?.method?.toUpperCase()||'—'}</dd><dt>2D variance retained</dt><dd>{layout?variance(layout.variance_kept_2d):'—'}</dd><dt>3D variance retained</dt><dd>{layout?variance(layout.variance_kept_3d):'—'}</dd><dt>Graph overlap</dt><dd>{session.clustering?number(session.graph.overlap):'—'}</dd><dt>Malformed rows</dt><dd>{session.clustering?number(session.malformedRows):'—'}</dd></dl></section>
        <section><h2>Execution metadata</h2><dl>{run?entries(run).filter(([key])=>!['run_id','algorithm','benchmark','migration_topology','islands'].includes(key)).map(([key,value])=><React.Fragment key={key}><dt>{key==='maximising'?'Objective':key.replaceAll('_',' ')}</dt><dd>{key==='maximising'?(value?'Maximum':'Minimum'):Array.isArray(value)?value.join(', '):show(value)}</dd></React.Fragment>):<><dt>Metadata</dt><dd>Pending</dd></>}</dl></section>
      </div>
    </details>
    {session.warnings.length>0&&<div className="run-warning-list" role="status"><h2>Warnings</h2><ul>{session.warnings.map((warning,i)=><li key={i}>{warning}</li>)}</ul></div>}
  </div>;
}

export default function RunWorkspace({runId,api,onBack,warning='',view='archipelago',eventSourceFactory,configuration}) {
  const session=useRunSession({runId,api,eventSourceFactory});
  const titles={archipelago:'Archipelago',migration:'Migration',convergence:'Convergence',diagnostics:'Clustering',run:'Run configurations'};
  const best=[...session.graph.nodes.values()].find(node=>node.overall_best)?.best_fitness;
  const run=session.result?.run;
  const islands=run?.islands?.length??new Set([...session.graph.nodes.values()].map(node=>node.island)).size;
  const evaluations=session.clustering?.counts?.evaluations;
  return <section className="backend-run-workspace" aria-label="Selected backend run">
    {view!=='diagnostics'&&<button className="run-back" type="button" onClick={onBack}>← Back to Runs</button>}
    <header className="page-head"><h1>{titles[view]||'Archipelago'}</h1>{view!=='archipelago'&&<p className="question">{api.isDemo?'Recorded run':'Backend run'} <code>{runId}</code></p>}{view==='diagnostics'&&<button className="run-back" type="button" onClick={onBack}>← Back to Runs</button>}{view==='archipelago'&&<><div className="run-facts-inline"><span>Islands {islands||'—'}</span><span>Evaluations {show(evaluations)}</span><span>Goal {run?run.maximising?'Maximise':'Minimise':'—'}</span><span>Best {best==null?'Unavailable':formatFitness(best)}</span></div><details className="reading"><summary>Graph representation and controls</summary><div className="deck">Nodes represent evaluation clusters; edges encode aggregated trajectories and migration. Controls filter islands and paths, select height metrics and identify best-fitness clusters. Fitness height uses each cluster’s best fitness; mean fitness percentile is a separate option. Equal fitness has equal world height; camera angle affects screen position. Select a node for cluster attributes. Camera: drag to rotate, scroll to zoom.</div></details></>}
      <div className="run-status" role="status"><strong>Status: {session.status.replaceAll('_',' ')}</strong><span>{api.isDemo?'Source: saved result':`Events: ${session.connection}`}</span>{session.result&&<span>{api.isDemo?'Recorded result loaded':'Final result loaded'}</span>}{session.status==='done'&&!session.result&&session.connection==='loading result'&&<span>Loading final result…</span>}{['queued','running','clustering','warming_up','live'].includes(session.status)&&<button className="secondary" type="button" disabled={session.cancelPending} onClick={session.cancelRun}>{session.cancelPending?'Cancelling…':'Cancel run'}</button>}</div>
    </header>
    {warning&&<div className="notice" role="status">{warning}</div>}
    {session.cancelError&&<div className="notice run-error" role="alert">Cancellation request failed: {session.cancelError}</div>}
    {session.cancelNotice&&<div className="notice" role="status">{session.cancelNotice}</div>}
    {session.error&&<div className="notice run-error" role="alert">{session.error} <button className="secondary" type="button" onClick={session.retry}>Retry connection</button></div>}
    {view==='archipelago'&&<GraphViewer graph={session.graph} runId={runId} maximising={run?.maximising} canReplay={session.status==='done'}/>}
    {view==='migration'&&<MigrationOverview session={session}/>}
    {view==='convergence'&&<RecordedConvergence key={runId} runId={runId} api={api} backend={!api.isDemo} result={session.result}/>}
    {view==='diagnostics'&&<Diagnostics session={session}/>}
    {view==='run'&&<RunDetails key={runId} session={session} configuration={configuration} api={api}/>}
  </section>;
}
