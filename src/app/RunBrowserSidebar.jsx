import React, { useState } from 'react';
import { isRunId } from '../runs/recent-runs.js';

export default function RunBrowserSidebar({library,selectedId,onOpenRun,onNewRun,busy=false,recorded=false}) {
  const [id,setId]=useState(''),[error,setError]=useState('');
  const open=event=>{
    event.preventDefault();const value=id.trim();
    if(!isRunId(value)){setError('Enter a valid run ID: run-YYYYMMDDTHHMMSSZ-xxxxxxxx.');return;}
    setError('');onOpenRun(value);
  };
  return <aside className="run-browser" aria-label="Run browser">
    <div className="browser-heading"><h2>Run browser</h2>{!recorded&&<button className="primary" type="button" onClick={onNewRun} disabled={busy}>New run</button>}</div>
    <p className="caption">{recorded?'Published recordings. All recordings are restored when the page reloads.':'Browser-local run history for the selected backend; server-wide history is unavailable.'}</p>
    <form className="open-run-form" onSubmit={open} noValidate>
      <label>Open by run ID<input name="run_id" value={id} onChange={event=>setId(event.target.value)} placeholder="run-YYYYMMDDTHHMMSSZ-xxxxxxxx" aria-invalid={!!error}/></label>
      {error&&<p className="field-error" role="alert">{error}</p>}
      <button type="submit" className="secondary" disabled={busy}>Open run</button>
    </form>
    {library.loading&&<p className="caption" role="status">Loading remembered runs…</p>}
    {library.error&&<p className="notice error" role="alert">{library.error}</p>}
    {!library.loading&&!library.entries.length&&<p className="caption">No runs remembered for this backend yet.</p>}
    <ul className="browser-runs">{library.entries.map(entry=><li key={entry.run_id} className={entry.run_id===selectedId?'selected':''}>
      <button type="button" className="recent-open" data-run-id={entry.run_id} onClick={()=>onOpenRun(entry.run_id)} disabled={busy} aria-current={entry.run_id===selectedId?'true':undefined}>
        <strong>{entry.preset || 'Backend run'}</strong><code>{entry.run_id}</code>
        {entry.configuration&&<span className="requested-mode">{entry.configuration.stream?'Live updates requested':'Final result only'}</span>}
        <small>{new Date(entry.at).toLocaleString()}</small>
      </button>
      {!recorded&&<button className="forget-run" type="button" aria-label={`Forget ${entry.run_id}`} disabled={busy} onClick={()=>library.remove(entry.run_id)}>Forget</button>}
    </li>)}</ul>
    <div className="browser-backend"><span>{recorded?'Data source':'Backend'}</span><code>{library.backendKey || apiLabel(library.loading)}</code><button className="text-button" type="button" onClick={library.retry} disabled={busy}>Retry run browser</button></div>
  </aside>;
}
const apiLabel=loading=>loading?'Checking…':'Unavailable';
