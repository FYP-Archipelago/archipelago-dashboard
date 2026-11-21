import { useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from 'react';

import './chart.css';

type Series = { key: number; label: string; color: string; xs: number[]; ys: (number | null)[] };

type Props = {
  label: string;
  series: Series[];
  // Without a height the chart fills its container, which then needs a height from its own layout.
  height?: number;
  log: boolean;
  xTitle: string;
  hoverTitle: (x: number) => string;
  formatY: (y: number | null) => string;
  // The tooltip lists the series best value first.
  better: 'lower' | 'higher';
  highlight: number | null;
  marker: { x: number; y: number } | null;
  // Lines draw in again whenever this changes, e.g. on a new metric, but not when a series is toggled.
  replayKey: string;
  // Called with the x the crosshair snaps to, so other views can follow it.
  onHoverX?: (x: number) => void;
  // Shaded from each x to the end of the axis, so overlapping shades stack darker. `label` goes in a pill above the
  // plot, merged with a neighbour too close to fit beside it; `note` labels a span from x to the end, below the axis.
  shades?: { x: number; label: string; note: string }[];
  // Hollow points, e.g. where a threshold was crossed.
  rings?: { x: number; y: number }[];
};

const MARGIN = { top: 12, right: 16, bottom: 46, left: 60 };

const tickFormat = new Intl.NumberFormat('en', { notation: 'compact', maximumSignificantDigits: 3 });

function useSize() {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setSize({ width: element.clientWidth, height: element.clientHeight }));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, size] as const;
}

// Round steps (1, 2, 2.5, 5 times a power of ten) giving at most `count` ticks between lo and hi.
export function niceTicks(lo: number, hi: number, count: number): number[] {
  const span = hi - lo;
  if (!(span > 0)) return [lo];
  const power = 10 ** Math.floor(Math.log10(span / count));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * power).find((s) => span / s <= count) ?? power * 10;
  const ticks: number[] = [];
  for (let value = Math.ceil(lo / step) * step; value <= hi + step * 1e-9; value += step) ticks.push(Number(value.toPrecision(12)));
  return ticks;
}

// Ticks for a log axis, given its ends as powers of ten: whole decades when the range spans enough of them,
// then 1-2-5 steps, then round values for ranges narrower than a decade.
export function logTicks(lo: number, hi: number): number[] {
  const at = (multiples: number[]) => {
    const ticks: number[] = [];
    for (let decade = Math.floor(lo); decade <= Math.ceil(hi); decade++)
      for (const m of multiples) {
        const tick = decade + Math.log10(m);
        if (tick >= lo && tick <= hi) ticks.push(tick);
      }
    return ticks;
  };
  const decades = at([1]);
  if (decades.length >= 3) return decades.filter((_, i, all) => all.length <= 7 || i % Math.ceil(all.length / 7) === 0);
  const steps = at([1, 2, 5]);
  if (steps.length >= 3) return steps;
  return niceTicks(10 ** lo, 10 ** hi, 6)
    .filter((value) => value > 0)
    .map(Math.log10);
}

// Index of the point in sorted `xs` nearest to x.
function nearest(xs: number[], x: number): number {
  let lo = 0;
  let hi = xs.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (xs[mid]! < x) lo = mid + 1;
    else hi = mid;
  }
  return lo > 0 && Math.abs(xs[lo - 1]! - x) <= Math.abs(xs[lo]! - x) ? lo - 1 : lo;
}

export default function LineChart({
  label,
  series,
  height: fixedHeight,
  log,
  xTitle,
  hoverTitle,
  formatY,
  better,
  highlight,
  marker,
  replayKey,
  onHoverX,
  shades = [],
  rings = [],
}: Props) {
  const [ref, size] = useSize();
  const width = size.width;
  // Room for the shades' pills above the plot and their spans below the axis, added to a fixed height.
  const shadeTop = shades.length ? 26 : 0;
  const shadeBottom = shades.length * 18;
  const height = fixedHeight ? fixedHeight + shadeTop + shadeBottom : size.height;
  const [hoverX, setHoverX] = useState<number | null>(null);
  const [pointerY, setPointerY] = useState(0);

  // On a log axis every value is plotted as its log10; the caller only offers log when all values are positive.
  const toY = (value: number | null) => (value === null ? null : log ? Math.log10(value) : value);

  const scales = useMemo(() => {
    const xs = series.flatMap((s) => s.xs);
    const ys = series.flatMap((s) => s.ys.map((value) => (value === null ? null : log ? Math.log10(value) : value))).filter((v) => v !== null);
    if (!xs.length || !ys.length || width === 0 || height === 0) return null;
    const x0 = Math.min(...xs);
    const x1 = Math.max(...xs);
    const plotRight = width - MARGIN.right;
    const plotWidth = plotRight - MARGIN.left;
    const sx = (x: number) => MARGIN.left + ((x - x0) / (x1 - x0 || 1)) * plotWidth;
    const plotTop = MARGIN.top + shadeTop;
    const plotBottom = height - MARGIN.bottom - shadeBottom;
    let y0 = Math.min(...ys);
    let y1 = Math.max(...ys);
    const pad = (y1 - y0) * 0.05 || Math.abs(y0) * 0.1 || 1;
    y0 -= pad;
    y1 += pad;
    const plotHeight = plotBottom - plotTop;

    // Text widths are estimated from the character count; the pills' padding absorbs the difference.
    const pillWidth = (label: string) => label.length * 6.4 + 16;
    const pills: { x: number; xs: number[]; label: string; width: number }[] = [];
    for (const shade of [...shades].sort((a, b) => a.x - b.x)) {
      const x = sx(shade.x);
      const previous = pills.at(-1);
      if (previous && previous.x + previous.width / 2 + 6 > x - pillWidth(shade.label) / 2) {
        previous.xs.push(x);
        previous.label += ` · ${shade.label}`;
        previous.width = pillWidth(previous.label);
        previous.x = (previous.xs[0]! + x) / 2;
      } else pills.push({ x, xs: [x], label: shade.label, width: pillWidth(shade.label) });
    }
    for (const pill of pills) pill.x = Math.min(Math.max(pill.x, MARGIN.left + pill.width / 2), plotRight - pill.width / 2);

    return {
      x0,
      x1,
      sx,
      sy: (y: number) => plotTop + (1 - (y - y0) / (y1 - y0)) * plotHeight,
      plotWidth,
      plotHeight,
      plotTop,
      plotBottom,
      plotRight,
      pills,
      xTicks: niceTicks(x0, x1, Math.max(3, Math.floor(plotWidth / 110))),
      yTicks: (log ? logTicks(y0, y1) : niceTicks(y0, y1, 5)).filter((tick) => tick >= y0 && tick <= y1),
    };
  }, [series, log, width, height, shades, shadeTop, shadeBottom]);

  const paths = useMemo(() => {
    if (!scales) return [];
    return series.map((s) => {
      let d = '';
      let pen = false;
      s.xs.forEach((x, i) => {
        const y = s.ys[i] ?? null;
        if (y === null) {
          pen = false;
          return;
        }
        d += `${pen ? 'L' : 'M'}${scales.sx(x).toFixed(1)},${scales.sy(log ? Math.log10(y) : y).toFixed(1)}`;
        pen = true;
      });
      return { key: s.key, color: s.color, d };
    });
  }, [series, scales, log]);

  const onMove = (event: PointerEvent<SVGRectElement>) => {
    if (!scales) return;
    const box = event.currentTarget.getBoundingClientRect();
    const x = scales.x0 + ((event.clientX - box.left) / box.width) * (scales.x1 - scales.x0);
    // Islands log at different evaluation counts, so the crosshair snaps to the closest point of any of them.
    const closest = series
      .filter((s) => s.xs.length)
      .map((s) => s.xs[nearest(s.xs, x)]!)
      .reduce((best, candidate) => (Math.abs(candidate - x) < Math.abs(best - x) ? candidate : best));
    setHoverX(closest);
    onHoverX?.(closest);
    setPointerY(event.clientY - box.top + scales.plotTop);
  };

  const hovered =
    hoverX === null
      ? []
      : series
          .filter((s) => s.xs.length)
          .map((s) => {
            const i = nearest(s.xs, hoverX);
            return { series: s, x: s.xs[i]!, y: s.ys[i] ?? null };
          })
          .sort((a, b) => (a.y === null ? 1 : b.y === null ? -1 : better === 'lower' ? a.y - b.y : b.y - a.y));

  return (
    <div ref={ref} className={`chart${fixedHeight ? '' : ' fill'}`} style={fixedHeight ? { height } : undefined}>
      {scales && (
        <svg width={width} height={height} role="img" aria-label={label}>
          <g className="chart-grid">
            {scales.yTicks.map((tick) => (
              <g key={tick}>
                <line x1={MARGIN.left} x2={width - MARGIN.right} y1={scales.sy(tick)} y2={scales.sy(tick)} />
                <text x={MARGIN.left - 10} y={scales.sy(tick)} textAnchor="end" dominantBaseline="middle">
                  {tickFormat.format(log ? 10 ** tick : tick)}
                </text>
              </g>
            ))}
            {scales.xTicks.map((tick) => (
              <text key={tick} x={scales.sx(tick)} y={scales.plotBottom + 18} textAnchor="middle">
                {tickFormat.format(tick)}
              </text>
            ))}
            <line className="chart-baseline" x1={MARGIN.left} x2={width - MARGIN.right} y1={scales.plotBottom} y2={scales.plotBottom} />
            <text x={width - MARGIN.right} y={height - 2} textAnchor="end">
              {xTitle}
            </text>
          </g>
          {shades.length > 0 && (
            <g key={`shades-${replayKey}`} className="chart-shades">
              {shades.map((shade) => {
                const x = scales.sx(shade.x);
                return (
                  <g key={shade.label}>
                    <rect x={x} y={scales.plotTop} width={scales.plotRight - x} height={scales.plotHeight} />
                    <line x1={x} x2={x} y1={scales.plotTop} y2={scales.plotBottom} />
                  </g>
                );
              })}
              {scales.pills.map((pill) => {
                const bottom = MARGIN.top + 18;
                return (
                  <g key={pill.label} className="chart-pill">
                    {/* A merged pill joins its shades' lines with a bracket under it. */}
                    <path
                      d={`M${pill.x},${bottom}V${scales.plotTop - 3}${pill.xs.length > 1 ? `M${pill.xs[0]},${scales.plotTop}V${scales.plotTop - 3}H${pill.xs.at(-1)}V${scales.plotTop}` : ''}`}
                    />
                    <rect x={pill.x - pill.width / 2} y={MARGIN.top} width={pill.width} height={18} rx={9} />
                    <text x={pill.x} y={MARGIN.top + 9} textAnchor="middle" dominantBaseline="central">
                      {pill.label}
                    </text>
                  </g>
                );
              })}
              {[...shades]
                .sort((a, b) => a.x - b.x)
                .map((shade, row) => {
                  const start = scales.sx(shade.x);
                  const end = scales.plotRight;
                  const y = scales.plotBottom + 36 + row * 18;
                  const textWidth = shade.note.length * 6.2;
                  // The note sits inside its span when it fits, the span's line broken around it; otherwise just left of it.
                  const inside = textWidth + 24 <= end - start;
                  const middle = (start + end) / 2;
                  const line = inside
                    ? `M${start},${y}H${middle - textWidth / 2 - 6}M${middle + textWidth / 2 + 6},${y}H${end}`
                    : `M${start},${y}H${end}`;
                  return (
                    <g key={shade.label} className="chart-span">
                      <path d={`${line}M${start},${y - 3}v6M${end},${y - 3}v6`} />
                      <text x={inside ? middle : start - 8} y={y} textAnchor={inside ? 'middle' : 'end'} dominantBaseline="central">
                        {shade.note}
                      </text>
                    </g>
                  );
                })}
            </g>
          )}
          <g key={replayKey}>
            {paths.map((path) => (
              <path
                key={path.key}
                className="chart-line"
                pathLength={1}
                d={path.d}
                style={{ stroke: path.color }}
                strokeWidth={highlight === path.key ? 2.5 : 1.75}
                opacity={highlight === null || highlight === path.key ? 1 : 0.15}
              />
            ))}
          </g>
          {rings.map(
            (ring) =>
              toY(ring.y) !== null && (
                <circle key={`${replayKey}-${ring.x}`} className="chart-ring" cx={scales.sx(ring.x)} cy={scales.sy(toY(ring.y)!)} r={4.5} />
              )
          )}
          {marker && toY(marker.y) !== null && <circle className="chart-marker" cx={scales.sx(marker.x)} cy={scales.sy(toY(marker.y)!)} r={5} />}
          {hoverX !== null && (
            <g className="chart-hover">
              <line x1={scales.sx(hoverX)} x2={scales.sx(hoverX)} y1={scales.plotTop} y2={scales.plotBottom} />
              {hovered.map(
                (row) =>
                  row.y !== null && <circle key={row.series.key} cx={scales.sx(row.x)} cy={scales.sy(toY(row.y)!)} r={4} fill={row.series.color} />
              )}
            </g>
          )}
          <rect
            x={MARGIN.left}
            y={scales.plotTop}
            width={scales.plotWidth}
            height={scales.plotHeight}
            fill="transparent"
            onPointerMove={onMove}
            onPointerLeave={() => setHoverX(null)}
          />
        </svg>
      )}
      {scales && hoverX !== null && (
        <div
          className="hover-tip"
          style={{
            top: Math.max(scales.plotTop, Math.min(pointerY, scales.plotBottom - 40)),
            ...(scales.sx(hoverX) > width * 0.6 ? { right: width - scales.sx(hoverX) + 14 } : { left: scales.sx(hoverX) + 14 }),
          }}
        >
          <div className="hover-tip-title">{hoverTitle(hoverX)}</div>
          {hovered.map((row) => (
            <div key={row.series.key} className="hover-tip-row">
              <i className="swatch" style={{ background: row.series.color }} />
              {row.series.label}
              <b>{formatY(row.y)}</b>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// A bare line of values in order, stretched to its box; for trends inside table cells and cards.
export function Sparkline({ values, color, label }: { values: (number | null)[]; color: string; label: string }) {
  const present = values.filter((v) => v !== null);
  if (present.length < 2) return null;
  const lo = Math.min(...present);
  const span = Math.max(...present) - lo || 1;
  let d = '';
  let pen = false;
  values.forEach((value, i) => {
    if (value === null) {
      pen = false;
      return;
    }
    d += `${pen ? 'L' : 'M'}${((i / (values.length - 1)) * 100).toFixed(2)},${(26 - ((value - lo) / span) * 24).toFixed(2)}`;
    pen = true;
  });
  return (
    <svg className="sparkline" viewBox="0 0 100 28" preserveAspectRatio="none" role="img" aria-label={label}>
      <path d={d} style={{ stroke: color }} />
    </svg>
  );
}
