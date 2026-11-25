// An orbit camera: it looks at (tx, ty, tz) from `dist` away, turned `az` around the vertical axis and raised `el`.
export type Camera = { az: number; el: number; dist: number; tx: number; ty: number; tz: number };

export const HOME: Camera = { az: 0.62, el: 0.3, dist: 3.15, tx: 0, ty: 0, tz: 0 };
export const TOP_DOWN: Camera = { ...HOME, az: 0, el: Math.PI / 2 };
// Grouped islands look better from higher up, where the migration arches between the patches stand out.
export const GROUPED: Camera = { ...HOME, el: 0.75 };

// The vertical field of view is 45 degrees.
export const FOV = Math.PI / 4;

export function perspective(aspect: number, near: number, far: number): Float32Array {
  const f = 1 / Math.tan(FOV / 2);
  const nf = 1 / (near - far);
  return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
}

type Vec3 = [number, number, number];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const MIN_FRAME_DISTANCE = 0.25;

export function viewMatrix(cam: Camera): Float32Array {
  // The orbit angles define the screen axes even when looking straight down.
  const { right, up, back } = basis(cam);
  const target: Vec3 = [cam.tx, cam.ty, cam.tz];
  return new Float32Array([
    right[0],
    up[0],
    back[0],
    0,
    right[1],
    up[1],
    back[1],
    0,
    right[2],
    up[2],
    back[2],
    0,
    -dot(right, target),
    -dot(up, target),
    -dot(back, target) - cam.dist,
    1,
  ]);
}

export function multiply(a: Float32Array, b: Float32Array): Float32Array {
  const out = new Float32Array(16);
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++)
      out[c * 4 + r] = a[r]! * b[c * 4]! + a[4 + r]! * b[c * 4 + 1]! + a[8 + r]! * b[c * 4 + 2]! + a[12 + r]! * b[c * 4 + 3]!;
  return out;
}

// The direction from the target back to the eye, and the screen's right and up directions in world space.
export function basis(cam: Camera) {
  const back: Vec3 = [Math.sin(cam.az) * Math.cos(cam.el), Math.sin(cam.el), Math.cos(cam.az) * Math.cos(cam.el)];
  const right: Vec3 = [Math.cos(cam.az), 0, -Math.sin(cam.az)];
  const up: Vec3 = [-Math.sin(cam.az) * Math.sin(cam.el), Math.cos(cam.el), -Math.cos(cam.az) * Math.sin(cam.el)];
  return { back, right, up };
}

export const eyeOf = (cam: Camera): Vec3 => {
  const { back } = basis(cam);
  return [cam.tx + back[0] * cam.dist, cam.ty + back[1] * cam.dist, cam.tz + back[2] * cam.dist];
};

// A camera with the same orientation that fits the points' bounding box in 80% of the view.
function framePoints(points: Vec3[], aspect: number, cam: Camera): Camera | null {
  if (!points.length) return null;
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (const p of points)
    for (let i = 0; i < 3; i++) {
      lo[i] = Math.min(lo[i]!, p[i]!);
      hi[i] = Math.max(hi[i]!, p[i]!);
    }
  const centre = lo.map((v, i) => (v + hi[i]!) / 2) as Vec3;
  const { back, right, up } = basis(cam);
  const tanY = Math.tan(FOV / 2) * 0.8;
  const tanX = tanY * aspect;
  let dist = MIN_FRAME_DISTANCE;
  for (const p of points) {
    const d: Vec3 = [p[0] - centre[0], p[1] - centre[1], p[2] - centre[2]];
    const depth = dot(d, back);
    dist = Math.max(dist, depth + Math.abs(dot(d, right)) / tanX, depth + Math.abs(dot(d, up)) / tanY);
  }
  return { ...cam, tx: centre[0], ty: centre[1], tz: centre[2], dist };
}

// The camera at `start`'s angle that centres the middle 90% of the clusters in the area the controls leave free
// (`insets`, CSS pixels) and fits all of them in 90% of it. Perspective makes each step inexact, so it takes rounds.
export function fitOnScreen(
  points: Vec3[],
  width: number,
  height: number,
  insets: { top: number; bottom: number; side: number },
  start: Camera
): Camera | null {
  let cam = width >= 1 && height >= 1 ? framePoints(points, width / height, start) : null;
  if (!cam) return null;
  const aspect = width / height;
  const tanY = Math.tan(FOV / 2);
  const tanX = tanY * aspect;
  // The free area in normalised device coordinates, -1 to 1 with y up.
  const halfWidth = 1 - (2 * insets.side) / width;
  const top = 1 - (2 * insets.top) / height;
  const bottom = -1 + (2 * insets.bottom) / height;
  const middle = (top + bottom) / 2;
  const halfHeight = (top - bottom) / 2;
  const quantile = (sorted: Float64Array, q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]!;
  // Reused every round; typed arrays sort numerically without a comparator.
  const bufferX = new Float64Array(points.length);
  const bufferY = new Float64Array(points.length);
  for (let round = 0; round < 6; round++) {
    const m = multiply(perspective(aspect, cam.dist * 0.004, cam.dist * 8 + 40), viewMatrix(cam));
    let n = 0;
    for (const [px, py, pz] of points) {
      const w = m[3]! * px + m[7]! * py + m[11]! * pz + m[15]!;
      if (w <= 1e-6) continue;
      bufferX[n] = (m[0]! * px + m[4]! * py + m[8]! * pz + m[12]!) / w;
      bufferY[n++] = (m[1]! * px + m[5]! * py + m[9]! * pz + m[13]!) / w;
    }
    if (!n) break;
    const xs = bufferX.subarray(0, n).sort();
    const ys = bufferY.subarray(0, n).sort();
    const cx = (quantile(xs, 0.05) + quantile(xs, 0.95)) / 2;
    const cy = (quantile(ys, 0.05) + quantile(ys, 0.95)) / 2;
    const reachX = Math.max(cx - xs[0]!, xs[n - 1]! - cx);
    const reachY = Math.max(cy - ys[0]!, ys[n - 1]! - cy);
    // One unit of device coordinates is dist × tan(half the field of view) in the world, at the target's depth.
    const sx: number = cx * cam.dist * tanX;
    const sy: number = (cy - middle) * cam.dist * tanY;
    const zoom: number = Math.max(reachX / (halfWidth * 0.9), reachY / (halfHeight * 0.9), 1e-3);
    const { right: r, up: u } = basis(cam);
    cam = {
      ...cam,
      tx: cam.tx + r[0] * sx + u[0] * sy,
      ty: cam.ty + r[1] * sx + u[1] * sy,
      tz: cam.tz + r[2] * sx + u[2] * sy,
      dist: Math.max(MIN_FRAME_DISTANCE, cam.dist * zoom),
    };
    // Settled: already centred and sized to within a fraction of a percent.
    if (Math.abs(zoom - 1) < 1e-3 && Math.abs(cx) < 1e-3 && Math.abs(cy - middle) < 1e-3) break;
  }
  return cam;
}

const smooth = (t: number) => t * t * (3 - 2 * t);

export function between(from: Camera, to: Camera, t: number): Camera {
  const k = smooth(Math.max(0, Math.min(1, t)));
  const mix = (key: keyof Camera) => from[key] + (to[key] - from[key]) * k;
  // Zoom eases in log space, so a long fly-in does not rush the last part.
  const dist = Math.exp(Math.log(from.dist) + (Math.log(to.dist) - Math.log(from.dist)) * k);
  return { az: mix('az'), el: mix('el'), dist, tx: mix('tx'), ty: mix('ty'), tz: mix('tz') };
}
