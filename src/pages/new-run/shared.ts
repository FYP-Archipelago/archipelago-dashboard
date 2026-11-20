import type { CSSProperties } from 'react';

export type Pt = [number, number];

// A small random generator seeded by text, so a drawing comes out the same on every render.
export function seeded(text: string) {
  let state = [...text].reduce((hash, char) => (Math.imul(hash, 31) + char.charCodeAt(0)) >>> 0, 7) % 2147483647 || 1;
  return () => (state = (state * 16807) % 2147483647) / 2147483647;
}

// CSS custom properties such as --c need a cast to pass as a style.
export const vars = (values: Record<string, string | number>) => values as CSSProperties;
