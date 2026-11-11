import test from 'node:test';
import assert from 'node:assert/strict';
import { tourCameraPose, bestTourTarget, groupedTourTarget } from './camera-tour.js';
test('camera tour moves smoothly to a best node and holds the exact destination', () => {
  const from = { tx: 0, ty: 2, tz: -1, dist: 3.15, az: 0.62, el: 0.3 };
  const target = { ...from, tx: 8, ty: -0.9, tz: 3, dist: 0.9 };
  assert.deepEqual(tourCameraPose(from, target, 0), from);
  const halfway = tourCameraPose(from, target, 900);
  assert.equal(halfway.tx, 4);
  assert.equal(halfway.az, from.az);
  for (const elapsed of [1800, 3200]) {
    const actual = tourCameraPose(from, target, elapsed);
    for (const key of Object.keys(target)) assert.ok(Math.abs(actual[key] - target[key]) < 1e-12);
  }
  assert.ok(tourCameraPose(from, target, 100).tx < halfway.tx);
});

test('coincident best nodes still get distinct orbit angles and wider framing', () => {
  const origin = { tx: 0, ty: 0, tz: 0, dist: 3.15, az: 0.62, el: 0.3 };
  const first = bestTourTarget(origin, [0, -0.9, 0], 0);
  const second = bestTourTarget(origin, [0, -0.9, 0], 1);
  assert.ok(second.az > first.az);
  assert.equal(first.dist, 1.8);
  assert.deepEqual([second.tx, second.ty, second.tz], [0, -0.9, 0]);
  const restored = tourCameraPose(second, origin, 1800);
  for (const key of Object.keys(origin)) assert.ok(Math.abs(restored[key] - origin[key]) < 1e-12);
});

test('grouped tour frames the current island independently of other island separation', () => {
  const origin = { tx: 0, ty: 0, tz: 0, dist: 4.6, az: 0.62, el: 0.75 };
  const island = [
    [0, 0, 0],
    [0.1, 0.1, 0],
    [-0.1, 0, 0.1],
  ];
  const first = groupedTourTarget(origin, island[0], 0, island, 1);
  const shift = [10, 0, -8];
  const translated = island.map((p) => p.map((v, i) => v + shift[i]));
  const moved = groupedTourTarget(origin, translated[0], 0, translated, 1);
  assert.deepEqual([moved.tx, moved.ty, moved.tz], shift);
  assert.ok(Math.abs(first.dist - moved.dist) < 1e-12);
  assert.ok(first.dist < origin.dist);
  assert.equal(moved.el, origin.el);
});

test('grouped best close-up ignores distant nodes while retaining nearby context', () => {
  const origin = { tx: 0, ty: 0, tz: 0, dist: 4.6, az: 0.62, el: 0.75 };
  const local = Array.from({ length: 20 }, (_, i) => [i * 0.001, 0.002 * (i % 3), 0]);
  const withOutlier = [...local, [100, 100, 100]];
  const focus = groupedTourTarget(origin, [0, 0, 0], 0, withOutlier, 1);
  assert.ok(focus.dist < 0.1);
  assert.deepEqual([focus.tx, focus.ty, focus.tz], [0, 0, 0]);
  const duplicate = groupedTourTarget(origin, [0, 0, 0], 0, [...withOutlier, ...local], 1);
  assert.equal(duplicate.dist, focus.dist, 'Repeated coordinates must not crowd out nearby context');
});
