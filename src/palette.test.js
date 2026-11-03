import test from 'node:test';
import assert from 'node:assert/strict';
import { PALETTES, loadPalette, applyPalette } from './palette.js';

test('palette testing offers the four agreed dark palettes', () => {
  assert.deepEqual(PALETTES.map(p => p.id), ['tidal', 'graphite', 'midnight', 'fieldwork']);
  assert.deepEqual(PALETTES.map(p => p.name), ['Tidal', 'Graphite', 'Midnight', 'Fieldwork']);
});

test('a saved palette is restored, with Graphite as the existing default', () => {
  assert.equal(loadPalette({ getItem: () => 'tidal' }), 'tidal');
  assert.equal(loadPalette({ getItem: () => null }), 'graphite');
  assert.equal(loadPalette({ getItem: () => 'unknown' }), 'graphite');
  assert.equal(loadPalette({ getItem() { throw Error('Storage blocked'); } }), 'graphite');
});

test('switching updates the document and persists the choice without navigation', () => {
  const root = { dataset: {} }, writes = [];
  for (const { id } of PALETTES) {
    applyPalette(id, root, { setItem: (...args) => writes.push(args) });
    assert.equal(root.dataset.palette, id);
    assert.deepEqual(writes.at(-1), ['archipelago-palette', id]);
  }
});

test('switching still works with blocked storage and rejects unknown palettes', () => {
  const root = { dataset: {} };
  applyPalette('midnight', root, { setItem() { throw Error('Storage blocked'); } });
  assert.equal(root.dataset.palette, 'midnight');
  applyPalette('unknown', root, { setItem() {} });
  assert.equal(root.dataset.palette, 'graphite');
});
