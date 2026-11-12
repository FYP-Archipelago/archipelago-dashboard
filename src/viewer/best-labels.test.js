import { test, expect } from 'vitest';
import { placeBestLabel } from './best-labels.js';

test('overlapping best nodes retain separate labels inside the offset canvas', () => {
  for (const anchor of [
    [600, 580],
    [302, 5],
    [899, 599],
  ]) {
    const bounds = { x: 300, y: 0, width: 600, height: 600 },
      boxes = [];
    for (let i = 0; i < 6; i++) {
      const b = placeBestLabel(anchor, bounds, boxes);
      expect(b.x >= bounds.x && b.x + b.width <= bounds.x + bounds.width).toBeTruthy();
      expect(b.y >= bounds.y && b.y + b.height <= bounds.y + bounds.height).toBeTruthy();
      expect(boxes.every((a) => b.x + b.width <= a.x || a.x + a.width <= b.x || b.y + b.height <= a.y || a.y + a.height <= b.y)).toBeTruthy();
      boxes.push(b);
    }
  }
});
