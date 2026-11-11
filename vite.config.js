import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { handleLocalApi } from './server/local-api.js';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const backend = process.env.ARCHIPELAGO_BACKEND_URL || env.ARCHIPELAGO_BACKEND_URL || 'http://127.0.0.1:8000';
  return {
  plugins: [react(), {
    name:'local-backend-identity',
    configureServer(server) {
      server.middlewares.use((req,res,next)=>{
        if (!handleLocalApi(req,res,{backendUrl:backend})) next();
      });
    },
  }],
  server: { proxy: {
    '/backend': {target:backend, changeOrigin:true, rewrite:path=>path.replace(/^\/backend/, ''), timeout:0, proxyTimeout:0},
  } },
  };
});
