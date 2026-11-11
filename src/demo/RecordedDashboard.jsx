import React,{useEffect,useState} from 'react';
import DashboardApp from '../app/DashboardApp.jsx';
import {recordedApi,recordingStorage} from './recorded-api.js';

export default function RecordedDashboard({api=recordedApi,Workspace}) {
  const [state,setState]=useState({storage:null,error:''}),[retry,setRetry]=useState(0);
  useEffect(()=>{
    let active=true;const controller=new AbortController();
    setState({storage:null,error:''});
    Promise.all([api.recordings({signal:controller.signal}),api.identity()]).then(([entries,identity])=>{
      if(active)setState({storage:recordingStorage(entries,identity),error:''});
    }).catch(error=>{if(active)setState({storage:null,error:error.message});});
    return()=>{active=false;controller.abort();};
  },[api,retry]);
  if(state.storage)return <DashboardApp api={api} storage={state.storage} Workspace={Workspace}/>;
  return <main className="workspace-main"><h1>Archipelago</h1>{state.error?<div className="notice" role="alert">{state.error} <button className="secondary" onClick={()=>setRetry(value=>value+1)}>Retry</button></div>:<p role="status">Loading saved recordings…</p>}</main>;
}
