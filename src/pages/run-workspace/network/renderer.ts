import { islandColor } from '@/colors.ts';
import { reducedMotion } from '@/style.ts';

import { basis, between, type Camera, eyeOf, fitOnScreen, FOV, GROUPED, HOME, multiply, perspective, TOP_DOWN, viewMatrix } from './camera.ts';
import { ARC_ATTRIBUTES, arcVertices, type Glide, GRAPH_ATTRIBUTES, graphVertices, islandRing, type Ring } from './geometry.ts';
import { drawOverlay, islandLabels } from './overlay.ts';
import type { HeightMode, Scene } from './scene.ts';
import { ARC_FRAGMENT, ARC_VERTEX, FULLSCREEN_VERTEX, GRAPH_VERTEX, LINE_FRAGMENT, MAX_ISLANDS, POINT_FRAGMENT, TONE_FRAGMENT } from './shaders.ts';
import { compile, densityTargets, type Program, vertexArray } from './webgl.ts';

export type Layers = { paths: boolean; migrations: boolean; islandBests: boolean; runBest: boolean; shared: boolean };

// Everything the controls set. The renderer eases toward it, so any change animates.
export type ViewSettings = {
  height: HeightMode;
  group: boolean;
  hiddenIslands: number[];
  // An island hovered in the legend; the others fade back.
  focusIsland: number | null;
  layers: Layers;
  hiddenRoutes: string[];
  minTraversals: number;
  // Comets travelling along the migrations; off, they are still lines.
  animateMigrations: boolean;
  // How much of the replay is shown, 0 to 1.
  reveal: number;
  selected: number;
};

type RendererEvents = {
  onHover: (node: number, x: number, y: number) => void;
  onSelect: (node: number) => void;
};

export type Renderer = {
  setScene: (scene: Scene) => void;
  setSettings: (settings: ViewSettings) => void;
  flyTo: (node: number) => void;
  resetView: () => void;
  // The network and its markers as one picture, at device pixels, with the device pixels per CSS pixel.
  snapshot: () => { image: HTMLCanvasElement; scale: number };
  camera: () => Camera;
  destroy: () => void;
};

// Grouped islands are each a small patch, so their heights shrink with them.
const GROUPED_HEIGHT = 0.3;
const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);

type Vec3 = [number, number, number];

// Draws a run's search network with WebGL2, markers and labels on a 2D canvas above. Opens at the `start` camera, or
// swings in without one. Null when the browser has no WebGL2.
export function createRenderer(canvas: HTMLCanvasElement, overlay: HTMLCanvasElement, events: RendererEvents, start?: Camera): Renderer | null {
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false });
  const ctx = overlay.getContext('2d');
  if (!gl || !ctx) return null;

  const densityTarget = densityTargets(gl);
  const defines = gl.getExtension('EXT_color_buffer_float') ? '#define HDR 1\n' : '';
  const points = compile(gl, GRAPH_VERTEX, POINT_FRAGMENT, defines);
  const lines = compile(gl, GRAPH_VERTEX, LINE_FRAGMENT, defines);
  const arcs = compile(gl, ARC_VERTEX, ARC_FRAGMENT, defines);
  const tone = compile(gl, FULLSCREEN_VERTEX, TONE_FRAGMENT);
  const nodeBuffer = gl.createBuffer();
  const edgeBuffer = gl.createBuffer();
  const arcBuffer = gl.createBuffer();
  const nodeVao = vertexArray(gl, points.program, nodeBuffer, GRAPH_ATTRIBUTES);
  const edgeVao = vertexArray(gl, lines.program, edgeBuffer, GRAPH_ATTRIBUTES);
  const arcVao = vertexArray(gl, arcs.program, arcBuffer, ARC_ATTRIBUTES);
  const emptyVao = gl.createVertexArray();

  /* ── state ──────────────────────────────────────────────────── */
  let scene: Scene | null = null;
  let settings: ViewSettings | null = null;
  const empty = { x: new Float32Array(0), y: new Float32Array(0), h: new Float32Array(0) };
  let glides: Glide = { from: empty, to: empty, born: new Float32Array(0) };
  // How far the glide has gone, and that eased; worldOf and the shaders use the eased value.
  let moveProgress = 1;
  let move = 1;
  let edgeCount = 0;
  let arcCount = 0;
  const clock = performance.now();
  const seconds = () => (performance.now() - clock) / 1000;
  let lastBorn = -10;

  // Shown values ease toward their targets each frame.
  const shown = {
    separation: 0,
    heightScale: 1,
    shared: 0,
    group: 0,
    reveal: 1,
    alpha: new Float32Array(MAX_ISLANDS).fill(1),
    focus: new Float32Array(MAX_ISLANDS).fill(1),
  };
  let cam: Camera = { ...(start ?? HOME) };
  let tween: { from: Camera; to: Camera; start: number; duration: number } | null = null;
  let zoom: { target: number; nx: number; ny: number; node: number } | null = null;
  let hover = -1;
  let viewProjection: Float32Array | null = null;
  let screenX = new Float32Array(0);
  let screenY = new Float32Array(0);
  let onScreen = new Uint8Array(0);

  // Cached because place() asks for it once per cluster.
  let ring: Ring = [];
  const offsets = () => {
    const n = Math.max(1, scene?.islands.length ?? 1);
    if (ring.length !== n) ring = islandRing(n);
    return ring;
  };
  const visibleSlot = (slot: number) => !settings?.hiddenIslands.includes(scene!.islands[slot]!);

  // Where a cluster of island slot `slot` at layout (x, y) and height h sits in the world, as the shaders compute it.
  function place(slot: number, x: number, y: number, h: number, separation = shown.separation, heightScale = shown.heightScale): Vec3 {
    const [ox, oy] = offsets()[slot]!;
    return [x + (x * 0.3 + ox - x) * separation, h * heightScale, y + (y * 0.3 + oy - y) * separation];
  }

  // A cluster's layout x, y or height right now, part way through any glide.
  const gliding = (key: 'x' | 'y' | 'h', i: number) => glides.from[key][i]! + (glides.to[key][i]! - glides.from[key][i]!) * move;
  // Where the cluster is in the world right now.
  const worldOf = (i: number) => place(scene!.slot[i]!, gliding('x', i), gliding('y', i), gliding('h', i));

  function project(p: Vec3): [number, number] | null {
    const m = viewProjection;
    if (!m) return null;
    const w = m[3]! * p[0] + m[7]! * p[1] + m[11]! * p[2] + m[15]!;
    if (w <= 1e-6) return null;
    const x = (m[0]! * p[0] + m[4]! * p[1] + m[8]! * p[2] + m[12]!) / w;
    const y = (m[1]! * p[0] + m[5]! * p[1] + m[9]! * p[2] + m[13]!) / w;
    return [(x * 0.5 + 0.5) * canvas.clientWidth, (1 - (y * 0.5 + 0.5)) * canvas.clientHeight];
  }

  /* ── geometry ───────────────────────────────────────────────── */
  function buildGraphGeometry() {
    const { nodes, edges } = graphVertices(scene!, glides, offsets());
    edgeCount = scene!.edges.a.length;
    gl!.bindBuffer(gl!.ARRAY_BUFFER, nodeBuffer);
    gl!.bufferData(gl!.ARRAY_BUFFER, nodes, gl!.STATIC_DRAW);
    gl!.bindBuffer(gl!.ARRAY_BUFFER, edgeBuffer);
    gl!.bufferData(gl!.ARRAY_BUFFER, edges, gl!.STATIC_DRAW);
    buildArcGeometry();
  }

  // Rebuilt when the route or island filters change, since those decide which migrations show.
  function buildArcGeometry() {
    if (!scene || !settings) return;
    const { data, vertices } = arcVertices(scene, settings, glides, offsets());
    arcCount = vertices;
    gl!.bindBuffer(gl!.ARRAY_BUFFER, arcBuffer);
    gl!.bufferData(gl!.ARRAY_BUFFER, data, gl!.STATIC_DRAW);
  }

  // Starts a glide from where every cluster is now to where `next` puts it.
  function retarget(next: Scene, height: HeightMode) {
    const now = seconds();
    const previous = scene;
    const fresh: Glide = {
      from: { x: new Float32Array(next.count), y: new Float32Array(next.count), h: new Float32Array(next.count) },
      to: { x: Float32Array.from(next.x), y: Float32Array.from(next.y), h: Float32Array.from(next.heights[height]) },
      born: new Float32Array(next.count),
    };
    for (let i = 0; i < next.count; i++) {
      const before = previous?.index.get(next.ids[i]!);
      // A new cluster starts where it ends up; one already shown glides on from where it is now.
      for (const key of ['x', 'y', 'h'] as const) fresh.from[key][i] = before === undefined ? fresh.to[key][i]! : gliding(key, before);
      fresh.born[i] = before !== undefined ? glides.born[before]! : previous ? now : -10;
    }
    if (previous && next.count > previous.count) lastBorn = now;
    glides = fresh;
    scene = next;
    moveProgress = move = previous ? 0 : 1;
    screenX = new Float32Array(next.count);
    screenY = new Float32Array(next.count);
    onScreen = new Uint8Array(next.count);
    buildGraphGeometry();
  }

  /* ── camera ─────────────────────────────────────────────────── */
  // The camera at `angle` that frames the graph as the current settings will lay it out once every glide ends.
  function fitGraph(angle: Camera): Camera {
    const current = scene;
    if (!current) return angle;
    const group = !!settings?.group;
    const heightScale = group ? GROUPED_HEIGHT : 1;
    const points = Array.from({ length: current.count }, (_, i) =>
      place(current.slot[i]!, glides.to.x[i]!, glides.to.y[i]!, glides.to.h[i]!, group ? 1 : 0, heightScale)
    );
    if (group) {
      // Room for each island's name beyond its patch.
      points.push(...offsets().map(([ox, oy]): Vec3 => [ox * 1.45, 0, oy * 1.45]));
      // The top of each migration's arch, so no arch is cut off.
      if (settings?.layers.migrations)
        current.migrations.a.forEach((a, m) => {
          const [p, q] = [points[a]!, points[current.migrations.b[m]!]!];
          // Lifted as ARC_VERTEX lifts it.
          const length = Math.max(Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]), 0.05);
          const arch = (0.16 + 0.5 * length) * (0.5 + 0.5 * heightScale);
          points.push([(p[0] + q[0]) / 2, (p[1] + q[1]) / 2 + arch, (p[2] + q[2]) / 2]);
        });
    }
    // Centre in the space between the toolbar, the bottom bar and the height scale.
    return fitOnScreen(points, canvas.clientWidth, canvas.clientHeight, { top: 60, bottom: 66, side: 56 }, angle) ?? angle;
  }

  // Reset view: top down for a flat ungrouped graph, otherwise tilted.
  const resetCamera = () => fitGraph(settings?.group ? GROUPED : settings?.height === 'flat' ? TOP_DOWN : HOME);

  const stopMotion = () => {
    tween = null;
    zoom = null;
  };
  const glide = (next: Camera, duration = 900) => {
    tween = { from: { ...cam }, to: next, start: performance.now(), duration: reducedMotion() ? 1 : duration };
    invalidate();
  };

  function resetView() {
    stopMotion();
    const target = resetCamera();
    // Take the shortest turn to the reset angle.
    const turn = target.az - cam.az;
    glide({ ...target, az: cam.az + Math.atan2(Math.sin(turn), Math.cos(turn)) });
  }

  function pick(x: number, y: number): number {
    if (!scene) return -1;
    let best = -1;
    let bestScore = -1;
    for (let i = 0; i < scene.count; i++) {
      if (!onScreen[i]) continue;
      const d2 = (screenX[i]! - x) ** 2 + (screenY[i]! - y) ** 2;
      if (d2 > 14 * 14) continue;
      // Big clusters win close calls, so the one that looks hit is the one picked.
      const score = scene.size[i]! / (1 + d2 * 0.08);
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    }
    return best;
  }

  // Zoom toward the point under the pointer. With a cluster there, dolly straight at it so it stays under the pointer
  // at every depth; otherwise move along the pointer's ray.
  function zoomTo(nx: number, ny: number, node: number, dist: number) {
    const ratio = dist / cam.dist;
    const { back, right, up } = basis(cam);
    const eye = eyeOf(cam);
    if (node >= 0) {
      const p = worldOf(node);
      const next = [p[0] + (eye[0] - p[0]) * ratio, p[1] + (eye[1] - p[1]) * ratio, p[2] + (eye[2] - p[2]) * ratio];
      cam = { ...cam, dist, tx: next[0]! - back[0] * dist, ty: next[1]! - back[1] * dist, tz: next[2]! - back[2] * dist };
      return;
    }
    const tan = Math.tan(FOV / 2);
    const aspect = canvas.clientWidth / canvas.clientHeight;
    let ray = [0, 1, 2].map((k) => -back[k]! + right[k]! * nx * aspect * tan + up[k]! * ny * tan);
    const length = Math.hypot(...ray) || 1;
    ray = ray.map((v) => v / length);
    const along = -(ray[0]! * back[0] + ray[1]! * back[1] + ray[2]! * back[2]);
    if (along > 0.05) {
      const t = cam.dist / along;
      const k = 1 - ratio;
      cam = {
        ...cam,
        dist,
        tx: cam.tx + (eye[0] + ray[0]! * t - cam.tx) * k,
        ty: cam.ty + (eye[1] + ray[1]! * t - cam.ty) * k,
        tz: cam.tz + (eye[2] + ray[2]! * t - cam.tz) * k,
      };
    } else cam = { ...cam, dist };
  }

  /* ── pointer ────────────────────────────────────────────────── */
  let drag: { mode: 'orbit' | 'pan'; x: number; y: number; travel: number } | null = null;
  const local = (event: PointerEvent | WheelEvent | MouseEvent): [number, number] => {
    const box = canvas.getBoundingClientRect();
    return [event.clientX - box.left, event.clientY - box.top];
  };

  const onPointerDown = (event: PointerEvent) => {
    stopMotion();
    const mode = event.button === 1 || event.button === 2 || event.shiftKey ? 'pan' : 'orbit';
    drag = { mode, x: event.clientX, y: event.clientY, travel: 0 };
    canvas.setPointerCapture(event.pointerId);
    canvas.classList.add('network-dragging');
    setHover(-1, 0, 0);
  };

  const onPointerMove = (event: PointerEvent) => {
    const [x, y] = local(event);
    if (!drag) return setHover(pick(x, y), x, y);
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    drag = { ...drag, x: event.clientX, y: event.clientY, travel: drag.travel + Math.abs(dx) + Math.abs(dy) };
    if (drag.mode === 'orbit') cam = { ...cam, az: cam.az - dx * 0.006, el: Math.max(-1.45, Math.min(TOP_DOWN.el, cam.el + dy * 0.005)) };
    else {
      const { right, up } = basis(cam);
      const k = cam.dist * 0.0022;
      cam = {
        ...cam,
        tx: cam.tx - (right[0] * dx - up[0] * dy) * k,
        ty: cam.ty - (right[1] * dx - up[1] * dy) * k,
        tz: cam.tz - (right[2] * dx - up[2] * dy) * k,
      };
    }
    invalidate();
  };

  const onPointerUp = (event: PointerEvent) => {
    if (!drag) return;
    const ended = drag;
    drag = null;
    canvas.classList.remove('network-dragging');
    if (ended.travel > 5 || ended.mode === 'pan') return;
    const [x, y] = local(event);
    events.onSelect(pick(x, y));
  };

  const onDoubleClick = (event: MouseEvent) => {
    const [x, y] = local(event);
    const node = pick(x, y);
    if (node >= 0) flyTo(node);
  };

  const onWheel = (event: WheelEvent) => {
    event.preventDefault();
    tween = null;
    const [x, y] = local(event);
    // Lines and pages become pixels. A pinch arrives as ctrl+wheel with much smaller steps, so it gets more gain.
    const delta = Math.max(-240, Math.min(240, event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 400 : 1)));
    const base = zoom?.target ?? cam.dist;
    zoom = {
      target: Math.max(0.05, Math.min(16, base * Math.exp(delta * (event.ctrlKey ? 0.012 : 0.0022)))),
      nx: (x / canvas.clientWidth) * 2 - 1,
      ny: 1 - (y / canvas.clientHeight) * 2,
      node: pick(x, y),
    };
    invalidate();
  };

  const onLeave = () => setHover(-1, 0, 0);
  const onContextMenu = (event: Event) => event.preventDefault();

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  canvas.addEventListener('pointerleave', onLeave);
  canvas.addEventListener('dblclick', onDoubleClick);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('contextmenu', onContextMenu);

  function setHover(node: number, x: number, y: number) {
    if (node !== hover) invalidate();
    hover = node;
    events.onHover(node, x, y);
  }

  function flyTo(node: number) {
    if (!scene || node < 0 || node >= scene.count) return;
    stopMotion();
    const [x, y, z] = worldOf(node);
    glide({ ...cam, tx: x, ty: y, tz: z, dist: Math.min(cam.dist, 1.1) }, 1100);
  }

  /* ── frame ──────────────────────────────────────────────────── */
  let frame = 0;
  let lastFrame = performance.now();
  let alive = true;
  function invalidate() {
    if (!frame && alive)
      frame = requestAnimationFrame((now) => {
        frame = 0;
        render(now);
      });
  }

  function render(now: number) {
    if (!scene || !settings || !alive) return;
    const view = settings;
    const dt = Math.min(0.05, (now - lastFrame) / 1000);
    lastFrame = now;
    const ease = (rate: number) => (reducedMotion() ? 1 : 1 - Math.exp(-dt * rate));
    let busy = false;
    const approach = (current: number, goal: number, rate: number) => {
      const next = current + (goal - current) * ease(rate);
      if (Math.abs(goal - next) > 1e-3) busy = true;
      return Math.abs(goal - next) > 1e-3 ? next : goal;
    };
    shown.separation = approach(shown.separation, view.group ? 1 : 0, 6);
    shown.heightScale = approach(shown.heightScale, view.group ? GROUPED_HEIGHT : 1, 6);
    shown.shared = approach(shown.shared, view.layers.shared ? 1 : 0, 7);
    shown.group = approach(shown.group, view.group ? 1 : 0, 5);
    shown.reveal = approach(shown.reveal, view.reveal, 14);
    scene.islands.forEach((island, k) => {
      shown.alpha[k] = approach(shown.alpha[k]!, view.hiddenIslands.includes(island) ? 0.045 : 1, 9);
      shown.focus[k] = approach(shown.focus[k]!, view.focusIsland === null || view.focusIsland === island ? 1 : 0.12, 10);
    });
    if (moveProgress < 1) {
      moveProgress = reducedMotion() ? 1 : Math.min(1, moveProgress + dt / 0.7);
      move = 1 - (1 - moveProgress) ** 3;
      busy = true;
    }

    if (tween) {
      const t = (now - tween.start) / tween.duration;
      cam = between(tween.from, tween.to, t);
      if (t >= 1) tween = null;
      busy = true;
    }
    if (zoom) {
      const ratio = zoom.target / cam.dist;
      if (Math.abs(Math.log(ratio)) < 0.001) {
        zoomTo(zoom.nx, zoom.ny, zoom.node, zoom.target);
        zoom = null;
      } else {
        zoomTo(zoom.nx, zoom.ny, zoom.node, cam.dist * ratio ** (reducedMotion() ? 1 : 0.22));
        busy = true;
      }
    }
    if (now - lastBorn * 1000 - clock < 900) busy = true;
    // Comets fade out as the islands group: there each link's colour and taper show its direction instead.
    const flow = view.animateMigrations && !reducedMotion() ? 1 - shown.group : 0;
    // The comets move all the time.
    if (flow > 0 && arcCount) busy = true;

    // Resize to the element, at up to 2 device pixels per CSS pixel.
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(canvas.clientWidth * dpr));
    const height = Math.max(1, Math.round(canvas.clientHeight * dpr));
    for (const element of [canvas, overlay])
      if (element.width !== width || element.height !== height) {
        element.width = width;
        element.height = height;
      }

    viewProjection = multiply(perspective(width / height, Math.max(0.00002, cam.dist * 0.004), cam.dist * 8 + 40), viewMatrix(cam));

    const density = densityTarget(width, height);
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, density?.framebuffer ?? null);
    gl!.viewport(0, 0, width, height);
    gl!.clearColor(0, 0, 0, 1);
    gl!.clear(gl!.COLOR_BUFFER_BIT);
    gl!.disable(gl!.DEPTH_TEST);
    gl!.enable(gl!.BLEND);
    gl!.blendFunc(density ? gl!.ONE : gl!.SRC_ALPHA, gl!.ONE);

    // Brightness is tuned for about 250k search paths. Real runs have a few thousand, so each one would gather almost
    // no light; small graphs get a boost that shrinks as the graph grows.
    const edgeGain = edgeCount >= 200000 ? 1 : Math.min(12, Math.sqrt(250000 / Math.max(edgeCount, 1)));
    const nodeGain = Math.min(4, edgeGain);
    const colours = new Float32Array(MAX_ISLANDS * 3);
    scene.islands.forEach((island, k) => colours.set(rgb(islandColor(island)), k * 3));
    const alphas = shown.alpha.map((a, k) => a * shown.focus[k]!);
    const t = seconds();

    const graphUniforms = (program: Program, base: number, pointScale: number) => {
      const u = program.uniforms;
      gl!.useProgram(program.program);
      gl!.uniformMatrix4fv(u.uVP!, false, viewProjection!);
      gl!.uniform1f(u.uMove!, move);
      gl!.uniform1f(u.uSep!, shown.separation);
      gl!.uniform1f(u.uHeightScale!, shown.heightScale);
      gl!.uniform1f(u.uPointScale!, pointScale);
      gl!.uniform3fv(u.uColour!, colours);
      gl!.uniform1fv(u.uAlpha!, alphas);
      gl!.uniform1f(u.uBase!, base);
      gl!.uniform1f(u.uFogNear!, cam.dist * 0.55);
      gl!.uniform1f(u.uFogFar!, cam.dist * 1.95);
      gl!.uniform1f(u.uShared!, shown.shared);
      gl!.uniform1f(u.uReveal!, shown.reveal);
      gl!.uniform1f(u.uMinWeight!, view.minTraversals);
      gl!.uniform1f(u.uNow!, t);
    };

    if (view.layers.paths && edgeCount) {
      graphUniforms(lines, 0.05 * edgeGain, 1);
      gl!.bindVertexArray(edgeVao);
      gl!.drawArrays(gl!.LINES, 0, edgeCount * 2);
    }
    // Cluster sizes too were tuned for huge graphs; a run's few hundred clusters would be dots a pixel or two wide.
    const pointBoost = Math.min(3, Math.max(1, Math.sqrt(1500 / Math.max(scene.count, 1))));
    // A core and halo covers less of its square than main's soft glow did, so it gets more light to look as bright.
    graphUniforms(points, (view.layers.paths ? 0.14 : 0.42) * nodeGain * 1.8, 1.35 * dpr * pointBoost);
    gl!.bindVertexArray(nodeVao);
    gl!.drawArrays(gl!.POINTS, 0, scene.count);

    if (density) {
      gl!.bindFramebuffer(gl!.FRAMEBUFFER, null);
      gl!.viewport(0, 0, width, height);
      gl!.disable(gl!.BLEND);
      gl!.useProgram(tone.program);
      gl!.activeTexture(gl!.TEXTURE0);
      gl!.bindTexture(gl!.TEXTURE_2D, density.texture);
      gl!.uniform1i(tone.uniforms.uDensity!, 0);
      // Exposure and saturation as main's viewer tuned them.
      gl!.uniform1f(tone.uniforms.uExposure!, 1.8);
      gl!.uniform1f(tone.uniforms.uSaturation!, 1.4);
      gl!.bindVertexArray(emptyVao);
      gl!.drawArrays(gl!.TRIANGLES, 0, 3);
    }

    // Migrations go over the finished picture rather than into the density: there, the search paths' colours (often ten
    // times as many lines) would average them away.
    if (arcCount) {
      gl!.enable(gl!.BLEND);
      gl!.blendFunc(density ? gl!.ONE : gl!.SRC_ALPHA, gl!.ONE_MINUS_SRC_ALPHA);
      const u = arcs.uniforms;
      gl!.useProgram(arcs.program);
      gl!.uniformMatrix4fv(u.uVP!, false, viewProjection!);
      gl!.uniform1f(u.uMove!, move);
      gl!.uniform1f(u.uSep!, shown.separation);
      gl!.uniform1f(u.uHeightScale!, shown.heightScale);
      // Cyan until the islands group, when each migration takes its islands' colours.
      gl!.uniform3fv(u.uMigration!, [0, 0.898, 1]);
      gl!.uniform3fv(u.uColour!, colours);
      gl!.uniform1fv(u.uFocus!, shown.focus);
      // Drawn on top, many links would bury the network (a fully connected run can have one link for every three
      // search paths), so each link fades as their number grows past about 150.
      const crowding = Math.min(1, Math.max(0.5, Math.sqrt(150 / Math.max(1, scene.migrations.a.length))));
      gl!.uniform1f(u.uBase!, ((view.layers.paths ? 0.6 : 0.9) + 0.3 * shown.group) * crowding);
      gl!.uniform1f(u.uAspect!, width / height);
      gl!.uniform1f(u.uHalfWidth!, ((1.2 + 0.9 * shown.group) * dpr) / height);
      gl!.uniform1f(u.uFlow!, flow);
      gl!.uniform1f(u.uLift!, shown.group);
      gl!.uniform1f(u.uReveal!, shown.reveal);
      gl!.uniform1f(u.uNow!, t);
      gl!.bindVertexArray(arcVao);
      gl!.drawArrays(gl!.TRIANGLES, 0, arcCount);
    }
    gl!.bindVertexArray(null);

    // Where each cluster landed on screen, for picking and the markers.
    for (let i = 0; i < scene.count; i++) {
      const p = scene.reveal[i]! <= shown.reveal && visibleSlot(scene.slot[i]!) ? project(worldOf(i)) : null;
      onScreen[i] = p ? 1 : 0;
      if (p) [screenX[i], screenY[i]] = p;
    }
    const at = (i: number) => (i >= 0 && onScreen[i] ? ([screenX[i]!, screenY[i]!] as const) : null);
    drawOverlay(ctx!, dpr, {
      scene,
      view,
      width: canvas.clientWidth,
      at,
      focus: shown.focus,
      hover,
      // Island names show once the islands have mostly moved apart.
      islandLabels: shown.group > 0.55 ? islandLabels(scene, at) : [],
      labelAlpha: Math.min(1, (shown.group - 0.55) * 4),
    });

    if (busy || drag) invalidate();
  }

  const resize = new ResizeObserver(() => invalidate());
  resize.observe(canvas);

  return {
    setScene(next) {
      const first = !scene;
      const height = settings?.height ?? 'fitness';
      retarget(next, height);
      if (first && !start) cam = resetCamera();
      if (first && !start && !reducedMotion()) {
        // The camera swings in from a wider angle the first time the network opens.
        const from = { ...cam, az: cam.az - 0.9, el: Math.min(TOP_DOWN.el, cam.el + 0.25), dist: cam.dist * 1.4 };
        tween = { from, to: { ...cam }, start: performance.now() + 80, duration: 1800 };
        cam = from;
      }
      invalidate();
    },
    setSettings(next) {
      const previous = settings;
      settings = next;
      if (!scene) return;
      if (previous && previous.height !== next.height) {
        retarget(scene, next.height);
        // Ungrouped, flat is seen from straight above, so going to or from flat resets the view.
        if (!next.group && (previous.height === 'flat' || next.height === 'flat')) {
          resetView();
          return;
        }
        // Otherwise a new height moves every cluster up or down; the camera follows the selected one so it stays in view.
        const i = next.selected;
        if (i >= 0 && i < scene.count) {
          const [tx, ty, tz] = place(scene.slot[i]!, glides.to.x[i]!, glides.to.y[i]!, glides.to.h[i]!);
          stopMotion();
          glide({ ...cam, tx, ty, tz }, 700);
        }
      } else if (
        !previous ||
        previous.layers.migrations !== next.layers.migrations ||
        previous.hiddenRoutes !== next.hiddenRoutes ||
        previous.hiddenIslands !== next.hiddenIslands
      )
        buildArcGeometry();
      if (previous && previous.group !== next.group) {
        if (!next.group && next.height === 'flat') resetView();
        else {
          // Keep the reader's turn around the graph.
          stopMotion();
          glide(fitGraph({ ...(next.group ? GROUPED : HOME), az: cam.az }), 1200);
        }
      }
      invalidate();
    },
    flyTo,
    resetView,
    snapshot() {
      // The WebGL buffer is only readable in the frame that drew it, so draw one now.
      render(performance.now());
      const image = document.createElement('canvas');
      image.width = canvas.width;
      image.height = canvas.height;
      const draw = image.getContext('2d')!;
      draw.drawImage(canvas, 0, 0);
      draw.drawImage(overlay, 0, 0);
      return { image, scale: canvas.width / Math.max(1, canvas.clientWidth) };
    },
    camera: () => ({ ...cam }),
    destroy() {
      alive = false;
      cancelAnimationFrame(frame);
      resize.disconnect();
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('dblclick', onDoubleClick);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('contextmenu', onContextMenu);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    },
  };
}
