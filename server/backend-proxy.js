import http from 'node:http';
import https from 'node:https';

const RUN = 'run-\\d{8}T\\d{6}Z-[a-f0-9]{8}';
const READ = new RegExp(`^/(?:health|presets|runs/${RUN}/(?:events|result))$`);
const WRITE = new RegExp(`^/(?:runs|runs/${RUN}/cancel)$`);
export function backendIdentity(baseUrl = process.env.ARCHIPELAGO_BACKEND_URL || 'http://127.0.0.1:8000') {
  const target = new URL(baseUrl);
  if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password || target.search || target.hash)
    throw new Error('Invalid ARCHIPELAGO_BACKEND_URL.');
  return target.href.replace(/\/+$/, '');
}
const fail = (res, status, detail) => {
  if (res.headersSent) return res.destroy();
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ detail }));
};

// A fixed server-configured upstream, shared by local npm start and tests.
// StreamingResponse bytes pass through without buffering or a request-length timeout.
export function proxyBackend(req, res, { baseUrl = process.env.ARCHIPELAGO_BACKEND_URL || 'http://127.0.0.1:8000' } = {}) {
  const incoming = new URL(req.url, 'http://localhost');
  const endpoint = incoming.pathname.replace(/^\/backend(?=\/)/, '');
  if (!((req.method === 'GET' && READ.test(endpoint)) || (req.method === 'POST' && WRITE.test(endpoint))))
    return fail(res, 404, 'Backend endpoint not found.');
  let target;
  try {
    target = new URL(backendIdentity(baseUrl) + endpoint + incoming.search);
  } catch {
    return fail(res, 503, 'Invalid ARCHIPELAGO_BACKEND_URL.');
  }
  const headers = {};
  for (const key of ['accept', 'content-type', 'content-length', 'last-event-id', 'accept-encoding'])
    if (req.headers[key]) headers[key] = req.headers[key];
  const upstream = (target.protocol === 'https:' ? https : http).request(target, { method: req.method, headers }, (response) => {
    const forwarded = {};
    for (const key of ['content-type', 'content-encoding', 'cache-control', 'vary', 'x-accel-buffering'])
      if (response.headers[key]) forwarded[key] = response.headers[key];
    res.writeHead(response.statusCode, forwarded);
    res.flushHeaders();
    response.on('error', () => res.destroy());
    response.pipe(res);
  });
  upstream.on('error', () => fail(res, 502, 'Cannot reach the backend. Check ARCHIPELAGO_BACKEND_URL and that the backend is running.'));
  req.on('aborted', () => upstream.destroy());
  res.on('close', () => upstream.destroy());
  req.pipe(upstream);
}
