export const PALETTES = [
  { id: 'tidal', name: 'Tidal', colour: '#65d2bd', description: 'Deep teal' },
  { id: 'graphite', name: 'Graphite', colour: '#d6dbb2', description: 'Charcoal and sage' },
  { id: 'midnight', name: 'Midnight', colour: '#9cafff', description: 'Navy and periwinkle' },
  { id: 'fieldwork', name: 'Fieldwork', colour: '#abd49b', description: 'Forest green' },
];

const KEY = 'archipelago-palette';
const validPalette = id => PALETTES.some(p => p.id === id) ? id : 'graphite';

export function loadPalette(storage) {
  try { return validPalette((storage ?? window.localStorage).getItem(KEY)); }
  catch { return 'graphite'; }
}

export function applyPalette(id, root = document.documentElement, storage) {
  const palette = validPalette(id);
  root.dataset.palette = palette;
  try { (storage ?? window.localStorage).setItem(KEY, palette); } catch {}
}
