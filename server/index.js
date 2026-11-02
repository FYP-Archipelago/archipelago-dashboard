import http from 'node:http';
import path from 'node:path';
import {readFile,stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {proxyBackend} from './backend-proxy.js';
import {handleLocalApi} from './local-api.js';

const PORT=Number(process.env.PORT||process.env.ARCHIPELAGO_REWRITE_PORT||4174);
const HOST=process.env.HOST||'127.0.0.1';
const DIST_ROOT=path.resolve(import.meta.dirname,'../dist');
const json=(res,value,status=200)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8'});res.end(JSON.stringify(value));};
const fail=(res,error,status=400)=>json(res,{error:String(error.message||error)},status);
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.ico':'image/x-icon','.woff2':'font/woff2'};

async function staticFile(req, res, pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return fail(res, 'Not found', 404);
  let relative;
  try { relative = decodeURIComponent(pathname).replace(/^\/+/, ''); } catch { return fail(res, 'Invalid path'); }
  const target = path.resolve(DIST_ROOT, relative);
  if (target !== DIST_ROOT && !target.startsWith(DIST_ROOT + path.sep)) return fail(res, 'Invalid path');
  let file = target;
  try { if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html'); }
  catch { if (path.extname(relative)) return fail(res, 'Not found', 404); file = path.join(DIST_ROOT, 'index.html'); }
  try {
    const bytes = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'content-length': bytes.length });
    res.end(req.method === 'HEAD' ? undefined : bytes);
  } catch { fail(res, 'Build the frontend with npm run build', 503); }
}

export async function handler(req,res) {
  try{
    const url=new URL(req.url,`http://${req.headers.host}`);
    if(url.pathname.startsWith('/backend/'))return proxyBackend(req,res);
    if(handleLocalApi(req,res))return;
    return staticFile(req,res,url.pathname);
  }catch(error){fail(res,error,400);}
}

if(process.argv[1]===fileURLToPath(import.meta.url)){
  http.createServer(handler).listen(PORT,HOST,()=>console.log(`Archipelago dashboard on http://${HOST}:${PORT}`));
}
