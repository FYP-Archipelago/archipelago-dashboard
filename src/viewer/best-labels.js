// Screen-space label layout only; anchors remain at the projected node position.
export function placeBestLabel(anchor, bounds, occupied) {
  const width = Math.min(116, bounds.width - 16),
    height = 26,
    gap = 6;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(v, hi));
  for (let row = 0; row <= occupied.length + 1; row++) {
    for (const sign of row === 0 ? [0] : [-1, 1]) {
      for (const side of [1, -1]) {
        const x = clamp(anchor[0] + (side === 1 ? 22 : -width - 22), bounds.x + 8, bounds.x + bounds.width - width - 8);
        const y = clamp(anchor[1] - height / 2 + sign * row * (height + gap), bounds.y + 8, bounds.y + bounds.height - height - 8);
        const box = { x, y, width, height };
        if (occupied.every((b) => x + width + gap <= b.x || b.x + b.width + gap <= x || y + height + gap <= b.y || b.y + b.height + gap <= y))
          return box;
      }
    }
  }
  return { x: bounds.x + 8, y: bounds.y + 8, width, height };
}
