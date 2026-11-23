import type { KeyboardEvent } from 'react';

export type Point = [number, number];

// A small random generator seeded by text, so a drawing comes out the same on every render.
export function seeded(text: string) {
  let state = [...text].reduce((hash, char) => (Math.imul(hash, 31) + char.charCodeAt(0)) >>> 0, 7) % 2147483647 || 1;
  return () => (state = (state * 16807) % 2147483647) / 2147483647;
}

// The step an arrow key asks for: 1, or 10 with Shift, up or down; null for any other key. Left and right count only
// when `sideways`, so a text field keeps them for moving the caret.
export function arrowStep(event: KeyboardEvent, sideways: boolean): number | null {
  const direction = { ArrowUp: 1, ArrowDown: -1, ...(sideways ? { ArrowRight: 1, ArrowLeft: -1 } : {}) }[event.key];
  return direction ? direction * (event.shiftKey ? 10 : 1) : null;
}
