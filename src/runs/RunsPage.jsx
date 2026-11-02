import React, { useEffect, useRef, useState } from 'react';
import { backendApi } from '../backend/api.js';
import ClusteringControls from './ClusteringControls.jsx';
import { buildRunRequest, initialClustering, validatePresets } from './run-form.js';
import './runs.css';

const LABELS = {num_islands:'Islands',evaluation_budget:'Evaluation budget',target_generations:'Target generations','migration.enabled':'Enable migration','migration.topology':'Migration topology','migration.interval':'Migration interval (generations)','migration.num_migrants':'Migrants per event',seed:'Runner seed (optional)'};
const labelFor = key => LABELS[key] || key.replaceAll('_',' ');

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

export default function RunsPage({api=backendApi,onOpenRun,onBusyChange,canStart=true}) {
  const [catalog,setCatalog]=useState(null),[preset,setPreset]=useState(''),[drafts,setDrafts]=useState({});
  const [catalogError,setCatalogError]=useState(''),[loading,setLoading]=useState(true),[retry,setRetry]=useState(0);
  const [health,setHealth]=useState({state:'checking',message:''});
  const [clustering,setClustering]=useState(initialClustering),[stream,setStream]=useState(true);
  const [busy,setBusy]=useState(false),[errors,setErrors]=useState({}),[submitError,setSubmitError]=useState('');
  const submitting=useRef(false),mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  useEffect(()=>{onBusyChange?.(busy);},[busy,onBusyChange]);
  useEffect(()=>{
    let active=true;const controller=new AbortController();
    setHealth({state:'checking',message:''});setLoading(true);setCatalogError('');
    api.health({signal:controller.signal}).then(value=>{
      if(!active)return;
      const ok=value?.status==='ok'&&value?.db===true&&value?.redis===true;
      setHealth({state:ok?'connected':'unavailable',message:ok?'':'The backend reports that its database or Redis is unavailable.'});
    }).catch(error=>{if(active)setHealth({state:'unavailable',message:error.message});});
    api.presets({signal:controller.signal}).then(validatePresets).then(value=>{
      if(!active)return;
      setCatalog(value);setPreset(current=>value.presets.some(item=>item.preset===current)?current:value.presets[0].preset);
    }).catch(error=>{if(active)setCatalogError(error.message);}).finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;controller.abort();};
  },[api,retry]);
  const selected=catalog?.presets.find(item=>item.preset===preset),values=drafts[preset]||{};
  const changeValue=(key,value)=>setDrafts(current=>({...current,[preset]:{...current[preset],[key]:value}}));
  const submit=async event=>{
    event.preventDefault();
    if(submitting.current||loading||health.state!=='connected'||catalogError||!canStart)return;
    setErrors({});setSubmitError('');
    let body;
    try{body=buildRunRequest({catalog,preset,values,clustering,stream});}
    catch(error){setErrors(error.fields||{});setSubmitError(error.message);return;}
    submitting.current=true;setBusy(true);
    try{
      const run=await api.createRun(body);
      onOpenRun(run.run_id,{run});
    }catch(error){if(mounted.current)setSubmitError(error.message);}
    finally{submitting.current=false;if(mounted.current)setBusy(false);}
  };
  return <div className="runs-page">
    <header className="page-head"><h1>Start a new run</h1><p className="question">Choose the search settings. The backend executes and clusters the run.</p></header>
    <div className="backend-connection" role="status" aria-live="polite"><span className={`status-dot ${health.state==='connected'?'online':''}`}/><strong>{health.state==='connected'?'Backend connected':health.state==='checking'?'Checking backend…':'Backend unavailable'}</strong><button type="button" onClick={()=>setRetry(value=>value+1)} disabled={busy}>Retry connection</button></div>
    {health.message&&<div className="notice error" role="alert">{health.message}</div>}
    {loading&&<p role="status">Loading presets…</p>}
    {catalogError&&<div className="notice error" role="alert">{catalogError}</div>}
    {selected&&<section className="run-entry"><form className="new-run-form" onSubmit={submit} noValidate aria-busy={busy}>
      <fieldset disabled={busy||loading||!!catalogError}>
        <label>Preset<select name="preset" value={preset} onChange={event=>{setPreset(event.target.value);setErrors({});setSubmitError('');}}>{catalog.presets.map(item=><option key={item.preset} value={item.preset}>{item.algorithm.toUpperCase()} · {item.benchmark} — {item.preset}</option>)}</select></label>
        <p className="preset-description">{selected.description}</p>
        <div className="preset-tags"><span>{selected.algorithm.toUpperCase()}</span><span>{selected.benchmark.replaceAll('_',' ')}</span><span>Defaults supplied by runner</span></div>
        <h3>Runner settings</h3>
        <div className="param-grid">{Object.entries(catalog.overrides).map(([key,rule])=><OverrideField key={`${preset}:${key}`} name={key} rule={rule} value={Object.hasOwn(values,key)?values[key]:selected.defaults[key]} onChange={value=>changeValue(key,value)} error={errors[key]}/>)}</div>
        <p className="caption">Blank runner seed uses automatic seeding. Asynchronous migration can still change the outcome of a seeded run.</p>
        <ClusteringControls value={clustering} onChange={setClustering} errors={errors}/>
        <section className="run-display-mode" aria-labelledby="display-mode-title"><h3 id="display-mode-title">Display mode</h3>
          <label className="check"><input id="live-updates" name="stream-mode" type="radio" checked={stream} onChange={()=>setStream(true)}/>Live updates</label>
          <p className="caption">Request clustered graph updates while the search progresses.</p>
          <label className="check"><input id="final-only" name="stream-mode" type="radio" checked={!stream} onChange={()=>setStream(false)}/>Final result only</label>
          <p className="caption">Cluster after the search finishes. The backend saves the completed result in either mode.</p>
        </section>
        {submitError&&<div className="notice error" role="alert">{submitError}</div>}
        {!canStart&&<p className="caption" role="status">Waiting for the run browser to identify this backend. Use “Retry run browser” if it is unavailable.</p>}
        <button className="primary" type="submit" disabled={busy||health.state!=='connected'||loading||!!catalogError||!canStart}>{busy?'Starting…':'Start run'}</button>
      </fieldset>
    </form></section>}
  </div>;
}
