import { defineConfig, loadEnv } from 'vite';
import { readFile } from 'node:fs/promises';
import react from '@vitejs/plugin-react';
import { handleLocalApi } from './server/local-api.js';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const backend = process.env.ARCHIPELAGO_BACKEND_URL || env.ARCHIPELAGO_BACKEND_URL || 'http://127.0.0.1:8000';
  return {
  plugins: [react(), {
    name:'local-backend-identity',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const match = req.method === 'GET' && req.url?.split('?')[0].match(
          /^\/api\/local-convergence\/(run-\d{8}T\d{6}Z-[a-f0-9]{8})$/,
        );
        if (!match) return next();
        const file = new URL(`./.superpowers/faculty/convergence/${match[1]}.json`, import.meta.url);
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-store');
        try {
          res.end(await readFile(file));
        } catch (error) {
          res.statusCode = error.code === 'ENOENT' ? 404 : 500;
          res.end(JSON.stringify({detail: 'The local generation history could not be loaded.'}));
        }
      });
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
