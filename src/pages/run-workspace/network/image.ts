import type { Run } from '@/types.ts';

import { FONT } from './overlay.ts';

// Saves the network as drawn, with the run id, preset and height in the top left and the Archipelago mark in the
// bottom right, so the picture still says what it shows once it leaves the dashboard.
export async function saveNetworkImage({ image, scale }: { image: HTMLCanvasElement; scale: number }, run: Run, height: string) {
  const ctx = image.getContext('2d')!;
  ctx.scale(scale, scale);
  const width = image.width / scale;
  const bottom = image.height / scale;
  // A soft shadow keeps the text readable where it crosses the network.
  ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
  ctx.shadowBlur = 6;

  ctx.fillStyle = '#ededed';
  ctx.font = '600 14px "Geist Mono Variable", ui-monospace, monospace';
  ctx.fillText(run.run_id, 22, 34);
  ctx.fillStyle = '#a1a1a1';
  ctx.font = `12px ${FONT}`;
  // Best fitness -> Best Fitness View
  const view = `${height.replace(/\b\w/g, (letter) => letter.toUpperCase())} View`;
  ctx.fillText(`${run.preset} · ${view}`, 22, 54);

  const logo = new Image();
  logo.src = '/favicon.svg';
  await logo.decode().catch(() => {});
  ctx.font = `600 15px ${FONT}`;
  const brand = 'Archipelago';
  const brandWidth = ctx.measureText(brand).width;
  const right = width - 20;
  const baseline = bottom - 22;
  if (logo.complete && logo.naturalWidth) ctx.drawImage(logo, right - brandWidth - 32, baseline - 18, 24, 24);
  ctx.fillStyle = '#ededed';
  ctx.fillText(brand, right - brandWidth, baseline);

  const link = document.createElement('a');
  link.download = `${run.run_name}-network.png`;
  link.href = image.toDataURL('image/png');
  link.click();
}
