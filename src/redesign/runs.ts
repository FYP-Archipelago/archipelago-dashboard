import type { Preset, Run, RunStatusName } from './api.ts';

export const isActive = (status: RunStatusName) => status === 'queued' || status === 'running' || status === 'clustering' || status === 'cancelling';

export type PresetMap = ReadonlyMap<string, Preset>;

export const runSetting = (presets: PresetMap, run: Run, key: string): unknown =>
  key in run.overrides ? run.overrides[key] : presets.get(run.preset)?.defaults[key];

export function ago(iso: string, now = Date.now()): string {
  const minutes = Math.round((now - Date.parse(iso)) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${hours} h ago` : `${Math.round(hours / 24)} d ago`;
}

export function duration(fromIso: string, toIso: string): string {
  const s = Math.max(0, Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;
  return `${Math.floor(s / 3600)}h ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}m`;
}
