import { islandColor } from '@/colors.ts';
import { fitness } from '@/format.ts';

import type { ViewSettings } from './renderer.ts';
import type { Scene } from './scene.ts';

const BEST = '#ffffff';
export const FONT = '"Geist Variable", system-ui, sans-serif';

// An island's patch on screen (its centre and half size), and the way out from the middle of all the patches, where its name goes.
type IslandLabel = { island: number; x: number; y: number; halfWidth: number; halfHeight: number; dx: number; dy: number };

// Each island's patch as a box around its clusters on screen, so its name can sit just outside it.
export function islandLabels(scene: Scene, at: (node: number) => readonly [number, number] | null): IslandLabel[] {
  const boxes = scene.islands.map(() => ({ left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity }));
  for (let i = 0; i < scene.count; i++) {
    const p = at(i);
    if (!p) continue;
    const box = boxes[scene.slot[i]!]!;
    box.left = Math.min(box.left, p[0]);
    box.top = Math.min(box.top, p[1]);
    box.right = Math.max(box.right, p[0]);
    box.bottom = Math.max(box.bottom, p[1]);
  }
  const labels = boxes.flatMap(({ left, top, right, bottom }, k) =>
    left <= right
      ? [
          {
            island: scene.islands[k]!,
            x: (left + right) / 2,
            y: (top + bottom) / 2,
            halfWidth: (right - left) / 2,
            halfHeight: (bottom - top) / 2,
            dx: 0,
            dy: 1,
          },
        ]
      : []
  );
  // Each name goes outward, away from the middle of all the patches; one patch alone has its name below it.
  const cx = labels.reduce((sum, label) => sum + label.x, 0) / Math.max(1, labels.length);
  const cy = labels.reduce((sum, label) => sum + label.y, 0) / Math.max(1, labels.length);
  for (const label of labels) {
    const length = Math.hypot(label.x - cx, label.y - cy);
    if (length > 1) [label.dx, label.dy] = [(label.x - cx) / length, (label.y - cy) / length];
  }
  return labels;
}

// Where one frame of the network landed on screen, in CSS pixels, for the 2D layer drawn over it.
export type OverlayFrame = {
  scene: Scene;
  view: ViewSettings;
  // The stage's width, so the run best's tag stays inside it.
  width: number;
  at: (node: number) => readonly [number, number] | null;
  // How strongly each island shows while one is hovered in the legend, by island slot.
  focus: Float32Array;
  hover: number;
  // Island names outside each patch while the layout is grouped, faded in with `labelAlpha`.
  islandLabels: IslandLabel[];
  labelAlpha: number;
};

// Island best rings, the run best's diamond and tag, the selection and hover brackets, and island names when grouped.
export function drawOverlay(
  ctx: CanvasRenderingContext2D,
  dpr: number,
  { scene, view, width, at, focus, hover, islandLabels, labelAlpha }: OverlayFrame
) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  if (view.layers.islandBests)
    scene.islandBest.forEach((node, k) => {
      const p = at(node);
      if (!p || node === scene.runBest) return;
      ctx.globalAlpha = focus[k]!;
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = 'rgba(0,0,0,0.75)';
      ctx.beginPath();
      ctx.arc(p[0], p[1], 6.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 1.75;
      ctx.strokeStyle = BEST;
      ctx.stroke();
    });
  ctx.globalAlpha = 1;

  const runBest = view.layers.runBest ? at(scene.runBest) : null;
  if (runBest) {
    const [x, y] = runBest;
    ctx.save();
    ctx.shadowColor = 'rgba(255,255,255,0.75)';
    ctx.shadowBlur = 10;
    ctx.fillStyle = BEST;
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y - 8);
    ctx.lineTo(x + 8, y);
    ctx.lineTo(x, y + 8);
    ctx.lineTo(x - 8, y);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.stroke();
    ctx.restore();
  }

  for (const [node, colour, gap] of [
    [view.selected, 'rgba(237,237,237,0.95)', 11],
    [hover !== view.selected ? hover : -1, 'rgba(237,237,237,0.55)', 9],
  ] as const) {
    const p = at(node);
    if (!p) continue;
    const [x, y] = p;
    const arm = 5;
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = colour;
    ctx.beginPath();
    for (const [dx, dy] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ]) {
      ctx.moveTo(x + dx! * gap, y + dy! * (gap - arm));
      ctx.lineTo(x + dx! * gap, y + dy! * gap);
      ctx.lineTo(x + dx! * (gap - arm), y + dy! * gap);
    }
    ctx.stroke();
  }

  if (runBest) {
    const [x, y] = runBest;
    const text = `Run best · ${fitness(scene.bestFitness[scene.runBest] ?? null)}`;
    ctx.font = `500 12px ${FONT}`;
    ctx.textBaseline = 'middle';
    const w = ctx.measureText(text).width + 26;
    const left = Math.min(x + 14, width - w - 8);
    ctx.fillStyle = 'rgba(17,17,17,0.88)';
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(left, y - 12, w, 24, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = BEST;
    ctx.beginPath();
    ctx.arc(left + 10, y, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ededed';
    ctx.fillText(text, left + 19, y + 0.5);
  }

  if (islandLabels.length) {
    ctx.globalAlpha = labelAlpha;
    ctx.font = `600 12px ${FONT}`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    for (const { island, x, y, halfWidth, halfHeight, dx, dy } of islandLabels) {
      const text = `Island ${island}`;
      // Out along (dx, dy) until the text's box clears the patch's box, plus a small gap.
      const [textWidth, textHeight] = [ctx.measureText(text).width / 2 + 8, 7 + 12];
      const out = Math.min(
        Math.abs(dx) > 1e-3 ? (halfWidth + textWidth) / Math.abs(dx) : Infinity,
        Math.abs(dy) > 1e-3 ? (halfHeight + textHeight) / Math.abs(dy) : Infinity
      );
      ctx.fillStyle = islandColor(island);
      ctx.fillText(text, x + dx * out, y + dy * out);
    }
    ctx.textAlign = 'start';
    ctx.globalAlpha = 1;
  }
}
