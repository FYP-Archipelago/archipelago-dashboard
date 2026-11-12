import { test, expect } from 'vitest';
import { tourCameraPose, bestTourTarget, groupedTourTarget } from './camera-tour.js';
test('camera tour moves smoothly to a best node and holds the exact destination', () => {
  const from = { tx: 0, ty: 2, tz: -1, dist: 3.15, az: 0.62, el: 0.3 };
  const target = { ...from, tx: 8, ty: -0.9, tz: 3, dist: 0.9 };
  expect(tourCameraPose(from, target, 0)).toStrictEqual(from);
  const halfway = tourCameraPose(from, target, 900);
  expect(halfway.tx).toBe(4);
  expect(halfway.az).toBe(from.az);
  for (const elapsed of [1800, 3200]) {
    const actual = tourCameraPose(from, target, elapsed);
    for (const key of Object.keys(target)) expect(Math.abs(actual[key] - target[key]) < 1e-12).toBeTruthy();
  }
  expect(tourCameraPose(from, target, 100).tx < halfway.tx).toBeTruthy();
});

test('coincident best nodes still get distinct orbit angles and wider framing', () => {
  const origin = { tx: 0, ty: 0, tz: 0, dist: 3.15, az: 0.62, el: 0.3 };
  const first = bestTourTarget(origin, [0, -0.9, 0], 0);
  const second = bestTourTarget(origin, [0, -0.9, 0], 1);
  expect(second.az > first.az).toBeTruthy();
  expect(first.dist).toBe(1.8);
  expect([second.tx, second.ty, second.tz]).toStrictEqual([0, -0.9, 0]);
  const restored = tourCameraPose(second, origin, 1800);
  for (const key of Object.keys(origin)) expect(Math.abs(restored[key] - origin[key]) < 1e-12).toBeTruthy();
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
  expect([moved.tx, moved.ty, moved.tz]).toStrictEqual(shift);
  expect(Math.abs(first.dist - moved.dist) < 1e-12).toBeTruthy();
  expect(first.dist < origin.dist).toBeTruthy();
  expect(moved.el).toBe(origin.el);
});

test('grouped best close-up ignores distant nodes while retaining nearby context', () => {
  const origin = { tx: 0, ty: 0, tz: 0, dist: 4.6, az: 0.62, el: 0.75 };
  const local = Array.from({ length: 20 }, (_, i) => [i * 0.001, 0.002 * (i % 3), 0]);
  const withOutlier = [...local, [100, 100, 100]];
  const focus = groupedTourTarget(origin, [0, 0, 0], 0, withOutlier, 1);
  expect(focus.dist < 0.1).toBeTruthy();
  expect([focus.tx, focus.ty, focus.tz]).toStrictEqual([0, 0, 0]);
  const duplicate = groupedTourTarget(origin, [0, 0, 0], 0, [...withOutlier, ...local], 1);
  expect(duplicate.dist, 'Repeated coordinates must not crowd out nearby context').toBe(focus.dist);
});
