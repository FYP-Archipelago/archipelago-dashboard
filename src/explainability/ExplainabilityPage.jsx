import React,{useEffect,useState} from 'react';
import {explanationClient} from './client.js';
import './explainability.css';

const number=new Intl.NumberFormat('en',{maximumFractionDigits:4});
const percentage=new Intl.NumberFormat('en',{maximumFractionDigits:1});
const fmt=value=>number.format(value);
const pct=value=>`${percentage.format(value)}%`;

function Metric({label,value,detail}) {
  return <div className="ex-metric"><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>;
}

function Attribution({data}) {
  const [mode,setMode]=useState('islands'),[coalition,setCoalition]=useState([]),[walk,setWalk]=useState('0'),[step,setStep]=useState(0);
  const game=data.games[mode],isRoutes=mode==='routes',sampled=game.method!=='exact';
  const selected=game.coalitions.find(c=>c.players.length===coalition.length&&c.players.every(id=>coalition.includes(id)));
  const example=game.examples.find(e=>e.id===walk)||game.examples[0],current=example?.steps[step];
  const changeMode=next=>{setMode(next);setCoalition([]);setWalk('0');setStep(0);};
  return <div data-attribution>
    <div className="ex-summary">
      <Metric label="Initial best fitness" value={fmt(data.baseline_fitness)} detail={data.maximising?'Maximisation · higher is better':'Minimisation · lower is better'}/>
      <Metric label="Supported best fitness" value={fmt(data.supported_best_fitness)} detail={`Observed best: ${fmt(data.observed_best_fitness)}`}/>
      <Metric label="Attributed improvement" value={fmt(game.allocated_gain)} detail={isRoutes?'Relative to the migration-free lineage baseline':'Relative to the initial-population best'}/>
      <Metric label="Ancestry coverage" value={pct(data.coverage.percent)} detail={`${data.coverage.supported.toLocaleString()} / ${data.coverage.total.toLocaleString()} evaluations`}/>
    </div>
    <div className="ex-mode-row"><div className="ex-switch" role="group" aria-label="Attribution players"><button aria-pressed={!isRoutes} onClick={()=>changeMode('islands')}>Islands</button><button aria-pressed={isRoutes} onClick={()=>changeMode('routes')}>Migration routes</button></div><span className="ex-method">{sampled?`${game.permutations.toLocaleString()} sampled orders`:`Exact · ${game.evaluated_coalitions.toLocaleString()} coalitions`}</span></div>
    <div className="ex-grid">
      <section className="ex-card ex-rankings" aria-labelledby="ex-credit-heading">
        <h2 id="ex-credit-heading">{isRoutes?'Migration-route contributions':'Island contributions'}</h2>
        <p className="ex-description">{isRoutes?'Directed migration routes are coalition players; each route aggregates its recorded migration events.':'Shapley values allocate fitness improvement across islands using complete recorded ancestry.'}</p>
        {game.allocated_gain>0&&game.players[0]&&<p className="ex-leading">Largest contribution <strong>{game.players[0].label} · {pct(game.players[0].share_percent)}</strong></p>}
        {game.players.length===0?<div className="ex-empty">No cross-island dependencies recorded.</div>:<div className="ex-bars" aria-label="Shapley contributions">{game.players.map(player=><div className="ex-bar-row" key={player.id}>
          <div className="ex-bar-label"><span>{player.label}</span><strong>{fmt(player.value)} <small>({pct(player.share_percent)})</small></strong></div>
          <div className="ex-track" role="meter" aria-label={`${player.label} share of allocated gain`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={player.share_percent}><span style={{width:`${player.bar_percent}%`}}/></div>
          {sampled&&<small className="ex-sampling-error">Monte Carlo standard error: {fmt(player.standard_error)}</small>}
        </div>)}</div>}
        <div className="ex-reconciliation"><span>Baseline v(∅) <b>{fmt(game.empty_value)}</b></span><span>Total attribution Σφᵢ <b>{fmt(game.allocated_gain)}</b></span><span>Full coalition v(N) <b>{fmt(game.full_value)}</b></span></div>
        <p className="ex-description">Fitness improvement units; bars normalized to the maximum contribution. Percentages denote shares of total attribution. {game.allocated_gain===0?'No additional improvement is attributable in this game. ':''}Island and route attributions are separate games and are not additive.</p>
        {sampled&&<p className="ex-description">Standard errors quantify Monte Carlo estimation error, not between-run variability.</p>}
      </section>
      <section className="ex-card ex-lab" aria-labelledby="ex-coalition-heading">
        <h2 id="ex-coalition-heading">Coalition value</h2>
        {sampled?<div className="ex-empty"><p>Exact enumeration is limited to ten players. This game contains {game.players.length} players and uses {game.permutations.toLocaleString()} sampled permutations.</p><p>Permutation-specific marginal contributions are reported below.</p></div>:<>
          <p className="ex-description">v(S) is the maximum fitness improvement supported by complete ancestry within the selected {isRoutes?'routes':'islands'}.</p>
          <div className="ex-coalition-controls">{game.players.map(player=><label key={player.id}><input type="checkbox" checked={coalition.includes(player.id)} onChange={()=>setCoalition(ids=>ids.includes(player.id)?ids.filter(id=>id!==player.id):[...ids,player.id])}/>{player.label}</label>)}</div>
          <div className="ex-coalition-result"><span>Coalition value v(S)</span><strong data-coalition-value aria-live="polite">{fmt(selected?.value??0)}</strong><small>fitness improvement from the initial baseline</small></div>
          <div className="ex-track ex-coalition-track"><span style={{width:`${selected?.value_percent??0}%`}}/></div>
          <div className="ex-coalition-actions"><button className="text-button" onClick={()=>setCoalition([])}>Clear selection</button><button className="text-button" onClick={()=>setCoalition(game.players.map(p=>p.id))}>Select all</button></div>
          <p className="ex-description">{isRoutes?'All islands remain available. The empty coalition retains improvement supported by migration-free lineages.':'Support requires the evaluation’s island and every recorded ancestor; partial parent-path reachability is insufficient.'}</p>
        </>}
      </section>
    </div>
    <section className="ex-card ex-walk" aria-labelledby="ex-walk-heading">
      <div className="ex-walk-head"><h2 id="ex-walk-heading">Marginal contributions</h2>{example&&<label>Permutation <select aria-label="Permutation" value={example.id} onChange={event=>{setWalk(event.target.value);setStep(0);}}>{game.examples.map((e,i)=><option key={e.id} value={e.id}>π {i+1}</option>)}</select></label>}</div>
      {current?<>
        <div className="ex-order" aria-label="Coalition permutation">{example.steps.map((item,i)=><button key={item.player_id} onClick={()=>setStep(i)} aria-pressed={i===step} className={i<=step?'joined':''}><small>{i+1}</small>{item.label}</button>)}</div>
        <div className="ex-walk-detail" aria-live="polite"><span>v(S)<br/><strong>{fmt(current.before)}</strong></span><span className="ex-join">+ {current.label}</span><span>v(S ∪ {'{i}'})<br/><strong>{fmt(current.after)}</strong></span><span className="ex-marginal">Marginal contribution Δᵢ(S)<br/><strong>+{fmt(current.marginal)}</strong></span></div>
        <div className="ex-step-controls"><button className="secondary" disabled={step===0} onClick={()=>setStep(s=>s-1)}>Previous</button><span>Step {step+1} of {example.steps.length}</span><button className="secondary" disabled={step===example.steps.length-1} onClick={()=>setStep(s=>s+1)}>Next step</button></div>
        <p className="ex-description">Δᵢ(S) = v(S ∪ {'{i}'}) − v(S). Shapley values average these increments over {sampled?'sampled permutations':'all permutations'}; the selected permutation shows one marginal allocation.</p>
      </>:<p className="ex-description">No migration-route players available for marginal analysis.</p>}
    </section>
    <details className="ex-card ex-method-detail"><summary>Method and assumptions</summary><div className="ex-method-grid"><div><h3>Characteristic function</h3><p>v(S) is the best ancestry-supported improvement relative to the initial-population best. Fitness direction follows the run objective; initial-population quality is held fixed.</p><p>Shapley values are mean permutation-marginal contributions and satisfy Σᵢφᵢ = v(N) − v(∅).</p></div><div><h3>Attribution scope</h3><p>Single-run observational attribution of recorded dependencies. These values do not estimate counterfactual optimiser performance or causal effects of island or route removal.</p><p>Attribution is specific to the recorded run and game definition. Equal contributions need not imply equivalent island performance.</p></div><div><h3>Lineage completeness</h3><p>{data.coverage.excluded===0?'All recorded evaluations have resolved ancestry.':`${data.coverage.excluded.toLocaleString()} evaluations lack fully resolved ancestry.`} Missing parents, cycles and dependent descendants are excluded.</p><p>Coverage is conditional on source-log completeness. Aggregated cluster links are not used to reconstruct individual ancestry.</p></div></div><p className="ex-description">Reference: <a href="https://doi.org/10.1515/9781400881970-018" target="_blank" rel="noreferrer">Shapley, A Value for n-Person Games</a>. {sampled?`Permutation sampling seed: ${game.seed}.`:'Exact coalition enumeration.'}</p></details>
  </div>;
}

export default function ExplainabilityPage({runId,client=explanationClient,onSelectRun=()=>{}}) {
  const [index,setIndex]=useState(null),[state,setState]=useState(null),[indexError,setIndexError]=useState(''),[retry,setRetry]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();let active=true;
    setIndex(null);setIndexError('');
    client.index({signal:controller.signal}).then(value=>{if(active)setIndex(value);}).catch(error=>{if(active)setIndexError(error.message);});
    return()=>{active=false;controller.abort();};
  },[client,retry]);
  const available=index?.runs.some(run=>run.run_id===runId);
  useEffect(()=>{
    setState(null);
    if(!available)return;
    const controller=new AbortController();let active=true;
    client.run(runId,{signal:controller.signal}).then(data=>{if(active)setState({id:runId,data});}).catch(error=>{if(active)setState({id:runId,error:error.message});});
    return()=>{active=false;controller.abort();};
  },[runId,available,client,retry]);
  const data=state?.id===runId?state.data:null,error=state?.id===runId?state.error:null;
  return <div className="page explainability-page">
    <header className="ex-heading"><div><h1>Explainability</h1><p className="question">Lineage-based Shapley attribution of fitness improvement.</p></div></header>
    <div className="ex-source"><div><strong>Recorded lineage</strong><p>Precomputed attribution from recorded evaluation lineage.</p></div><label>Analysis source <select name="explanation-run" value={available?runId:''} disabled={!index} onChange={e=>{if(e.target.value)onSelectRun(e.target.value);}}><option value="">Select a recorded run</option>{index?.runs.map(run=><option key={run.run_id} value={run.run_id}>{run.run_id} · {run.islands} islands · {run.benchmark}</option>)}</select></label></div>
    {indexError?<div className="notice" role="alert">{indexError} <button className="secondary" onClick={()=>setRetry(x=>x+1)}>Retry</button><p>Prepare local attribution artifacts with <code>npm run explainability:prepare</code>.</p></div>:!index?<p role="status">Loading attribution index…</p>:!available?<div className="ex-card ex-unavailable"><h2>{runId?'Individual ancestry unavailable':'No attribution dataset selected'}</h2><p>{runId&&<><code>{runId}</code><br/></>}No persisted individual-lineage attribution is available for the selected run. Available local recordings are listed above.</p><p>Cluster-level links are insufficient to reconstruct complete individual ancestry. Automatic run attribution requires a persisted analysis of raw evaluation records.</p>{index.errors.length>0&&<details><summary>{index.errors.length} local recordings unavailable</summary>{index.errors.map(entry=><p key={entry.run_id}><code>{entry.run_id}</code> {entry.detail}</p>)}</details>}</div>:error?<div className="notice" role="alert">{error} <button className="secondary" onClick={()=>setRetry(x=>x+1)}>Retry</button></div>:!data?<p role="status">Loading recorded attribution…</p>:<>
      <p className="ex-run-meta"><code>{data.run_id}</code><span>{data.source?.algorithm} · {data.source?.benchmark} · {data.source?.topology}</span></p>
      {data.warnings.map(message=><div className="notice" role="status" key={message}>{message}</div>)}
      <Attribution key={data.run_id} data={data}/>
    </>}
  </div>;
}
