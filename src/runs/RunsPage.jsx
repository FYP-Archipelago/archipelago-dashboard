import React, { useEffect, useRef, useState } from 'react';
import { backendApi } from '../backend/api.js';
import ClusteringControls from './ClusteringControls.jsx';
import { buildRunRequest, initialClustering, validatePresets } from './run-form.js';
import { readRecentRuns, rememberRun, forgetRun, isRunId } from './recent-runs.js';
import './runs.css';

const LABELS = {num_islands:'Islands',evaluation_budget:'Evaluation budget',target_generations:'Target generations','migration.enabled':'Enable migration','migration.topology':'Migration topology','migration.interval':'Migration interval (generations)','migration.num_migrants':'Migrants per event',seed:'Runner seed (optional)'};
const labelFor = key => LABELS[key] || key.replaceAll('_',' ');
function browserStorage() {try{return window.localStorage;}catch{return null;}}

function OverrideField({name,rule,value,onChange,error}) {
  const label = labelFor(name), common = {name,'aria-invalid':!!error};
  if (rule.type === 'bool') return <label className="check"><input {...common} type="checkbox" checked={!!value} onChange={event=>onChange(event.target.checked)}/>{label}</label>;
  return <label>{label}
    {rule.type === 'choice' ? <select {...common} value={value ?? ''} onChange={event=>onChange(event.target.value)}>{rule.choices.map(choice=><option key={choice} value={choice}>{choice.replaceAll('_',' ')}</option>)}</select> :
      <input {...common} type="number" step="1" min={rule.min} max={rule.max} value={value ?? ''} onChange={event=>onChange(event.target.value)} placeholder={rule.optional?'Automatic when blank':undefined}/>}
    {rule.type === 'int' && <small>{rule.min !== undefined ? `Minimum ${rule.min.toLocaleString()}` : 'Integer'}{rule.max !== undefined ? ` · maximum ${rule.max.toLocaleString()}` : ''}</small>}
    {error && <span className="field-error">{error}</span>}
  </label>;
}

export default function RunsPage({api=backendApi,onOpenRun,localLibrary,storage=browserStorage()}) {
  const [tab,setTab] = useState('new');
  const [catalog,setCatalog] = useState(null), [preset,setPreset] = useState(''), [drafts,setDrafts] = useState({});
  const [catalogError,setCatalogError] = useState(''), [loading,setLoading] = useState(true), [retry,setRetry] = useState(0);
  const [health,setHealth] = useState({state:'checking',message:''});
  const [clustering,setClustering] = useState(initialClustering), [stream,setStream] = useState(true);
  const [busy,setBusy] = useState(false), [errors,setErrors] = useState({}), [submitError,setSubmitError] = useState('');
  const [recent,setRecent] = useState(()=>readRecentRuns(storage,api.baseUrl));
  const [runId,setRunId] = useState(''), [idError,setIdError] = useState(''), [warning,setWarning] = useState('');
  const submitting = useRef(false), mounted = useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);

  useEffect(()=>{
    let active = true;
    const controller = new AbortController();
    setHealth({state:'checking',message:''});setLoading(true);setCatalogError('');
    api.health({signal:controller.signal}).then(value=>{
      if (!active) return;
      const ok = value?.status === 'ok' && value?.db === true && value?.redis === true;
      setHealth({state:ok?'connected':'unavailable',message:ok?'':'The backend reports that its database or Redis is unavailable.'});
    }).catch(error=>{if(active)setHealth({state:'unavailable',message:error.message});});
    api.presets({signal:controller.signal}).then(validatePresets).then(value=>{
      if (!active) return;
      setCatalog(value);setPreset(current=>value.presets.some(item=>item.preset===current)?current:value.presets[0].preset);
    }).catch(error=>{if(active)setCatalogError(error.message);}).finally(()=>{if(active)setLoading(false);});
    return ()=>{active=false;controller.abort();};
  },[api,retry]);

  useEffect(()=>{
    const update = () => setRecent(readRecentRuns(storage,api.baseUrl));
    update();window.addEventListener('storage',update);
    return ()=>window.removeEventListener('storage',update);
  },[storage,api.baseUrl]);

  const selected = catalog?.presets.find(item=>item.preset===preset);
  const values = drafts[preset] || {};
  const changeValue = (key,value) => setDrafts(current=>({...current,[preset]:{...current[preset],[key]:value}}));
  const remember = (entry) => {
    try {const list=rememberRun(storage,api.baseUrl,entry);if(mounted.current)setRecent(list);return '';}
    catch(error) {if(mounted.current)setWarning(error.message);return error.message;}
  };
  const submit = async event => {
    event.preventDefault();
    if (submitting.current || loading || health.state !== 'connected' || catalogError) return;
    setErrors({});setSubmitError('');setWarning('');
    let body;
    try {body=buildRunRequest({catalog,preset,values,clustering,stream});}
    catch(error) {setErrors(error.fields || {});setSubmitError(error.message);return;}
    submitting.current=true;setBusy(true);
    try {
      const run=await api.createRun(body);
      const notice=remember({run_id:run.run_id,preset:run.preset || preset,source:'new'});
      if (mounted.current) onOpenRun(run.run_id,{warning:notice});
    } catch(error) {if(mounted.current)setSubmitError(error.message);}
    finally {submitting.current=false;if(mounted.current)setBusy(false);}
  };
  const open = id => {
    setIdError('');
    if (!isRunId(id)) {setIdError('Enter a run ID such as run-20261102T120000Z-aabbccdd.');return;}
    const notice=remember({run_id:id,source:'manual',preset:recent.find(item=>item.run_id===id)?.preset || ''});
    onOpenRun(id,{warning:notice});
  };
  const remove = id => {
    try {setRecent(forgetRun(storage,api.baseUrl,id));setWarning('');}
    catch(error) {setWarning(error.message);}
  };
  return <div className="runs-page">
    <header className="page-head"><h1>Runs</h1><p className="question">Start a search, or return to a run you already have.</p></header>
    <div className="backend-connection" role="status" aria-live="polite">
      <span className={`status-dot ${health.state==='connected'?'online':''}`}/>
      <strong>{health.state==='connected'?'Backend connected':health.state==='checking'?'Checking backend…':'Backend unavailable'}</strong>
      <button type="button" onClick={()=>setRetry(value=>value+1)} disabled={busy}>Retry connection</button>
    </div>
    {health.message && <div className="notice error" role="alert">{health.message}</div>}
    <div className="run-layout"><section className="run-entry">
      <div className="tabs" role="tablist" aria-label="Run entry">
        <button type="button" role="tab" aria-selected={tab==='new'} aria-controls="new-run-panel" id="new-run-tab" className={tab==='new'?'active':''} onClick={()=>setTab('new')}>Start a new run</button>
        <button type="button" role="tab" aria-selected={tab==='upload'} aria-controls="upload-run-panel" id="upload-run-tab" className={tab==='upload'?'active':''} onClick={()=>setTab('upload')}>Upload an existing run</button>
      </div>
      <div id="new-run-panel" role="tabpanel" aria-labelledby="new-run-tab" hidden={tab!=='new'}>
        <p className="body-copy">Choose a runner preset. The backend executes the search and clusters its evaluations.</p>
        {loading && <p role="status">Loading presets…</p>}
        {catalogError && <div className="notice error" role="alert">{catalogError}</div>}
        {selected && <form className="new-run-form" onSubmit={submit} noValidate aria-busy={busy}>
          <fieldset disabled={busy || loading || !!catalogError}>
            <label>Preset<select name="preset" value={preset} onChange={event=>{setPreset(event.target.value);setErrors({});setSubmitError('');}}>{catalog.presets.map(item=><option key={item.preset} value={item.preset}>{item.algorithm.toUpperCase()} · {item.benchmark} — {item.preset}</option>)}</select></label>
            <p className="preset-description">{selected.description}</p>
            <div className="preset-tags"><span>{selected.algorithm.toUpperCase()}</span><span>{selected.benchmark.replaceAll('_',' ')}</span><span>Defaults supplied by runner</span></div>
            <h3>Runner settings</h3>
            <div className="param-grid">{Object.entries(catalog.overrides).map(([key,rule])=><OverrideField key={`${preset}:${key}`} name={key} rule={rule} value={Object.hasOwn(values,key)?values[key]:selected.defaults[key]} onChange={value=>changeValue(key,value)} error={errors[key]}/>)}</div>
            <p className="caption">Blank runner seed uses the runner's automatic seeding. A seed repeats independent randomness; asynchronous migration can still change a run.</p>
            <ClusteringControls value={clustering} onChange={setClustering} errors={errors}/>
            <label className="check"><input name="stream" type="checkbox" checked={stream} onChange={event=>setStream(event.target.checked)}/>Stream live graph updates</label>
            <p className="caption">With live updates off, the final result is still saved by the backend.</p>
            {submitError && <div className="notice error" role="alert">{submitError}</div>}
            <button className="primary" type="submit" disabled={busy || health.state!=='connected' || loading || !!catalogError}>{busy?'Starting…':'Start run'}</button>
          </fieldset>
        </form>}
      </div>
      <div id="upload-run-panel" role="tabpanel" aria-labelledby="upload-run-tab" hidden={tab!=='upload'}>
        <h3>Cluster a completed run</h3>
        <p className="body-copy">Use this path for logs from a search that has already finished. It should cluster the files without executing the search again.</p>
        <div className="notice">The backend does not yet accept existing-run uploads. This option will be available when that service capability is added.</div>
        <button type="button" className="primary" disabled>Upload and cluster</button>
        {localLibrary && <p className="caption">You can still open files for local analysis in the local file library below.</p>}
      </div>
    </section><section className="recent-runs" aria-labelledby="recent-title">
      <h3 id="recent-title">Remembered by this browser</h3>
      <p className="caption">Runs you started or opened here, for this backend. This is not a complete server history. Remove an unavailable ID from this list at any time.</p>
      {warning && <div className="notice" role="status">{warning}</div>}
      <form onSubmit={event=>{event.preventDefault();open(runId.trim());}}>
        <label>Run ID<input name="run_id" value={runId} onChange={event=>setRunId(event.target.value)} placeholder="run-YYYYMMDDTHHMMSSZ-xxxxxxxx" aria-invalid={!!idError}/></label>
        {idError && <p role="alert" className="field-error">{idError}</p>}
        <button className="secondary" type="submit">Open run</button>
      </form>
      {!recent.length && <p className="caption">No runs remembered yet. Start a run or paste its ID above.</p>}
      <ul>{recent.map(entry=><li key={entry.run_id}>
        <button type="button" className="recent-open" onClick={()=>open(entry.run_id)}><strong>{entry.preset || 'Backend run'}</strong><code>{entry.run_id}</code><small>{new Date(entry.at).toLocaleString()}</small></button>
        <button type="button" className="remove-run" aria-label={`Remove ${entry.run_id} from this browser`} onClick={()=>remove(entry.run_id)}>Remove</button>
      </li>)}</ul>
    </section></div>
    {localLibrary && <details className="local-library"><summary>Local file library</summary><div className="details-body">{localLibrary}</div></details>}
  </div>;
}
