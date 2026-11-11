import test from 'node:test';
import assert from 'node:assert/strict';
import { regionCameraTarget } from './region-focus.js';
test('region focus centers only selected nodes and fits portrait and landscape views', () => {
  const camera = { az: 0.6, el: 0.3, tx: 20, ty: 20, tz: 20, dist: 3 };
  assert.equal(regionCameraTarget([], 1, camera), null);
  const points = [
    [0, 0, 0],
    [2, 2, 2],
  ];
  const wide = regionCameraTarget(points, 2, camera),
    narrow = regionCameraTarget(points, 0.5, camera);
  assert.deepEqual([wide.tx, wide.ty, wide.tz], [1, 1, 1]);
  assert.equal(wide.az, camera.az);
  assert.equal(wide.el, camera.el);
  assert.ok(narrow.dist >= wide.dist);
  const horizontal = [
      [-1, 0, 0],
      [1, 0, 0],
    ],
    front = { ...camera, az: 0, el: 0 };
  assert.ok(regionCameraTarget(horizontal, 0.5, front).dist > regionCameraTarget(horizontal, 2, front).dist);
  assert.ok(Number.isFinite(regionCameraTarget([[1, 1, 1]], 1, camera).dist));
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
  assert.ok(target.dist < 0.01);
  const projectedHalfWidth = 0.001 / (target.dist * Math.tan(Math.PI / 8));
  assert.ok(Math.abs(projectedHalfWidth - 0.8) < 1e-10);
});
