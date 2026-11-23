import type { CSSProperties } from 'react';

// CSS custom properties such as --c need a cast to pass as a style.
export const vars = (values: Record<string, string | number>) => values as CSSProperties;

export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
