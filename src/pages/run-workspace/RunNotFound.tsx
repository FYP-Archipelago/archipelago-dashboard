import { islandColor } from '@/colors.ts';
import Icon from '@/components/Icon.tsx';
import Link from '@/components/Link.tsx';
import { seeded, type Point } from '@/drawing.ts';
import { newRunHref, runsHref } from '@/route.ts';
import { vars } from '@/style.ts';

import './run-not-found.css';

// An organic coastline around (cx, cy): a circle whose radius wanders by a few smooth bumps.
function coastline(cx: number, cy: number, radius: number, seed: string): string {
  const random = seeded(seed);
  const bumps = [2, 3, 5].map((k) => ({ k, size: 0.06 + random() * 0.1, phase: random() * Math.PI * 2 }));
  const points: Point[] = Array.from({ length: 40 }, (_, i) => {
    const angle = (i / 40) * Math.PI * 2;
    const r = radius * (1 + bumps.reduce((sum, { k, size, phase }) => sum + size * Math.sin(k * angle + phase), 0));
    return [cx + r * Math.cos(angle), cy + r * 0.78 * Math.sin(angle)];
  });
  // Quadratic curves through the midpoints keep the outline smooth.
  const mid = (a: Point, b: Point) => `${((a[0] + b[0]) / 2).toFixed(1)},${((a[1] + b[1]) / 2).toFixed(1)}`;
  const last = points.at(-1)!;
  return `M${mid(last, points[0]!)} ${points.map((point, i) => `Q${point[0].toFixed(1)},${point[1].toFixed(1)} ${mid(point, points[(i + 1) % points.length]!)}`).join(' ')}Z`;
}

function SeaChart() {
  const islands = [
    { x: 92, y: 92, r: 38, island: 0 },
    { x: 330, y: 62, r: 28, island: 1 },
    { x: 352, y: 178, r: 22, island: 3 },
  ];
  const mark: Point = [222, 168];
  const course = `M${islands[0]!.x + 30},${islands[0]!.y + 26} C160,150 170,190 ${mark[0]},${mark[1]}`;
  return (
    <svg className="sea-chart" viewBox="0 0 440 240" aria-hidden="true">
      {[40, 80, 120, 160, 200].map((y) => (
        <line key={`h${y}`} className="sea-chart-grid" x1={0} x2={440} y1={y} y2={y} />
      ))}
      {[55, 110, 165, 220, 275, 330, 385].map((x) => (
        <line key={`v${x}`} className="sea-chart-grid" x1={x} x2={x} y1={0} y2={240} />
      ))}
      {islands.map(({ x, y, r, island }) => (
        <g key={island} className="sea-chart-island" style={vars({ '--c': islandColor(island) })}>
          <path className="sea-chart-contour" d={coastline(x, y, r * 1.55, `island-${island}`)} />
          <path className="sea-chart-contour" d={coastline(x, y, r * 1.25, `island-${island}`)} />
          <path className="sea-chart-land" d={coastline(x, y, r, `island-${island}`)} />
          <text x={x} y={y + 3} textAnchor="middle">
            {island}
          </text>
        </g>
      ))}
      <path className="sea-chart-course" d={course} />
      <circle className="sea-chart-boat" r={3.5} style={vars({ offsetPath: `path("${course}")` })} />
      {[0, 1, 2].map((i) => (
        <circle
          key={i}
          className="sea-chart-ripple"
          cx={mark[0]}
          cy={mark[1]}
          r={26}
          style={vars({ '--d': `${-i}s`, transformOrigin: `${mark[0]}px ${mark[1]}px` })}
        />
      ))}
      <path className="sea-chart-mark" d={`M${mark[0] - 7},${mark[1] - 7} l14,14 m0,-14 l-14,14`} />
    </svg>
  );
}

export default function RunNotFound({ id }: { id: string }) {
  return (
    <div className="not-found">
      <SeaChart />
      <h1>Run Not Found</h1>
      <p className="run-not-found-message">
        No run with ID <span className="run-not-found-id monospace">{id}</span> exists.
      </p>
      <div className="not-found-actions">
        <Link className="button button-primary" href={runsHref}>
          Back to Runs
        </Link>
        <Link className="button" href={newRunHref}>
          <Icon name="plus" size={14} stroke={2} />
          New Run
        </Link>
      </div>
    </div>
  );
}
