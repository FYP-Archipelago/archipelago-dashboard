import { islandColor } from '@/colors.ts';
import type { Point } from '@/drawing.ts';
import { torusGrid } from '@/pages/new-run/form.ts';

export default function TopologyGlyph({ kind, count }: { kind: string; count: number }) {
  const size = 44;
  const centre = size / 2;
  const radius = 15;

  let points: Point[] = Array.from({ length: count }, (_, i) => [
    centre + radius * Math.sin((2 * Math.PI * i) / count),
    centre - radius * Math.cos((2 * Math.PI * i) / count),
  ]);
  let edges: [number, number][] = [];

  if (kind === 'ring' || kind === 'bidirectional_ring') edges = points.map((_, i) => [i, (i + 1) % count]);
  if (kind === 'fully_connected') for (let i = 0; i < count; i++) for (let j = i + 1; j < count; j++) edges.push([i, j]);
  if (kind === 'lattice') {
    points = Array.from({ length: count }, (_, i) => [6 + (i * (size - 12)) / (count - 1), centre + (i % 2 ? -6 : 6)]);
    edges = points.slice(1).map((_, i) => [i, i + 1]);
  }
  if (kind === 'star') {
    points = [[centre, centre], ...points.slice(0, count - 1)];
    edges = points.slice(1).map((_, i) => [0, i + 1]);
  }
  if (kind === 'torus') {
    // The grid the runner would build, joined to its right and lower neighbours; the wrap-around links are left out.
    const { rows, columns } = torusGrid(count);
    points = Array.from({ length: count }, (_, i) => [
      columns > 1 ? 7 + ((i % columns) * 30) / (columns - 1) : centre,
      rows > 1 ? 12 + (Math.floor(i / columns) * 20) / (rows - 1) : centre,
    ]);
    edges = points.flatMap((_, i) => [
      ...(i % columns < columns - 1 ? [[i, i + 1] as [number, number]] : []),
      ...(i + columns < count ? [[i, i + columns] as [number, number]] : []),
    ]);
  }
  if (kind === 'random') {
    const links: [number, number][] = [
      [0, 2],
      [1, 3],
      [2, 4],
      [0, 3],
      [4, 1],
      [5, 2],
    ];
    edges = links.filter(([from, to]) => from < points.length && to < points.length);
  }

  // A one-way ring is dashed so it reads differently from the bidirectional one.
  const oneWay = kind === 'ring';

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      {edges.map(([from, to], i) => (
        <line
          key={i}
          x1={points[from]![0]}
          y1={points[from]![1]}
          x2={points[to]![0]}
          y2={points[to]![1]}
          stroke="currentColor"
          strokeOpacity={oneWay ? 0.7 : 0.45}
          strokeWidth={1.2}
          strokeDasharray={oneWay ? '3 2' : undefined}
        />
      ))}
      {points.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={3.2} fill={islandColor(i)} />
      ))}
    </svg>
  );
}
