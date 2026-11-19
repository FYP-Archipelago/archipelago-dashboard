import React, { useEffect, useRef, useState } from 'react';
import { backendApi } from '../backend/api.js';
import ClusteringControls from './ClusteringControls.jsx';
import { buildRunRequest, initialClustering, runValueLabel, validatePresets } from './run-form.js';
import './runs.css';

const LABELS = {num_islands:'Islands',evaluation_budget:'Evaluation budget',target_generations:'Target generations','migration.enabled':'Migration','migration.topology':'Migration topology','migration.interval':'Migration interval (generations)','migration.num_migrants':'Migrants per event',seed:'Runner seed (optional)'};
const labelFor = key => LABELS[key] || key.replaceAll('_',' ');
const HELP = {
  evaluation_budget:'Total fitness evaluations shared across all islands.',
  target_generations:'Guides population size; it does not set a hard generation limit.',
  seed:'Blank uses a fresh seed; migration timing can still change the outcome.',
};

function OverrideField({name,rule,value,onChange,error,label=labelFor(name),formatChoice=runValueLabel}) {
  const description = [HELP[name]&&`hint-${name}`,error&&`error-${name}`].filter(Boolean).join(' ');
  const common = {name,'aria-invalid':!!error,'aria-describedby':description||undefined};
  const islandChoices = name==='num_islands' && Number.isSafeInteger(rule.min) && Number.isSafeInteger(rule.max) && rule.max>=rule.min && rule.max-rule.min<=12 ? Array.from({length:rule.max-rule.min+1},(_,index)=>rule.min+index) : null;
  return <label>{label}
    {rule.type === 'bool' ? <select {...common} value={String(!!value)} onChange={event=>onChange(event.target.value==='true')}><option value="true">Enabled</option><option value="false">Disabled</option></select> :
      rule.type === 'choice' || islandChoices ? <select {...common} value={value ?? ''} onChange={event=>onChange(event.target.value)}>{(islandChoices||rule.choices).map(choice=><option key={choice} value={choice}>{formatChoice(choice)}</option>)}</select> :
      <input {...common} type="number" step="1" min={rule.min} max={rule.max} value={value ?? ''} onChange={event=>onChange(event.target.value)} placeholder={rule.optional?'Automatic when blank':undefined}/>}
    {HELP[name]&&<small id={`hint-${name}`}>{HELP[name]}</small>}
    {error && <span id={`error-${name}`} className="field-error">{error}</span>}
  </label>;
}

export default function RunsPage({api=backendApi,onOpenRun,onBusyChange,canStart=true}) {
  const [catalog,setCatalog]=useState(null),[preset,setPreset]=useState(''),[drafts,setDrafts]=useState({});
  const [runner,setRunner]=useState('dea'),[hasVolpe,setHasVolpe]=useState(false),[volpeDrafts,setVolpeDrafts]=useState({});
  const isVolpe=runner==='volpe',runnerKey=isVolpe?runner:undefined;
  const [catalogError,setCatalogError]=useState(''),[loading,setLoading]=useState(true),[retry,setRetry]=useState(0);
  const [health,setHealth]=useState({state:'checking',message:''});
  const [clustering,setClustering]=useState(initialClustering),[stream,setStream]=useState(true);
  const [busy,setBusy]=useState(false),[errors,setErrors]=useState({}),[submitError,setSubmitError]=useState('');
  const submitting=useRef(false),mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  useEffect(()=>{onBusyChange?.(busy);},[busy,onBusyChange]);
  useEffect(()=>{
    let active=true;const controller=new AbortController();
    // Older backends can continue serving dEA without a runner registry.
    api.runners?.({signal:controller.signal}).then(value=>{
      if(active&&Array.isArray(value?.runners))setHasVolpe(value.runners.includes('volpe'));
    }).catch(()=>{});
    return()=>{active=false;controller.abort();};
  },[api,retry]);
  useEffect(()=>{
    let active=true;const controller=new AbortController();
    setHealth({state:'checking',message:''});setLoading(true);setCatalogError('');
    const options={signal:controller.signal,runnerKey};
    api.health(options).then(value=>{
      if(!active)return;
      const ok=value?.status==='ok'&&value?.db===true&&value?.redis===true;
      const ready=ok&&value.ready!==false;
      const message=!ok?'The backend reports that its database or Redis is unavailable.':ready?'':`${isVolpe?'VolPE Runner':'dEA Runner'} is unavailable.`;
      setHealth({state:ok?'connected':'unavailable',ready,message});
    }).catch(error=>{if(active)setHealth({state:'unavailable',message:error.message});});
    api.presets(options).then(value=>validatePresets(value,{requireRunnerOptions:isVolpe})).then(value=>{
      if(!active)return;
      setCatalog({runner,value});setPreset(current=>current||value.presets[0].preset);
    }).catch(error=>{if(active)setCatalogError(error.message);}).finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;controller.abort();};
  },[api,isVolpe,retry,runner,runnerKey]);
  const options=catalog?.value,selected=options?.presets.find(item=>item.preset===preset),values=drafts[preset]||{};
  const volpeOptions=isVolpe&&catalog?.runner===runner?options.runner_options:null;
  const volpeValues=volpeDrafts[preset]||{};
  const changeValue=(key,value)=>setDrafts(current=>({...current,[preset]:{...current[preset],[key]:value}}));
  const changeVolpeValue=(key,value)=>setVolpeDrafts(current=>({...current,[preset]:{...current[preset],[key]:value}}));
  const clearErrors=()=>{setErrors({});setSubmitError('');};
  const changeRunner=event=>{
    setRunner(event.target.value);setLoading(true);setHealth({state:'checking',message:''});clearErrors();
  };
  const submit=async event=>{
    event.preventDefault();
    if(submitting.current||loading||!health.ready||catalogError||!canStart||!selected||catalog.runner!==runner)return;
    clearErrors();
    let body;
    try{body=buildRunRequest({catalog:options,preset,values,runnerKey,runnerValues:volpeValues,clustering,stream});}
    catch(error){setErrors(error.fields||{});setSubmitError(error.message);return;}
    submitting.current=true;setBusy(true);
    try{
      const run=await api.createRun(body);
      onOpenRun(run.run_id,{run});
    }catch(error){if(mounted.current)setSubmitError(error.message);}
    finally{submitting.current=false;if(mounted.current)setBusy(false);}
  };
  return <div className="runs-page">
    <header className="page-head"><h1>Start a new run</h1></header>
    <div className="backend-connection" role="status" aria-live="polite"><span className={`status-dot ${health.state==='connected'?'online':''}`}/><strong>{health.state==='connected'?'Backend connected':health.state==='checking'?'Checking backend…':'Backend unavailable'}</strong><button type="button" onClick={()=>setRetry(value=>value+1)} disabled={busy}>Retry connection</button></div>
    {health.message&&<div className="notice error" role="alert">{health.message}</div>}
    {loading&&<p role="status">Loading presets…</p>}
    {catalogError&&<div className="notice error" role="alert">{catalogError}</div>}
    <section className="run-entry"><form className="new-run-form" onSubmit={submit} noValidate aria-busy={busy}>
      <section className="run-preset" aria-label="Preset selection">
        <div className="param-grid">
          <label>Runner<select name="runner" value={runner} onChange={changeRunner} disabled={busy}>
            <option value="dea">dEA Runner</option>
            {(hasVolpe||isVolpe)&&<option value="volpe">VolPE Runner</option>}
          </select></label>
          {options&&<label>Preset<select name="preset" value={preset} onChange={event=>{setPreset(event.target.value);clearErrors();}} disabled={busy||loading||!!catalogError}>
            {!selected&&<option value={preset} disabled>{preset} (unavailable on this runner)</option>}
            {options.presets.map(item=><option key={item.preset} value={item.preset}>{item.algorithm.toUpperCase()} · {runValueLabel(item.benchmark)} — {item.preset}</option>)}
          </select></label>}
        </div>
      </section>
      {selected&&<fieldset disabled={busy||loading||!!catalogError}>
        <section className="runner-controls" aria-labelledby="runner-title"><h3 id="runner-title">Runner settings</h3>
        <div className="param-grid">{Object.entries(options.overrides).map(([key,rule])=><OverrideField key={`${preset}:${key}`} name={key} rule={rule} value={Object.hasOwn(values,key)?values[key]:selected.defaults[key]} onChange={value=>changeValue(key,value)} error={errors[key]}/>)}</div>
        </section>
        {volpeOptions&&<section className="runner-controls runner-options" aria-labelledby="volpe-settings-title"><h3 id="volpe-settings-title">VolPE settings</h3>
          <div className="param-grid">{Object.entries(volpeOptions).map(([key,rule])=><OverrideField key={`${preset}:${key}`} name={key} rule={rule} label={rule.label} formatChoice={String} value={Object.hasOwn(volpeValues,key)?volpeValues[key]:rule.default} onChange={value=>changeVolpeValue(key,value)} error={errors[key]}/>)}</div>
        </section>}
        <ClusteringControls value={clustering} onChange={setClustering} errors={errors}/>
        <section className="run-display-mode" aria-labelledby="display-mode-title"><h3 id="display-mode-title">Display mode</h3>
          <div className="display-options" role="radiogroup" aria-labelledby="display-mode-title">
            <label className="display-option"><input id="live-updates" name="stream-mode" type="radio" value="live" aria-labelledby="live-mode-label" aria-describedby="live-mode-help" checked={stream} onChange={()=>setStream(true)}/><span><strong id="live-mode-label">Live updates</strong><small id="live-mode-help">Update the clustered graph as the run progresses.</small></span></label>
            <label className="display-option"><input id="final-only" name="stream-mode" type="radio" value="batch" aria-labelledby="batch-mode-label" aria-describedby="batch-mode-help" checked={!stream} onChange={()=>setStream(false)}/><span><strong id="batch-mode-label">Final result only</strong><small id="batch-mode-help">Cluster after execution and show the completed graph.</small></span></label>
          </div>
        </section>
        {submitError&&<div className="notice error" role="alert">{submitError}</div>}
        {!canStart&&<p className="caption" role="status">Waiting for the run browser to identify this backend. Use “Retry run browser” if it is unavailable.</p>}
        <button className="primary" type="submit" disabled={busy||!health.ready||loading||!!catalogError||!canStart}>{busy?'Starting…':'Start run'}</button>
      </fieldset>}
    </form></section>
  </div>;
}
