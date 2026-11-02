import { isRunId } from './recent-runs.js';
const pages = new Set(['library','archipelago','migration','convergence','run','study','overview']);
export function readRoute(hash) {
  const [raw,query] = String(hash || '').replace(/^#/, '').split('?');
  const page = pages.has(raw) ? raw : 'library';
  const id = new URLSearchParams(query || '').get('run_id');
  return {page,runId:page === 'archipelago' && isRunId(id) ? id : null};
}
export function runHash(runId) {
  if (!isRunId(runId)) throw new Error('Invalid run ID.');
  return `#archipelago?run_id=${encodeURIComponent(runId)}`;
}
export function localRunHash(page='archipelago') {
  return `#${['archipelago','migration','convergence','run'].includes(page)?page:'archipelago'}`;
}
