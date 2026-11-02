import React, { useEffect, useState } from 'react';
import { backendApi } from '../backend/api.js';
import RunWorkspace from '../backend/RunWorkspace.jsx';
import RunsPage from '../runs/RunsPage.jsx';
import { acceptedConfiguration } from '../runs/recent-runs.js';
import { readRoute, runHash, RUN_VIEWS } from '../runs/navigation.js';
import useRunLibrary, { browserStorage } from './useRunLibrary.js';
import RunBrowserSidebar from './RunBrowserSidebar.jsx';
import RunConfiguration from './RunConfiguration.jsx';
import AnalysisPlaceholder from './AnalysisPlaceholder.jsx';
import './workspace.css';

export default function DashboardApp({api=backendApi,storage=browserStorage(),Workspace=RunWorkspace}) {
  const [route,setRoute]=useState(()=>readRoute(window.location.hash));
  const [warning,setWarning]=useState(''),[busy,setBusy]=useState(false),[accepted,setAccepted]=useState(null);
  const library=useRunLibrary({api,storage});
  const navigate=hash=>{if(window.location.hash!==hash)window.history.pushState(null,'',hash);setRoute(readRoute(hash));};
  useEffect(()=>{
    const sync=()=>{setRoute(readRoute(window.location.hash));setWarning('');};
    window.addEventListener('hashchange',sync);window.addEventListener('popstate',sync);
    return()=>{window.removeEventListener('hashchange',sync);window.removeEventListener('popstate',sync);};
  },[]);
  const openRun=(id,{run}={})=>{
    let notice='';const configuration=acceptedConfiguration(run);
    if(configuration)setAccepted({backendKey:library.backendKey,runId:id,configuration});
    try{library.remember({run_id:id,preset:run?.preset,source:run?'new':'manual',configuration});}
    catch(error){notice=error.message;}
    setWarning(notice);
    navigate(runHash(id,!run&&route.page!=='library'?route.page:'archipelago'));
  };
  const configuration=library.entries.find(entry=>entry.run_id===route.runId)?.configuration ||
    (library.backendKey&&accepted?.backendKey===library.backendKey&&accepted?.runId===route.runId?accepted.configuration:undefined);
  const newRun=()=>{setWarning('');navigate('#library');};
  return <div className="app workspace-shell">
    <header className="workspace-topbar">
      <div className="brand"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M3 17L8 6l5 9 5-12 3 14"/></svg><span>Archipelago</span></div>
      <nav aria-label="Current run">{RUN_VIEWS.map(([page,label])=><button type="button" key={page} disabled={busy||!route.runId} title={!route.runId?'Start or select a run to open this view':undefined} className={route.runId&&route.page===page?'active':''} aria-current={route.runId&&route.page===page?'page':undefined} onClick={()=>navigate(runHash(route.runId,page))}>{label}</button>)}</nav>
      {route.runId&&<code className="current-run-id" title={route.runId}>{route.runId}</code>}
    </header>
    <RunBrowserSidebar library={library} selectedId={route.runId} onOpenRun={openRun} onNewRun={newRun} busy={busy}/>
    <main className="workspace-main">
      {warning&&<div className="notice" role="status">{warning}</div>}
      <div hidden={route.page!=='library'&&!!route.runId}><RunsPage api={api} onOpenRun={openRun} onBusyChange={setBusy} canStart={!!library.backendKey&&!library.loading}/></div>
      {route.runId&&route.page==='configuration'&&<RunConfiguration configuration={configuration} runId={route.runId}/>}
      {route.runId&&route.page==='archipelago'&&<Workspace runId={route.runId} api={api} onBack={newRun} warning=""/>}
      {route.runId&&['migration','convergence','diagnostics','run'].includes(route.page)&&<AnalysisPlaceholder view={route.page} runId={route.runId}/>}
      <footer>Archipelago · Distributed evolutionary search</footer>
    </main>
  </div>;
}
