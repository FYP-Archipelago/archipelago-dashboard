import React, { useEffect, useRef, useState } from 'react';

const file64 = file => new Promise((resolve,reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result).split(',')[1]);
  reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
  reader.readAsDataURL(file);
});

export default function LocalRuns({runs,refresh,onOpenLocal,request}) {
  const [tab,setTab]=useState('Zip archive'), [file,setFile]=useState(null), [loose,setLoose]=useState([]);
  const [source,setSource]=useState(''), [name,setName]=useState(''), [message,setMessage]=useState(''), [busy,setBusy]=useState(false);
  const [remove,setRemove]=useState(runs[0]?.id || ''), [confirm,setConfirm]=useState(false);
  const pending=useRef(false);
  useEffect(()=>{if(!runs.some(run=>run.id===remove)){setRemove(runs[0]?.id || '');setConfirm(false);}},[runs,remove]);
  const action=async operation=>{
    if(pending.current)return;
    pending.current=true;setBusy(true);setMessage('');
    try {const text=await operation();await refresh();setMessage(text);}
    catch(error){setMessage(error.message);}
    finally{pending.current=false;setBusy(false);}
  };
  const post=(url,body)=>request(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  const upload=()=>action(async()=>{
    let added;
    if(tab==='Zip archive')added=await post('/runs/upload',{name:name || file.name.replace(/\.zip$/,''),archive:await file64(file)});
    else if(tab==='Loose files'){
      const files={};for(const value of loose)files[value.name]=await file64(value);
      added=await post('/runs/upload',{name:name || 'uploaded-run',files});
    }else added=await post('/runs/import',{path:source});
    return `Added ${added.id} to the local library.`;
  });
  const deleteRun=()=>{
    if(!confirm || !remove)return;
    action(async()=>{await request(`/runs/${encodeURIComponent(remove)}`,{method:'DELETE'});setConfirm(false);return `Removed ${remove} from the local library.`;});
  };
  return <>
    <p className="body-copy">Open finished logs on this machine for local analysis. These files stay in the local library and are not submitted to the backend.</p>
    <div className="tabs">{['Zip archive','Loose files','From a path'].map(value=><button type="button" disabled={busy} key={value} className={tab===value?'active':''} onClick={()=>setTab(value)}>{value}</button>)}</div>
    <div className="tab-body">
      {tab==='Zip archive'&&<label>Local run archive<input disabled={busy} type="file" accept=".zip" onChange={event=>setFile(event.target.files?.[0])}/></label>}
      {tab==='Loose files'&&<label>Local run files<input disabled={busy} type="file" multiple onChange={event=>setLoose([...event.target.files])}/></label>}
      {tab==='From a path'?<label>Directory on the Node server's machine<input disabled={busy} value={source} onChange={event=>setSource(event.target.value)} placeholder="Path to run directory"/></label>:<label>Local run name (optional)<input value={name} disabled={busy} onChange={event=>setName(event.target.value)}/></label>}
      <p className="caption">An evaluations.csv file is required. Add run.jsonl and summary.json for migration, convergence and provenance records.</p>
      <button type="button" className="primary" disabled={busy||(tab==='Zip archive'&&!file)||(tab==='Loose files'&&!loose.length)||(tab==='From a path'&&!source)} onClick={upload}>{busy?'Working…':'Add to local library'}</button>
    </div>
    {message&&<div className="notice" role="status">{message}</div>}
    <h3>Files in this local library</h3>
    {runs.length?<>
      <div className="table-wrap"><table><thead><tr>{['Run','Evaluations','Islands','Migrations','Best fitness','Outcome','Size (MB)'].map(label=><th key={label}>{label}</th>)}</tr></thead><tbody>
        {runs.map(run=><tr key={run.id}><td><button className="secondary" type="button" onClick={()=>onOpenLocal(run.id)}>Open {run.id}</button></td>{[run.summary?.total_evaluations,run.summary?.islands_completed,run.summary?.total_migration_events,run.summary?.global_best_fitness,run.summary?.termination_reason,(Number(run.size||0)/1e6).toFixed(2)].map((value,index)=><td key={index}>{value??'—'}</td>)}</tr>)}
      </tbody></table></div>
      <details><summary>Remove a local run</summary><div className="details-body">
        <p className="caption">Deletes this copy from the local library. The source files and backend runs are untouched.</p>
        <label>Local run to remove<select value={remove} disabled={busy} onChange={event=>{setRemove(event.target.value);setConfirm(false);}}>{runs.map(run=><option key={run.id} value={run.id}>{run.id}</option>)}</select></label>
        <label className="check"><input name="confirm-local-delete" type="checkbox" disabled={busy} checked={confirm} onChange={event=>setConfirm(event.target.checked)}/>Yes, delete the local copy of {remove}</label>
        <button className="secondary" type="button" disabled={busy||!confirm||!remove} onClick={deleteRun}>Delete local run</button>
      </div></details>
    </>:<div className="notice">No local runs loaded.</div>}
  </>;
}
