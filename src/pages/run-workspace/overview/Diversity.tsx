import { useMemo, useState } from 'react';

import { niceTicks, useSize } from '@/pages/run-workspace/charts/LineChart.tsx';
import { describeDiversity } from '@/pages/run-workspace/convergence/convergence.ts';
import { meanOf, REAL_DIFFERENCE, wholeRunPairs, windowValues } from '@/pages/run-workspace/divergence/divergence.ts';

import OverviewCard from './OverviewCard.tsx';
import { capitalise, meanDiversity, percent, plural, type OverviewData } from './overview.ts';

import './diversity.css';

function useDiversity({ histories, result }: OverviewData) {
  const within = useMemo(() => meanDiversity(histories), [histories]);
  const separation = result.separation;
  const between = useMemo(
    () =>
      windowValues(separation).flatMap((values, i) => {
        const value = meanOf(values);
        return value === null ? [] : [{ generation: separation.windows.from_generation[i]!, value }];
      }),
    [separation]
  );
  const pairs = useMemo(() => wholeRunPairs(separation), [separation]);
  return { within, between, pairs };
}

function Headline({ within, pairs }: ReturnType<typeof useDiversity>) {
  const [first, last] = [within[0]?.value, within.at(-1)?.value];
  const change = first && last !== undefined ? (last - first) / first : null;
  const real = pairs.filter((pair) => pair.p < REAL_DIFFERENCE).length;
  const parts = [
    change === null
      ? null
      : change <= -0.05
        ? `populations lost ${percent(-change)} of their diversity`
        : change >= 0.05
          ? `populations grew ${percent(change)} more varied`
          : 'population diversity held steady',
    pairs.length
      ? `${real} of ${plural(pairs.length, 'island pair')} showed a clear difference in the areas of the search space they explored`
      : null,
  ].filter(Boolean);
  return parts.length ? <p className="overview-headline">{capitalise(parts.join(', and '))}.</p> : null;
}

// Diversity within islands and divergence between them, each as a share of its own peak.
function Trends({ within, between, metric }: ReturnType<typeof useDiversity> & { metric: string | null }) {
  const [box, size] = useSize();
  const [hoverX, setHoverX] = useState<number | null>(null);
  const height = 220;
  const pad = { left: 40, right: 16, top: 12, bottom: 24 };
  const lines = [
    { key: 'within', label: 'Within islands', note: metric ?? 'Mean diversity', points: within, color: 'var(--ink)' },
    { key: 'between', label: 'Between islands', note: 'Mean divergence of island pairs', points: between, color: '#fbbf24' },
  ]
    .filter((line) => line.points.length > 1)
    .map((line) => {
      const peak = Math.max(...line.points.map((point) => point.value)) || 1;
      return { ...line, relative: line.points.map((point) => ({ x: point.generation, y: point.value / peak })) };
    });
  if (!lines.length) return <p className="hint">This run logged no diversity.</p>;
  const x1 = Math.max(...lines.flatMap((line) => line.relative.map((point) => point.x))) || 1;
  const plotWidth = size.width - pad.left - pad.right;
  const sx = (x: number) => pad.left + (x / x1) * plotWidth;
  const sy = (y: number) => pad.top + (1 - y) * (height - pad.top - pad.bottom);
  // The point of a line at or just before a generation.
  const at = (line: (typeof lines)[number], x: number) => [...line.relative].reverse().find((point) => point.x <= x) ?? line.relative[0]!;
  return (
    <>
      <div ref={box} className="diversity-trends" style={{ height }}>
        {size.width > 0 && (
          <svg width={size.width} height={height} role="img" aria-label="Diversity within and between islands, as a share of each one's peak">
            {[0, 0.5, 1].map((tick) => (
              <g key={tick} className="diversity-grid">
                <line x1={pad.left} x2={size.width - pad.right} y1={sy(tick)} y2={sy(tick)} />
                <text x={pad.left - 8} y={sy(tick)} textAnchor="end" dominantBaseline="middle">
                  {tick * 100}%
                </text>
              </g>
            ))}
            {niceTicks(0, x1, Math.max(3, Math.floor(plotWidth / 120))).map((tick) => (
              <text key={tick} className="diversity-axis" x={sx(tick)} y={height - 6} textAnchor="middle">
                {tick}
              </text>
            ))}
            {lines.map((line) => (
              <path
                key={line.key}
                className="diversity-line"
                pathLength={1}
                d={line.relative.map((point, i) => `${i ? 'L' : 'M'}${sx(point.x).toFixed(1)},${sy(point.y).toFixed(1)}`).join('')}
                stroke={line.color}
              />
            ))}
            {hoverX !== null && (
              <g className="diversity-hover">
                <line x1={sx(hoverX)} x2={sx(hoverX)} y1={pad.top} y2={height - pad.bottom} />
                {lines.map((line) => (
                  <circle key={line.key} cx={sx(at(line, hoverX).x)} cy={sy(at(line, hoverX).y)} r={4} fill={line.color} />
                ))}
              </g>
            )}
            <rect
              x={pad.left}
              y={pad.top}
              width={Math.max(0, plotWidth)}
              height={height - pad.top - pad.bottom}
              fill="transparent"
              onPointerMove={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                setHoverX(Math.round(((event.clientX - rect.left) / rect.width) * x1));
              }}
              onPointerLeave={() => setHoverX(null)}
            />
          </svg>
        )}
        {hoverX !== null && (
          <div
            className="hover-tip diversity-tip"
            style={sx(hoverX) > size.width * 0.6 ? { right: size.width - sx(hoverX) + 14 } : { left: sx(hoverX) + 14 }}
          >
            <div className="hover-tip-title">Generation {hoverX}</div>
            {lines.map((line) => (
              <div key={line.key} className="hover-tip-row">
                <i className="swatch" style={{ background: line.color }} />
                {line.label}
                <b>{percent(at(line, hoverX).y)}</b>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="diversity-keys">
        {lines.map((line) => (
          <span key={line.key}>
            <i style={{ background: line.color }} />
            <b>{line.label}</b>
            <span>
              <span className="muted">{line.note}</span> ends at <b>{percent(line.relative.at(-1)!.y)}</b> of its peak
            </span>
          </span>
        ))}
      </div>
    </>
  );
}

export default function Diversity({ data }: { data: OverviewData }) {
  const diversity = useDiversity(data);
  return (
    <OverviewCard title="Diversity" runId={data.run.run_id} tab="divergence">
      <Headline {...diversity} />
      <Trends {...diversity} metric={describeDiversity(data.result.generation_history)} />
    </OverviewCard>
  );
}
