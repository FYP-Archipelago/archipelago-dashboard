import { test, expect } from 'vitest';
import { regionCameraTarget } from './region-focus.js';
test('region focus centers only selected nodes and fits portrait and landscape views', () => {
  const camera = { az: 0.6, el: 0.3, tx: 20, ty: 20, tz: 20, dist: 3 };
  expect(regionCameraTarget([], 1, camera)).toBe(null);
  const points = [
    [0, 0, 0],
    [2, 2, 2],
  ];
  const wide = regionCameraTarget(points, 2, camera),
    narrow = regionCameraTarget(points, 0.5, camera);
  expect([wide.tx, wide.ty, wide.tz]).toStrictEqual([1, 1, 1]);
  expect(wide.az).toBe(camera.az);
  expect(wide.el).toBe(camera.el);
  expect(narrow.dist >= wide.dist).toBeTruthy();
  const horizontal = [
      [-1, 0, 0],
      [1, 0, 0],
    ],
    front = { ...camera, az: 0, el: 0 };
  expect(regionCameraTarget(horizontal, 0.5, front).dist > regionCameraTarget(horizontal, 2, front).dist).toBeTruthy();
  expect(Number.isFinite(regionCameraTarget([[1, 1, 1]], 1, camera).dist)).toBeTruthy();
});

test('tiny best-node regions expand to canvas scale instead of a fixed zoom distance', () => {
  const cam = { az: 0, el: 0, tx: 0, ty: 0, tz: 0, dist: 3 };
  const target = regionCameraTarget(
    [
      [-0.001, 0, 0],
      [0.001, 0, 0],
    ],
    1,
    cam
  );
  expect(target.dist < 0.01).toBeTruthy();
  const projectedHalfWidth = 0.001 / (target.dist * Math.tan(Math.PI / 8));
  expect(Math.abs(projectedHalfWidth - 0.8) < 1e-10).toBeTruthy();
});
