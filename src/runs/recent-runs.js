export const HISTORY_KEY = 'archipelago.backend-runs.v1';
export const isRunId = value => typeof value === 'string' && /^run-\d{8}T\d{6}Z-[a-f0-9]{8}$/.test(value);
const backendKey = value => String(value).replace(/\/+$/, '');
function allEntries(storage) {
  try {
    const data = JSON.parse(storage?.getItem(HISTORY_KEY) || 'null');
    if (data?.version !== 1 || !Array.isArray(data.runs)) return [];
    return data.runs.filter(item=>item && isRunId(item.run_id) && typeof item.backend === 'string' && typeof item.at === 'string' && Number.isFinite(Date.parse(item.at)));
  } catch {return [];}
}
export function readRecentRuns(storage, backend) {
  const seen = new Set();
  return allEntries(storage).filter(item=>{
    if (item.backend !== backendKey(backend) || seen.has(item.run_id)) return false;
    seen.add(item.run_id);return true;
  }).slice(0,30);
}
function save(storage, runs) {
  try {
    if (!storage) throw new Error();
    storage.setItem(HISTORY_KEY, JSON.stringify({version:1,runs}));
  } catch {throw new Error('This browser could not remember the run. Keep its run ID to reopen it.');}
}
export function rememberRun(storage, backend, entry) {
  if (!isRunId(entry?.run_id)) throw new Error('Invalid run ID.');
  const key = backendKey(backend);
  const value = {backend:key,run_id:entry.run_id,preset:typeof entry.preset === 'string' ? entry.preset : '',source:['new','upload','manual'].includes(entry.source)?entry.source:'manual',at:entry.at || new Date().toISOString()};
  const entries = allEntries(storage);
  const same = entries.filter(item=>item.backend === key && item.run_id !== value.run_id);
  save(storage,[value,...same].slice(0,30).concat(entries.filter(item=>item.backend !== key)));
  return readRecentRuns(storage, key);
}
export function forgetRun(storage, backend, id) {
  save(storage,allEntries(storage).filter(item=>item.backend !== backendKey(backend) || item.run_id !== id));
  return readRecentRuns(storage, backend);
}
