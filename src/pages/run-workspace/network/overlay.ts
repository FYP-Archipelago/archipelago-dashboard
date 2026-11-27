import { islandColor } from '@/colors.ts';
import { fitness, numberFormat } from '@/format.ts';

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
  // The stage's size, so the tags and the tour's card stay inside it.
  width: number;
  height: number;
  at: (node: number) => readonly [number, number] | null;
  // How far a cluster's core has grown past its unscaled size, so its markers sit that much further out.
  grow: (node: number) => number;
  // While the best solutions tour runs: the best it is at (-1 between bests), which of them it is, and how far its card
  // has faded in.
  tour: { node: number; step: number; steps: number; alpha: number } | null;
  // How strongly each island shows while one is hovered in the legend, by island slot.
  focus: Float32Array;
  hover: number;
  // Island names outside each patch while the layout is grouped, faded in with `labelAlpha`.
  islandLabels: IslandLabel[];
  labelAlpha: number;
};

// Island best rings, the run best's diamond and tag, the selection and hover brackets, and island names when grouped.
// A best whose cluster DenStream faded out gets a dashed ring, or a hollow dashed diamond.
export function drawOverlay(
  ctx: CanvasRenderingContext2D,
  dpr: number,
  { scene, view, width, height, at, grow, tour, focus, hover, islandLabels, labelAlpha }: OverlayFrame
) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  // At a best on the tour, the other bests' marks step back so the one being shown stands out.
  const toured = tour && tour.node >= 0 ? tour.node : -1;
  const recede = (node: number) => (toured >= 0 && node !== toured ? 0.3 : 1);

  if (view.layers.islandBests)
    scene.islandBest.forEach((node, k) => {
      const p = at(node);
      if (!p || node === scene.runBest) return;
      ctx.globalAlpha = focus[k]! * recede(node);
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = 'rgba(0,0,0,0.75)';
      ctx.beginPath();
      ctx.arc(p[0], p[1], 6.5 + grow(node), 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 1.75;
      ctx.strokeStyle = BEST;
      if (scene.faded[node]) ctx.setLineDash([3, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
    });
  ctx.globalAlpha = 1;

  const runBest = view.layers.runBest ? at(scene.runBest) : null;
  if (runBest) {
    const [x, y] = runBest;
    const half = 8 + grow(scene.runBest);
    ctx.save();
    ctx.globalAlpha = recede(scene.runBest);
    ctx.shadowColor = 'rgba(255,255,255,0.75)';
    ctx.shadowBlur = 10;
    ctx.fillStyle = BEST;
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y - half);
    ctx.lineTo(x + half, y);
    ctx.lineTo(x, y + half);
    ctx.lineTo(x - half, y);
    ctx.closePath();
    if (scene.faded[scene.runBest]) {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = BEST;
      ctx.setLineDash([3, 2.5]);
    } else {
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    ctx.stroke();
    ctx.restore();
  }

  const brackets: [node: number, colour: string, gap: number][] = [
    [view.selected, 'rgba(237,237,237,0.95)', 11],
    [hover !== view.selected ? hover : -1, 'rgba(237,237,237,0.55)', 9],
    // The tour's best, bracketed like a selection and a little wider, fading in with its card.
    [toured, `rgba(237,237,237,${0.95 * (tour?.alpha ?? 0)})`, 13],
  ];
  for (const [node, colour, unscaledGap] of brackets) {
    const p = at(node);
    if (!p) continue;
    const [x, y] = p;
    const gap = unscaledGap + grow(node);
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

  // The tour's card stands in for the run best's tag while it runs.
  if (runBest && !tour) {
    const [x, y] = runBest;
    const text = `Run best · ${fitness(scene.bestFitness[scene.runBest] ?? null)}`;
    ctx.font = `500 12px ${FONT}`;
    ctx.textBaseline = 'middle';
    const w = ctx.measureText(text).width + 26;
    const left = Math.min(x + 14 + grow(scene.runBest), width - w - 8);
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

  const stop = at(toured);
  if (tour && stop && tour.alpha > 0) drawTourCard(ctx, scene, tour, stop, grow(tour.node), width, height);

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
      // A dark outline keeps the name readable over migrations passing behind it.
      ctx.lineWidth = 4;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      ctx.strokeText(text, x + dx * out, y + dy * out);
      ctx.fillStyle = islandColor(island);
      ctx.fillText(text, x + dx * out, y + dy * out);
    }
    ctx.textAlign = 'start';
    ctx.globalAlpha = 1;
  }
}

// The best the tour is at, beside its cluster, with its fitness, mean, evaluations and when its island first reached it.
// A cluster DenStream faded out gets a Faded pill after the title.
function drawTourCard(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  tour: { node: number; step: number; steps: number; alpha: number },
  [x, y]: readonly [number, number],
  grow: number,
  width: number,
  height: number
) {
  const node = tour.node;
  const island = scene.islands[scene.slot[node]!]!;
  const run = node === scene.runBest;
  const title = run ? `Run best · Island ${island}` : `Island ${island} best`;
  const step = `${tour.step} of ${tour.steps}`;
  const value = fitness(scene.bestFitness[node] ?? null);
  const stats = [
    ['Mean', fitness(scene.meanFitness[node] ?? null)],
    ['Evaluations', numberFormat.format(scene.visits[node]!)],
    ['Reached at', `eval ${numberFormat.format(scene.firstEval[node]!)}`],
  ] as const;
  const faded = !!scene.faded[node];
  const font = (weight: number, size: number) => `${weight} ${size}px ${FONT}`;
  const measure = (text: string, weight: number, size: number) => ((ctx.font = font(weight, size)), ctx.measureText(text).width);

  const pad = 14;
  const columnGap = 18;
  const columns = stats.map(([label, text]) => Math.max(measure(label, 400, 11), measure(text, 500, 12.5)));
  const valueRow = measure(value, 600, 20) + 8 + measure('best fitness', 400, 11);
  const titleWidth = measure(title, 500, 12);
  const pillWidth = faded ? measure('Faded', 500, 10) + 12 : 0;
  const titleRow = 14 + titleWidth + (faded ? 8 + pillWidth : 0) + 16 + measure(step, 400, 11);
  const statsRow = columns.reduce((sum, c) => sum + c, 0) + columnGap * (columns.length - 1);
  const w = Math.ceil(Math.max(titleRow, valueRow, statsRow) + pad * 2);
  const h = 112;
  // To the right of the cluster, or to its left where the right has no room; always inside the stage. A leader runs
  // from the cluster's brackets to the card, so it is clear which cluster the card is about.
  const bracket = 13 + grow;
  const gap = bracket + 26;
  const right = x + gap + w <= width - 8;
  const left = right ? x + gap : Math.max(8, x - gap - w);
  const top = Math.max(8, Math.min(height - h - 8, y - h / 2));

  ctx.save();
  ctx.globalAlpha = tour.alpha;
  ctx.strokeStyle = 'rgba(237,237,237,0.6)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + (right ? bracket + 3 : -bracket - 3), y);
  ctx.lineTo(right ? left : left + w, Math.max(top + 14, Math.min(top + h - 14, y)));
  ctx.stroke();
  ctx.fillStyle = 'rgba(14,14,14,0.94)';
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(left + 0.5, top + 0.5, w, h, 10);
  ctx.fill();
  ctx.stroke();
  ctx.textBaseline = 'alphabetic';

  // Which best: its mark, its name, and where it falls in the tour.
  const titleY = top + 24;
  ctx.fillStyle = run ? BEST : islandColor(island);
  ctx.beginPath();
  if (run) {
    ctx.moveTo(left + pad + 4, titleY - 8.5);
    ctx.lineTo(left + pad + 8, titleY - 4.5);
    ctx.lineTo(left + pad + 4, titleY - 0.5);
    ctx.lineTo(left + pad, titleY - 4.5);
    ctx.closePath();
  } else ctx.arc(left + pad + 4, titleY - 4.5, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = font(500, 12);
  ctx.fillStyle = '#ededed';
  ctx.fillText(title, left + pad + 14, titleY);
  if (faded) {
    const pillLeft = left + pad + 14 + titleWidth + 8;
    ctx.strokeStyle = 'rgba(251,191,36,0.7)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(pillLeft, titleY - 12, pillWidth, 15, 7.5);
    ctx.stroke();
    ctx.font = font(500, 10);
    ctx.fillStyle = '#fbbf24';
    ctx.fillText('Faded', pillLeft + 6, titleY - 1);
  }
  ctx.font = font(400, 11);
  ctx.fillStyle = '#8f8f8f';
  ctx.textAlign = 'right';
  ctx.fillText(step, left + w - pad, titleY);
  ctx.textAlign = 'start';

  const valueY = top + 52;
  ctx.font = font(600, 20);
  ctx.fillStyle = BEST;
  ctx.fillText(value, left + pad, valueY);
  const valueWidth = ctx.measureText(value).width;
  ctx.font = font(400, 11);
  ctx.fillStyle = '#8f8f8f';
  ctx.fillText('best fitness', left + pad + valueWidth + 8, valueY);

  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fillRect(left + pad, top + 66, w - pad * 2, 1);

  let column = left + pad;
  stats.forEach(([label, text], k) => {
    ctx.font = font(400, 11);
    ctx.fillStyle = '#8f8f8f';
    ctx.fillText(label, column, top + 85);
    ctx.font = font(500, 12.5);
    ctx.fillStyle = '#ededed';
    ctx.fillText(text, column, top + 101);
    column += columns[k]! + columnGap;
  });
  ctx.restore();
}
