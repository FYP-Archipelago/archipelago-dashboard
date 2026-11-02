import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { backendIdentity } from './server/backend-proxy.js';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const backend = process.env.ARCHIPELAGO_BACKEND_URL || env.ARCHIPELAGO_BACKEND_URL || 'http://127.0.0.1:8000';
  return {
  plugins: [react(), {
    name:'local-backend-identity',
    configureServer(server) {
      server.middlewares.use((req,res,next)=>{
        if (req.method !== 'GET' || req.url?.split('?')[0] !== '/api/backend-config') return next();
        res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});
        res.end(JSON.stringify({backend_id:backendIdentity(backend)}));
      });
    },
  }],
  server: { proxy: {
    '/api': 'http://127.0.0.1:4174',
    '/backend': {target:backend, changeOrigin:true, rewrite:path=>path.replace(/^\/backend/, ''), timeout:0, proxyTimeout:0},
  } },
  };
});
