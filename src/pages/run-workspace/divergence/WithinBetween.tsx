import { useEffect, useRef, useState } from 'react';

import { islandColor } from '@/colors.ts';
import { niceTicks, useSize } from '@/pages/run-workspace/charts/LineChart.tsx';

const significant = new Intl.NumberFormat('en', { maximumSignificantDigits: 2 });
const tickFormat = new Intl.NumberFormat('en', { maximumSignificantDigits: 3 });
const islandsOf = (key: string) => key.split('-').map(Number) as [number, number];

const HEIGHT = 110;
// Room for the y tick values (left) and the x tick values (bottom), and the plot's other edges.
const MARGIN = { left: 26, right: 10, top: 8, bottom: 14 };
const DOT = 11;

type Point = { island: number; between: number; inside: number; x: number; y: number };
// Dots close enough to overlap, drawn as one stack at their mean that fans out into a ring on hover.
type Stack = { points: Point[]; x: number; y: number };

function stacksOf(points: Point[]): Stack[] {
  const groups: Point[][] = [];
  for (const point of points) {
    const touching = groups.filter((group) => group.some((other) => Math.hypot(other.x - point.x, other.y - point.y) < 2 * DOT));
    const merged = [point, ...touching.flat()];
    for (const group of touching) groups.splice(groups.indexOf(group), 1);
    groups.push(merged);
  }
  return groups.map((group) => {
    const ordered = [...group].sort((a, b) => a.island - b.island);
    return {
      points: ordered,
      x: ordered.reduce((sum, p) => sum + p.x, 0) / ordered.length,
      y: ordered.reduce((sum, p) => sum + p.y, 0) / ordered.length,
    };
  });
}

function placed(stack: Stack, fanned: boolean) {
  const n = stack.points.length;
  if (!fanned) return stack.points.map((point, i) => ({ point, x: stack.x + (i - (n - 1) / 2) * 6, y: stack.y }));
  const radius = Math.max(2 * DOT, (2 * DOT + 3) / (2 * Math.sin(Math.PI / n)));
  const around = stack.points.map((point) => ({ point, angle: Math.atan2(point.y - stack.y, point.x - stack.x) })).sort((a, b) => a.angle - b.angle);
  const slot = (i: number) => (2 * Math.PI * i) / n;
  const [sin, cos] = around.reduce(([s, c], { angle }, i) => [s + Math.sin(angle - slot(i)), c + Math.cos(angle - slot(i))], [0, 0]);
  const turn = Math.hypot(sin, cos) < 1e-6 ? -Math.PI / 2 : Math.atan2(sin, cos);
  return around.map(({ point }, i) => {
    const angle = turn + slot(i);
    return { point, x: stack.x + radius * Math.cos(angle), y: stack.y + radius * Math.sin(angle) };
  });
}

// Each island as a dot, its distance from the others across against its own population's diversity up.
// Both axes start at 0, so islands that are all alike bunch together instead of spreading across the plot.
// Dots that would overlap stack, and fan out on hover with a line to each one's true spot.
export default function WithinBetween({
  islands,
  values,
  diversity,
}: {
  islands: number[];
  values: Map<string, number>;
  diversity: Map<number, number>;
}) {
  // The hovered stack, and whether its dots are out on their ring.
  // Opening mounts them at the stack and fans them out a frame later so they glide, and closing glides them back first.
  const [open, setOpen] = useState<number | null>(null);
  // Drawn at the card's real width, so dots and text keep their size and the plot its height however wide the card is.
  const [box, size] = useSize();
  const width = size.width || 320;
  const [fanned, setFanned] = useState(false);
  const closing = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    if (open === null) return;
    const frame = requestAnimationFrame(() => setFanned(true));
    return () => cancelAnimationFrame(frame);
  }, [open]);
  useEffect(() => () => clearTimeout(closing.current), []);
  const enter = (index: number) => {
    clearTimeout(closing.current);
    if (open !== index) {
      setFanned(false);
      setOpen(index);
    } else setFanned(true);
  };
  const leave = () => {
    setFanned(false);
    // As long as the dots' glide.
    closing.current = setTimeout(() => setOpen(null), 350);
  };
  const measured = islands.flatMap((island) => {
    const own = [...values].filter(([key]) => islandsOf(key).includes(island)).map(([, v]) => v);
    const inside = diversity.get(island);
    return own.length && inside !== undefined ? [{ island, between: own.reduce((sum, v) => sum + v, 0) / own.length, inside }] : [];
  });
  if (!measured.length)
    return (
      <div className="within-between">
        <div className="within-between-title">No diversity was logged for this period</div>
      </div>
    );
  const x1 = Math.max(...measured.map((p) => p.between)) || 1;
  const y1 = Math.max(...measured.map((p) => p.inside)) || 1;
  // Dots stay a radius inside the axes, so a value of 0 sits clear of them.
  const sx = (v: number) => MARGIN.left + DOT + (v / x1) * (width - MARGIN.left - MARGIN.right - 2 * DOT);
  const sy = (v: number) => HEIGHT - MARGIN.bottom - DOT - (v / y1) * (HEIGHT - MARGIN.top - MARGIN.bottom - 2 * DOT);
  const stacks = stacksOf(measured.map((p) => ({ ...p, x: sx(p.between), y: sy(p.inside) })));
  const axisY = HEIGHT - MARGIN.bottom;
  return (
    <div className="within-between">
      <div className="within-between-title">Own diversity against distance from the others</div>
      <div ref={box}>
        <svg
          className="within-plot"
          width={width}
          height={HEIGHT}
          viewBox={`0 0 ${width} ${HEIGHT}`}
          role="img"
          aria-label="Each island's own diversity against its distance from the others"
        >
          <g className="within-axes-lines">
            <line x1={MARGIN.left} x2={width - MARGIN.right} y1={axisY} y2={axisY} />
            <line x1={MARGIN.left} x2={MARGIN.left} y1={MARGIN.top} y2={axisY} />
            {niceTicks(0, x1, 6).map((tick) => (
              <g key={`x-${tick}`}>
                <line x1={sx(tick)} x2={sx(tick)} y1={axisY} y2={axisY + 3} />
                <text x={sx(tick)} y={HEIGHT - 2} textAnchor="middle">
                  {tickFormat.format(tick)}
                </text>
              </g>
            ))}
            {niceTicks(0, y1, 4).map((tick) => (
              <g key={`y-${tick}`}>
                <line x1={MARGIN.left - 3} x2={MARGIN.left} y1={sy(tick)} y2={sy(tick)} />
                <text x={MARGIN.left - 5} y={sy(tick)} textAnchor="end" dominantBaseline="middle">
                  {tickFormat.format(tick)}
                </text>
              </g>
            ))}
          </g>
          {stacks.map((stack, index) => {
            const ring = placed(stack, true);
            const reach = Math.max(...ring.map((dot) => Math.hypot(dot.x - stack.x, dot.y - stack.y))) + DOT + 4;
            // The open stack's dots are drawn by the layer on top instead.
            const raised = open === index && stack.points.length > 1;
            return (
              <g key={stack.points[0]!.island} onPointerEnter={() => enter(index)} onPointerLeave={leave}>
                {/* Holds the hover across the whole ring, so moving between the fanned dots keeps it open. */}
                {stack.points.length > 1 && <circle className="within-hover" cx={stack.x} cy={stack.y} r={reach} />}
                {!raised &&
                  placed(stack, false).map(({ point, x, y }) => (
                    <g key={point.island} className="within-dot" style={{ transform: `translate(${x}px, ${y}px)` }}>
                      <title>
                        Island {point.island}: {significant.format(point.between)} from the others, own diversity {significant.format(point.inside)}
                      </title>
                      <circle r={DOT} fill={islandColor(point.island)} />
                      <text textAnchor="middle" dominantBaseline="central">
                        {point.island}
                      </text>
                    </g>
                  ))}
              </g>
            );
          })}
          {/* The open stack, last so it covers the other dots; the pointer passes through it to the stack's hover area. */}
          {open !== null && stacks[open] && stacks[open].points.length > 1 && (
            <g className="within-raised">
              {placed(stacks[open], true).map(({ point, x, y }) => (
                <g key={`at-${point.island}`} className={`within-true-spot${fanned ? ' within-true-spot-shown' : ''}`}>
                  <line x1={point.x} y1={point.y} x2={x} y2={y} stroke={islandColor(point.island)} pathLength={1} />
                  <circle cx={point.x} cy={point.y} r={2} fill={islandColor(point.island)} />
                </g>
              ))}
              {placed(stacks[open], fanned).map(({ point, x, y }) => (
                <g key={point.island} className="within-dot" style={{ transform: `translate(${x}px, ${y}px)` }}>
                  <title>
                    Island {point.island}: {significant.format(point.between)} from the others, own diversity {significant.format(point.inside)}
                  </title>
                  <circle r={DOT} fill={islandColor(point.island)} />
                  <text textAnchor="middle" dominantBaseline="central">
                    {point.island}
                  </text>
                </g>
              ))}
            </g>
          )}
        </svg>
      </div>
      <div className="within-axes">
        <span>↑ More varied inside</span>
        <span>Further from the others →</span>
      </div>
    </div>
  );
}
