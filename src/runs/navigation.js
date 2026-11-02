import { isRunId } from './recent-runs.js';
export const RUN_VIEWS=[['archipelago','Archipelago'],['migration','Migration'],['convergence','Convergence'],['diagnostics','Clustering'],['run','Run details'],['configuration','Run configuration']];
const pages = new Set(['library','study','about',...RUN_VIEWS.map(([page])=>page)]);
export function readRoute(hash) {
  const [raw,query] = String(hash || '').replace(/^#/, '').split('?');
  const page = pages.has(raw) ? raw : 'library';
  const id = new URLSearchParams(query || '').get('run_id');
  return {page,runId:RUN_VIEWS.some(([view])=>view===page) && isRunId(id) ? id : null};
}
export function runHash(runId,page='archipelago') {
  if (!isRunId(runId)) throw new Error('Invalid run ID.');
  if (!RUN_VIEWS.some(([id])=>id===page)) throw new Error('Unknown run view.');
  return `#${page}?run_id=${encodeURIComponent(runId)}`;
}
