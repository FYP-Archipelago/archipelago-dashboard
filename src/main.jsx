import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import Plotly from 'plotly.js-dist-min';
import { mountViewer, mountStudy } from './viewer.js';
import { STUDY_DATASETS } from './viewer/study-data.js';
import RunsPage from './runs/RunsPage.jsx';
import LocalRuns from './runs/LocalRuns.jsx';
import RunWorkspace from './backend/RunWorkspace.jsx';
import { backendApi } from './backend/api.js';
import { readRoute, runHash, localRunHash } from './runs/navigation.js';
import './style.css';
import './designs.css';
import './viewer/stn-viewer.css';


const token = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const C = { deep:token('--panel'), rule:token('--line'), ink:token('--ink'), soft:token('--soft'), faint:token('--faint'), mig:token('--mig'), best:token('--best'), islands:['--i0','--i1','--i2','--i3','--i4'].map(token) };
const fmt = n => Number(n || 0).toLocaleString();
const num = (n, digits=2) => Number.isFinite(Number(n)) ? Number(n).toFixed(digits) : '—';
const median = values => { const a = values.filter(Number.isFinite).sort((x,y)=>x-y); return a.length ? (a[Math.floor((a.length-1)/2)] + a[Math.floor(a.length/2)])/2 : null; };
const api = async (url, options) => { const r = await fetch(`/api${url}`, options); const v = await r.json(); if (!r.ok) throw Error(v.error || `HTTP ${r.status}`); return v; };

function Header({ eyebrow, title, question, children }) { return <header className="page-head"><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="question">{question}</p><details className="reading"><summary>How to read this</summary><div className="deck">{children}</div></details></header>; }
function Caption({ children }) { return <p className="caption">{children}</p>; }
function Metrics({ values }) { return <div className="metrics">{values.map(([label,value,detail])=><div className="metric" key={label}><div className="metric-label">{label}</div><div className="metric-value">{value}</div>{detail&&<div className="metric-detail">{detail}</div>}</div>)}</div>; }
function Table({ rows, columns, height=340 }) { return <div className="table-wrap" style={{maxHeight:height}}><table><thead><tr>{columns.map(c=><th key={c}>{c}</th>)}</tr></thead><tbody>{rows.map((r,i)=><tr key={i}>{columns.map(c=><td key={c}>{r[c] === null || r[c] === undefined ? '—' : String(r[c])}</td>)}</tr>)}</tbody></table></div>; }
function Chart({ data, layout, height=340 }) { const ref=useRef(); useEffect(()=>{ const el=ref.current; if(!el) return; Plotly.react(el,data,{...layout,paper_bgcolor:C.deep,plot_bgcolor:C.deep,font:{family:'Archivo, sans-serif',color:C.soft,size:12},title:{text:layout.title,font:{color:C.ink,size:14},x:0.02},xaxis:{gridcolor:C.rule,zeroline:false,linecolor:C.rule,tickfont:{color:C.faint},...layout.xaxis},yaxis:{gridcolor:C.rule,zeroline:false,linecolor:C.rule,tickfont:{color:C.faint},...layout.yaxis},margin:layout.margin||{l:56,r:16,t:56,b:44},height},{responsive:true,displaylogo:false}); return ()=>Plotly.purge(el); },[data,layout,height]); return <div className="chart" ref={ref}/>; }
function Notice({ children, type='info' }) { return <div className={`notice ${type}`}>{children}</div>; }
function Details({ title, children }) { return <details><summary>{title}</summary><div className="details-body">{children}</div></details>; }
const VIEWS = [['overview','Overview','Every island together, as the search happened'],['islands','By island','Each island on its own, without migration'],['migration','Migration only','Just the exchanges between islands'],['shared','Shared ground','Mark the clusters more than one island reached'],['best','Best solution','Move to the best solution and show its details']];
const setControl = (id,on) => { const b=document.getElementById(id); if(b&&(b.getAttribute('aria-pressed')==='true')!==on) b.click(); };
const clickAll = selector => document.querySelectorAll(selector).forEach(b=>b.click());
function showView(id) {
  const close=document.getElementById('ins-x'); if(close&&!close.hidden) close.click();
  setControl('b-group',id==='islands'||id==='migration'); setControl('t-edges',id!=='migration'); setControl('mig-all',id!=='islands'); setControl('contest',id==='shared');
  const filter=document.getElementById('s-wt'); filter.value=id==='islands'?1:filter.defaultValue; filter.dispatchEvent(new Event('input',{bubbles:true}));
  if(id==='overview') document.getElementById('reset')?.click();
  if(id==='best') document.querySelector('#bests .icn.dia')?.closest('button')?.click();
}
function resetAll() {
  showView('overview');
  clickAll('#islands button[aria-pressed=false],#routes button[aria-pressed=false]');
  [['b-isl',true],['b-run',true],['b-sel',true]].forEach(([id,on])=>setControl(id,on));
  const multi=document.getElementById('s-exr')?.defaultValue!=='0'; setControl('c-run',multi); setControl('c-isl',!multi);
  document.getElementById('z-fit')?.click();
  document.querySelectorAll('.rail input[type=range]').forEach(r=>{ if(r.value!==r.defaultValue){ r.value=r.defaultValue; r.dispatchEvent(new Event('input',{bubbles:true})); } });
}
function syncLegend() {
  const chips=document.querySelectorAll('#islands button');
  document.querySelectorAll('#legend span').forEach(s=>{ const n=s.textContent.match(/^Island (\d+)/); if(!n) return; const chip=[...chips].find(c=>c.textContent.trim()===n[1]); s.classList.add('toggle'); s.classList.toggle('off',chip?.getAttribute('aria-pressed')==='false'); });
}
function Viewer({ mount }) {
  const ref=useRef(), driving=useRef(false), [view,setView]=useState('overview'), [changed,setChanged]=useState(false);
  useEffect(()=>{ if(!mount || !ref.current) return; setView('overview'); setChanged(false); const viewer=mount(ref.current); const tick=setInterval(syncLegend,500); return ()=>{ clearInterval(tick); viewer?.destroy(); }; },[mount]);
  const drive=fn=>{ driving.current=true; fn(); driving.current=false; syncLegend(); };
  const pick=id=>{ drive(()=>showView(id)); setView(id); };
  const reset=()=>{ drive(resetAll); setView('overview'); setChanged(false); };
  useEffect(()=>{ const onKey=e=>{ if(e.ctrlKey||e.metaKey||e.altKey||e.target.closest('input,select,textarea')) return; const key=e.key.toLowerCase();
    if(key==='b') pick('best'); else if(key==='r') reset(); else if(key==='s') document.getElementById('save-img')?.click(); else if(key==='escape') document.getElementById('ins-x')?.click(); else if(key==='?') document.getElementById('rail-help')?.click(); };
    window.addEventListener('keydown',onKey); return ()=>window.removeEventListener('keydown',onKey); },[]);
  const manual=e=>{ if(driving.current) return; const control=e.target.closest('.rail button,.rail input[type=range]'); if(!control) return; if(control.id==='reset') return; if(['b-group','t-edges','mig-all'].includes(control.id)) setView(null); setChanged(true); };
  const click=e=>{ if(e.target.closest('#reset')&&!driving.current) return reset(); const entry=e.target.closest('#legend span.toggle'); if(entry){ const n=entry.textContent.match(/^Island (\d+)/)[1]; [...document.querySelectorAll('#islands button')].find(c=>c.textContent.trim()===n)?.click(); } syncLegend(); };
  return <div className="viewer-frame" onClickCapture={manual} onInputCapture={manual} onClick={click}><div className="views"><div className="view-tabs" role="group" aria-label="Choose a view">{VIEWS.map(([id,label,hint])=><button key={id} title={hint} aria-pressed={view===id} onClick={()=>pick(id)}>{label}</button>)}</div>{changed&&<button className="adjust" onClick={reset}>Reset all</button>}</div><p className="canvas-hint">Drag to rotate · Scroll to zoom · Click a node for details</p><div className="viewer-host" ref={ref}/></div>;
}

function Archipelago({ run, level, selectedResult, results, setSelectedResult }) {
  const [payload,setPayload]=useState(null), [error,setError]=useState(''), mount=useMemo(()=>payload&&(element=>mountViewer(element,payload)),[payload]);
  useEffect(()=>{ let active=true; setPayload(null); setError(''); api(`/runs/${encodeURIComponent(run.id)}/payload${level==='clustered'&&selectedResult ? `?result=${encodeURIComponent(selectedResult)}`:''}`).then(p=>{if(active){if(!p) setError('No decodable genomes in this run — nothing to place.'); else setPayload({...p,level_note:level==='clustered'&&selectedResult?'Clustered · '+(results.find(r=>r.id===selectedResult)?.stages||[]).join(' → '):'Level 0 · raw trajectory',level_warn:level==='clustered'&&!selectedResult});}}).catch(e=>{if(active)setError(e.message);}); return ()=>{active=false;}; },[run.id,selectedResult,level,results]);
  return <><Header eyebrow="The search" title="Archipelago" question="Where did each island search, and what did migration change?"><p>Every location the run actually visited, with height standing for fitness — so convergence reads as descent and a stalled island reads as one that never gets down. Trajectory edges are within-island lineage; anything crossing between islands is a migration.</p><p>It opens merged, every island where the search actually put it. Click any node to read the cluster behind it. Pull <b>Separate islands</b> right to pull the islands into their own funnels; the clusters that split apart were the contested ones. Position is a shared 2D projection of the genome space, fitted once over the whole run.</p>{payload&&<p>This projection keeps <b>{(payload.variance_kept*100).toFixed(0)}%</b> of the genome-space variance in its two planar components, so nearby on screen does not always mean nearby in the search space.</p>}</Header>
    {level==='clustered'&&<div className="result-picker"><label>Clustering result</label>{results.length?<select value={selectedResult||results[0].id} onChange={e=>setSelectedResult(e.target.value)}>{results.map(r=><option key={r.id} value={r.id}>{r.stages.join(' → ')||'Level 0'} · {fmt(r.response?.counts?.nodes)} nodes ({r.at})</option>)}</select>:<Notice>No clustering result for this run. Run clustering on the Runs page.</Notice>}</div>}
    {error&&<Notice type="error">{error}</Notice>}{!payload&&!error&&<Notice>Preparing the viewer stream…</Notice>}{mount&&<Viewer mount={mount}/>}</>;
}

function Study() {
  const [ds,setDs]=useState(STUDY_DATASETS[0]), mount=useCallback(element=>mountStudy(element,ds),[ds]);
  return <><Header eyebrow="The study" title="Scale study" question="Does this view still read at 400,000 evaluations, with more islands or many runs?"><p>The same viewer as the Archipelago page, on generated data. Islands search a shared 36-basin landscape and exchange elites on a ring. The structure is fabricated; the node counts and the rendering are real.</p><p>Islands converge on the same basins, so they overlap more as a run proceeds. That is why separating them is a control you drag and not a fixed layout: a cluster that splits as you drag was contested, and one that slides intact belonged to a single island.</p><p>With several runs, colour carries the run and position carries the island. A region several runs found loses its single hue, so pale means reproducible and saturated means one run's own find.</p></Header>
    <div className="study-bar"><div className="view-tabs" role="group" aria-label="Choose a dataset">{STUDY_DATASETS.map(d=><button key={d.id} title={d.detail} aria-pressed={d===ds} onClick={()=>setDs(d)}>{d.label}</button>)}</div><span className="synthetic">Synthetic data</span><span className="study-detail">{ds.detail}, generated in your browser</span></div>
    <Viewer mount={mount}/></>;
}

function Migration({ run }) {
  const frame=run.migrations, islands=run.islands;
  if(!frame.length) return <><Header eyebrow="The search" title="Migration explorer" question="Who moved between islands, and did they arrive?">Every individual that crossed between islands: where it went, how long it took, and whether it arrived at all.</Header><Notice>No migration events in this run.</Notice></>;
  const delivered=frame.filter(r=>r.delivered).length, lat=median(frame.filter(r=>r.latency_seconds!=null).map(r=>Number(r.latency_seconds))), drift=median(frame.filter(r=>r.generational_drift!=null).map(r=>Number(r.generational_drift)));
  const grid=islands.map(source=>islands.map(dest=>frame.filter(r=>r.source_island===source&&r.dest_island===dest).reduce((n,r)=>n+Number(r.num_migrants||0),0)));
  return <><Header eyebrow="The search" title="Migration explorer" question="Who moved between islands, and did they arrive?">Every individual that crossed between islands: where it went, how long it took, and whether it arrived at all.</Header>
    <Metrics values={[["Migration events",fmt(frame.length)],["Individuals moved",fmt(frame.reduce((n,r)=>n+Number(r.num_migrants||0),0))],["Individuals arrived",fmt(frame.filter(r=>r.delivered).reduce((n,r)=>n+Number(r.num_migrants||0),0))],["Events delivered",fmt(delivered),delivered<frame.length?`-${frame.length-delivered} undelivered`:null],["Median latency",lat===null?'—':`${num(lat*1000,0)} ms`],["Median drift",drift===null?'—':`${num(drift,0)} gen`]]}/>
    {delivered<frame.length&&<Caption><b>{frame.length-delivered}</b> transfers never arrived — the destination island had already terminated. A left join keeps them visible.</Caption>}<hr/>
    <div className="two"><div><Chart data={[{type:'heatmap',z:grid,x:islands.map(i=>`→ ${i}`),y:islands.map(i=>`island ${i}`),colorscale:[[0,C.deep],[1,C.mig]],texttemplate:'%{z:.0f}',textfont:{color:C.deep,size:12},hovertemplate:'%{y} %{x}<br>%{z:.0f} individuals<extra></extra>'}]} layout={{title:'Migrants sent, source → destination',yaxis:{autorange:'reversed'},margin:{l:76,r:16,t:56,b:44}}} height={380}/><Caption>A ring topology fills only the off-diagonal band; a fully-connected one fills everything. The shape of this matrix is the topology, recovered from the log.</Caption></div>
      <div><Chart data={[true,false].map((ok)=>{const rows=frame.filter(r=>r.delivered===ok);return {type:'scatter',mode:'markers',name:ok?'delivered':'not delivered',x:rows.map(r=>r.t_rel),y:rows.map(r=>r.source_island),marker:{color:ok?C.mig:C.faint,size:7,symbol:ok?'circle':'x',opacity:.85},customdata:rows.map(r=>[r.dest_island,r.num_migrants]),hovertemplate:'island %{y} → %{customdata[0]}<br>%{customdata[1]} migrants<br>t=%{x:.2f}s<extra></extra>'};})} layout={{title:'Transfers over time',xaxis:{title:'seconds since run start'},yaxis:{title:'source island'},legend:{orientation:'h',y:1,x:0},margin:{l:76,r:16,t:56,b:44}}} height={380}/><Caption>Gaps and clustering here reflect <code>migration_interval</code> and the fact that islands reach their migration points at different wall-clock moments.</Caption></div></div>
    <Details title="Transfer records"><Table rows={[...frame].sort((a,b)=>a.t_rel-b.t_rel)} columns={['migration_id','source_island','dest_island','source_generation','dest_generation','num_migrants','latency_seconds','generational_drift','accepted','selection_policy','replacement_policy']}/></Details></>;
}

function Convergence({ run }) {
  const frame=run.generations;
  if(!frame.length) return <><Header eyebrow="The run" title="Convergence & diversity" question="Which islands kept improving, and which stalled?">Per-island progress on run-relative wall time.</Header><Notice>This run has no generation_end records.</Notice></>;
  const traces=(col,showLegend=true)=>run.islands.map(id=>{const rows=frame.filter(r=>r.island_id===id).sort((a,b)=>a.t_rel-b.t_rel);return {type:'scatter',mode:'lines',name:`island ${id}`,x:rows.map(r=>r.t_rel),y:rows.map(r=>r[col]),line:{color:C.islands[id%C.islands.length],width:2},showlegend:showLegend,hovertemplate:`island ${id}<br>t=%{x:.2f}s<br>${col}=%{y:.4f}<extra></extra>`};});
  const end=run.islands.map(id=>Math.max(...frame.filter(r=>r.island_id===id).map(r=>r.t_rel))), gens=run.islands.map(id=>Math.max(...frame.filter(r=>r.island_id===id).map(r=>r.generation)));
  return <><Header eyebrow="The run" title="Convergence & diversity" question="Which islands kept improving, and which stalled?">Per-island progress on run-relative wall time. Islands are asynchronous, so a generation slider would quietly misreport what happened at the same moment.</Header>
    <div className="two"><div><Chart data={traces('best_so_far_fitness')} layout={{title:'Best so far, per island',xaxis:{title:'seconds since run start'},yaxis:{title:'fitness'},legend:{orientation:'h',y:1,x:0}}}/><Caption>A flat line is an island that has stopped improving. Compare it against <code>termination_reason</code> on the Run browser to tell convergence from an exhausted budget.</Caption></div>
    <div><Chart data={traces('diversity')} layout={{title:'Population diversity',xaxis:{title:'seconds since run start'},yaxis:{title:'diversity'},legend:{orientation:'h',y:1,x:0}}}/><Caption>Measured as <code>{frame.find(r=>r.diversity_metric)?.diversity_metric||'diversity'}</code>. The metric is representation-dependent, so its name is logged with the value.</Caption></div></div><hr/>
    <div className="two wide-left"><Chart data={traces('generation',false)} layout={{title:'Generation reached, against wall time',xaxis:{title:'seconds since run start'},yaxis:{title:'generation'}}} height={320}/><div><h3>Reading the drift</h3><Metrics values={[["Generation spread",`${Math.min(...gens)} – ${Math.max(...gens)}`],["Finish spread",`${num(Math.max(...end)-Math.min(...end))}s`]]}/><p className="body-copy">Islands are separate processes with their own budgets and their own stopping rules, so they neither start nor end together. The wider these two numbers, the less a generation-indexed view could be trusted.</p><p className="body-copy">That is why every timeline here is driven by clock-corrected <code>t_wall</code> rather than generation number.</p></div></div>
    <Details title="Generation records"><Table rows={frame} columns={['island_id','generation','best_fitness','mean_fitness','worst_fitness','best_so_far_fitness','diversity','unique_genome_hashes','evaluations_total','migrants_received_this_generation']}/></Details></>;
}

function RunBrowser({ run }) {
  const s=run.start,e=run.end,best=e.global_best_fitness;
  const provenance=[['Algorithm',s.algorithm],['Benchmark',s.benchmark],['Islands',s.num_islands],['Population / island',s.population_size],['Evaluation budget',fmt(s.evaluation_budget)],['Backend',s.backend],['Harness version',s.harness_version],['Schema version',s.schema_version]];
  if(s.migration) provenance.push(['Topology',s.migration.topology],['Migration interval',s.migration.interval],['Migrants per event',s.migration.num_migrants],['Selection → replacement',`${s.migration.selection||'?'} → ${s.migration.replacement||'?'}`]);
  for(const [key,value] of Object.entries(s.datasets||{})) { if(value&&typeof value==='object') {if(value.sha256) provenance.push([`${key} SHA-256`,String(value.sha256).slice(0,16)+'…']); if(value.source) provenance.push([`${key} source`,value.source]);} else provenance.push([key,value]); }
  const islandRows=run.events.filter(x=>x.type==='island_end').sort((a,b)=>a.island_id-b.island_id).map(x=>({'Island':x.island_id,'Stopped because':x.termination_reason,'Generations':x.generations_completed,'Evaluations':x.evaluations_total,'Best fitness':num(x.best_fitness,4),'Stagnant for':x.generations_since_improvement,'Migrants sent':x.migrants_sent||0,'Migrants received':x.migrants_received||0,'Seconds':num(x.wallclock_seconds)}));
  return <><Header eyebrow="The run" title="Run browser" question="What exactly was run, and how did it end?">Provenance and outcome for the selected run, taken from the first and last records in the event stream.</Header><Metrics values={[["Evaluations",fmt(run.evaluations.length)],["Islands",fmt(e.islands_completed??run.islands.length)],["Migration events",fmt(e.total_migration_events)],["Global best",best===undefined?'—':num(best,4)],["Wall clock",`${num(e.wallclock_seconds,1)}s`]]}/><Caption>Terminated: <code>{e.termination_reason||'unknown'}</code>. Fitness is being <b>{run.maximising?'maximised':'minimised'}</b>.</Caption><hr/>
    <div className="two wide-right"><div><h3>Provenance</h3><Table rows={provenance.map(([Field,Value])=>({Field,Value}))} columns={['Field','Value']} height={430}/></div><div><h3>How each island finished</h3>{islandRows.length?<><Table rows={islandRows} columns={['Island','Stopped because','Generations','Evaluations','Best fitness','Stagnant for','Migrants sent','Migrants received','Seconds']} height={430}/><Caption><code>termination_reason</code> read beside <code>stagnant for</code> tells you whether an island converged or simply ran out of budget.</Caption></>:<Notice>No island_end records in this run.</Notice>}</div></div>
    <Details title="Resolved configuration"><pre>{JSON.stringify(s.config||{},null,2)}</pre></Details></>;
}

function Overview() {
  const stages=[['Execution','backend starts islands in parallel and they exchange individuals',''],['Logs','every evaluation and migration, one schema','produced elsewhere'],['Clustering','LSH → BIRCH → DenStream compress the stream','produced elsewhere'],['Network','trajectories become a graph, with migration edges',''],['Analytics','backend results include island separation diagnostics','']];
  return <><Header eyebrow="Archipelago" title="About" question="Explaining what a distributed evolutionary algorithm actually did.">A distributed evolutionary algorithm runs several populations at once and lets them trade individuals. Standard tools flatten all of that into a single fitness curve. This one keeps the islands apart and draws where each of them actually searched.</Header>
    <div className="flow">{stages.map(([name,detail,state])=><div key={name} className={state?'':'built'}><strong>{name}</strong><span>{detail}</span><small>{state}</small></div>)}</div><Caption>Archipelago occupies the middle of that strip. It starts backend runs and also reads finished local runs for analysis.</Caption><hr/>
    <div className="two prose"><div><h3>The vocabulary</h3><p><b>Island</b> — one independent subpopulation running its own copy of the algorithm. Islands are <i>asynchronous</i>: island 2 being on generation 9 says nothing about where island 3 is at the same moment.</p><p><b>Migration</b> — individuals periodically copied from one island to another, along a topology (a ring, or fully connected).</p><p><b>STN node</b> — one location in the search space. Two evaluations that land in the same place become the same node.</p><p><b>Migration edge</b> — a cross-island edge, drawn in cyan throughout this app.</p></div>
      <div><h3>Why a fitness curve isn't enough</h3><p>A convergence plot tells you the best score improved. It cannot tell you <i>why</i>, and in a distributed run the interesting answers are all structural:</p><ul><li>Were the islands exploring different regions?</li><li>Did a migration move the receiving island somewhere new?</li><li>Which island found the best solution, and did that discovery spread?</li><li>Did an island stall?</li></ul><p>Each of those is a question about <i>shape</i>, which is why this is a graph tool.</p></div></div><hr/>
    <div className="prose narrow"><h3>How the graph stays readable</h3><ul><li><b>Aggregate:</b> a node is a cluster of nearby evaluations, not one evaluation.</li><li><b>Filter:</b> paths seen only once are hidden first.</li><li><b>Separate:</b> pulling islands apart is a control, so the moment they split can be read.</li><li><b>Distinct channels:</b> migration is drawn as arcs, and contested clusters get a ring.</li><li><b>Render density:</b> crowded regions get brighter instead of turning into solid lines, and shared regions lose their single hue.</li><li><b>Inspect:</b> clicking a node brings the detail back.</li></ul><p>The <b>Scale study</b> page shows this working on 400,000 synthetic evaluations.</p></div><hr/>
    <div className="prose narrow"><h3>Where this sits</h3><p>Archipelago is the analysis layer. It reads finished runs from the baseline harness or Volpe using the schema 2.0 layout. On the <b>Runs</b> page, start a search from a backend preset or reopen a remembered run ID. Finished files can also be opened in the separate local file library.</p></div><hr/>
    <div className="prose narrow"><h3>A note on the vertical axis</h3><p>Search spaces usually have many more than three dimensions. The Archipelago view spends two axes on position and gives the third to <b>fitness</b>. Good regions are low, and you can watch each island descend into its own basin. The view reports how much variance its projection kept.</p></div></>;
}

const ICONS = { brand:'M3 17L8 6l5 9 5-12 3 14', archipelago:'M3 17L8 6l5 9 5-12 3 14', study:'M4 20V10M10 20V4M16 20v-7M21 20H3', migration:'M3 7h15l-4-4m4 4-4 4M21 17H6l4 4m-4-4 4-4', convergence:'M3 4v16h18M6 7l4 6 4-2 6 6', run:'M5 3h14v18H5zM8 7h8M8 11h8M8 15h5', library:'M3 5h7l2 3h9v12H3z', overview:'M12 3a9 9 0 1 0 .01 0M12 10v7M12 7v1' };
function Icon({ id }) { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICONS[id]}/></svg>; }

function App() {
  const [runs,setRuns]=useState([]),[run,setRun]=useState(null),[route,setRoute]=useState(()=>readRoute(location.hash)),[level,setLevel]=useState('level0'),[results,setResults]=useState([]),[selectedResult,setSelectedResult]=useState(''),[error,setError]=useState(''),[backendWarning,setBackendWarning]=useState('');
  const {page,runId:backendRunId}=route;
  const refresh=async()=>{const list=await api('/runs');setRuns(list);return list;};
  useEffect(()=>{refresh().catch(e=>setError(e.message));},[]);
  useEffect(()=>{
    const sync=()=>{setRoute(readRoute(location.hash));setBackendWarning('');};
    window.addEventListener('hashchange',sync);window.addEventListener('popstate',sync);
    return()=>{window.removeEventListener('hashchange',sync);window.removeEventListener('popstate',sync);};
  },[]);
  useEffect(()=>{let active=true;if(!runs.length){setRun(null);return;} const id=run&&runs.some(r=>r.id===run.id)?run.id:runs[0].id; api(`/runs/${encodeURIComponent(id)}`).then(value=>{if(active)setRun(value);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[runs]);
  useEffect(()=>{let active=true;if(!run)return; api(`/runs/${encodeURIComponent(run.id)}/results`).then(r=>{if(active){setResults(r);setSelectedResult(r[0]?.id||'');}}).catch(()=>{if(active)setResults([]);});return()=>{active=false;};},[run?.id,page]);
  const goTo=hash=>{history.pushState(null,'',hash);setRoute(readRoute(hash));};
  const navigate=id=>goTo(backendRunId&&id==='archipelago'?runHash(backendRunId):`#${id}`);
  const openBackend=(id,{warning=''}={})=>{setBackendWarning(warning);goTo(runHash(id));};
  const openLocal=async (id,currentPage)=>{const startingHash=location.hash;try{setRun(await api(`/runs/${encodeURIComponent(id)}`));setBackendWarning('');if(!currentPage&&location.hash===startingHash)goTo(localRunHash());}catch(e){setError(e.message);}};
  const go=[['Analyse',[['archipelago','Archipelago','Where islands searched'],['migration','Migration','Who moved, and arrived'],['convergence','Convergence','Who improved, who stalled'],['study','Scale study','Synthetic data at 400,000 evaluations']]],['The run',[['run','Run browser','What ran, how it ended']]]];
  const pageButton=([id,label,hint])=><button key={id} className={page===id?'active':''} onClick={()=>navigate(id)}><Icon id={id}/>{label}<small>{hint}</small></button>;
  document.documentElement.classList.toggle('on-archipelago',page==='study'||(page==='archipelago'&&!!run&&!backendRunId));
  document.documentElement.classList.toggle('on-study',page==='study');
  const best=run?.end?.global_best_fitness;
  return <div className="app"><aside><div className="brand"><Icon id="brand"/><span>Archipelago</span><small>v0.4</small></div>
      <nav>{backendRunId?pageButton(['archipelago','Archipelago','Selected backend run']):runs.length>0&&go.map(([heading,items])=><React.Fragment key={heading}><div className="nav-heading">{heading}</div>{items.map(pageButton)}</React.Fragment>)}<div className="nav-heading">Library</div>{pageButton(['library','Runs','Start or reopen a run'])}{pageButton(['overview','About','What this tool is for'])}</nav>
      {!backendRunId&&runs.length>0&&['archipelago','migration','convergence','run'].includes(page)&&<div className="runctx"><label>Local run<select value={run?.id||''} onChange={e=>openLocal(e.target.value,page)}>{runs.map(r=><option key={r.id} value={r.id}>{r.algorithm} / {r.benchmark} · {r.islands} islands</option>)}</select></label><label>Level<select value={level} onChange={e=>setLevel(e.target.value)}><option value="level0">Level 0 · raw trajectory</option><option value="clustered">Clustered</option></select></label>
        {run&&<dl className="run-facts"><dt>Islands</dt><dd>{run.islands.length}</dd><dt>Evaluations</dt><dd>{fmt(run.evaluations.length)}</dd><dt>Goal</dt><dd>{run.maximising?'Maximise':'Minimise'}</dd><dt>Best</dt><dd>{best===undefined?'—':num(best,4)}</dd></dl>}</div>}</aside>
    <main>{error&&<Notice type="error">{error}</Notice>}<div className="page">{page==='library'?<RunsPage api={backendApi} onOpenRun={openBackend} localLibrary={<LocalRuns runs={runs} refresh={refresh} onOpenLocal={openLocal} request={api}/>}/>:page==='overview'?<Overview/>:page==='study'?<Study/>:backendRunId?<RunWorkspace runId={backendRunId} api={backendApi} onBack={()=>navigate('library')} warning={backendWarning}/>:run?<>{page==='archipelago'?<Archipelago run={run} level={level} results={results} selectedResult={selectedResult} setSelectedResult={setSelectedResult}/>:page==='migration'?<Migration run={run}/>:page==='convergence'?<Convergence run={run}/>:<RunBrowser run={run}/>}</>:<Notice>No local run selected. Open Runs to start a backend run or add local files.</Notice>}</div><footer>Archipelago v0.4 · Team 21, Amrita Vishwa Vidyapeetham</footer></main></div>;
}

createRoot(document.getElementById('root')).render(<App/>);
