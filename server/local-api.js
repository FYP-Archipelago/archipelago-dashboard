import {backendIdentity} from './backend-proxy.js';

// Shared by Vite and the local static server. No run files or calculations.
export function handleLocalApi(req,res,{backendUrl}={}) {
  const pathname=req.url?.split('?')[0];
  if(pathname!=='/api'&&!pathname?.startsWith('/api/'))return false;
  let status=404,value={error:'Not found'};
  if(req.method==='GET'&&pathname==='/api/backend-config'){
    try{value={backend_id:backendIdentity(backendUrl)};status=200;}
    catch(error){status=503;value={error:error.message};}
  }else if(req.method==='GET'&&pathname==='/api/status'){status=200;value={ok:true};}
  res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});
  res.end(JSON.stringify(value));
  return true;
}
