import { useEffect, useRef, useState } from 'react';

import { reducedMotion } from '@/style.ts';

type Shape = number[][][];

// The play triangle cut in two halves whose corners line up with the two pause bars', corner by corner (top left,
// top right, bottom right, bottom left), so one shape can slide into the other. On a 14px grid, so edges stay sharp.
export const PLAY = [
  [
    [4, 2],
    [8.25, 4.5],
    [8.25, 9.5],
    [4, 12],
  ],
  [
    [8.25, 4.5],
    [12.5, 7],
    [12.5, 7],
    [8.25, 9.5],
  ],
];
export const PAUSE = [
  [
    [3.4, 2],
    [5.6, 2],
    [5.6, 12],
    [3.4, 12],
  ],
  [
    [8.4, 2],
    [10.6, 2],
    [10.6, 12],
    [8.4, 12],
  ],
];

// One icon sliding into another, as YouTube's play button turns into pause: `from` and `to` are the same number of
// polygons with the same number of corners, matched corner by corner, on a 14px grid. Off shows `from`, on shows `to`.
export default function MorphIcon({ from, to, on }: { from: Shape; to: Shape; on: boolean }) {
  // 0 is `from`, 1 is `to`.
  const [shown, setShown] = useState(on ? 1 : 0);
  const at = useRef(shown);
  useEffect(() => {
    const start = at.current;
    const goal = on ? 1 : 0;
    const begin = performance.now();
    const duration = reducedMotion() ? 0 : 220;
    let frame = requestAnimationFrame(function step(now) {
      const t = duration ? Math.min(1, (now - begin) / duration) : 1;
      at.current = start + (goal - start) * (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
      setShown(at.current);
      if (t < 1) frame = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(frame);
  }, [on]);
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      {from.map((polygon, p) => (
        <polygon
          key={p}
          points={polygon.map(([x, y], k) => `${x! + (to[p]![k]![0]! - x!) * shown},${y! + (to[p]![k]![1]! - y!) * shown}`).join(' ')}
          fill="currentColor"
          stroke="currentColor"
          strokeWidth="0.8"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}
