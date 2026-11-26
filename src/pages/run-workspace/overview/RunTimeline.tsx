import { useMemo, useState, type CSSProperties, type PointerEvent } from 'react';

import { islandColor } from '@/colors.ts';
import { compactNumber, fitness, numberFormat } from '@/format.ts';
import { maxOf } from '@/math.ts';
import { niceTicks, useSize } from '@/pages/run-workspace/charts/LineChart.tsx';
import { IslandSwatch } from '@/pages/run-workspace/shared.tsx';
import { REASONS, stopText } from '@/pages/run-workspace/stops.ts';
import type { IslandBest, IslandEnd, TerminationReason } from '@/types.ts';

import OverviewCard from './OverviewCard.tsx';
import { crossing, laneOf, type Axis, type Improvement, type Lane, type OverviewData } from './overview.ts';

import './run-timeline.css';

// Layout: label column, progress band, then one lane per island.
const LABEL = 96;
const RIGHT = 16;
const TOP = 26;
const BAND = 64;
const GAP = 22;
const LANE = 28;
const AXIS = 40;

// Where the run had made half, 90% and 99% of its improvement.
const NOTCHES = [0.5, 0.9, 0.99];

const tickFormat = new Intl.NumberFormat('en', { notation: 'compact', maximumSignificantDigits: 3 });
const share = (value: number) => `${value > 0.99 && value < 1 ? (value * 100).toFixed(1) : Math.round(value * 100)}%`;

// The island's stop, drawn like the Details budget track's markers.
function StopGlyph({ reason, color }: { reason: TerminationReason | null; color: string }) {
  if (reason === null) return <circle r={5} fill="var(--surface)" stroke={color} strokeWidth={1.5} strokeDasharray="2 2" />;
  switch (REASONS[reason].marker) {
    case 'budget-marker-hollow':
      return <circle r={4.6} fill="var(--surface)" stroke={color} strokeWidth={2.2} />;
    case 'budget-marker-square':
      return <rect x={-5} y={-5} width={10} height={10} rx={2} fill={color} />;
    case 'budget-marker-target':
      return (
        <>
          <circle r={5.2} fill="var(--surface)" stroke={color} strokeWidth={1.6} />
          <circle r={2} fill={color} />
        </>
      );
    case 'budget-marker-halted':
      return (
        <>
          <circle r={5.5} fill={color} />
          <path d="M-2.6,-2.6L2.6,2.6M-2.6,2.6L2.6,-2.6" stroke="var(--surface)" strokeWidth={1.6} />
        </>
      );
    default:
      return <circle r={5.5} fill={color} />;
  }
}

const KEY_TEXT: Record<string, string> = {
  'budget-marker-hollow': 'Stagnated',
  'budget-marker-filled': 'Spent its budget',
  'budget-marker-square': 'Hit the generation cap',
  'budget-marker-target': 'Reached the target',
  'budget-marker-halted': 'Cut short',
  missing: 'No end recorded',
};

type Hover = { kind: 'lane'; island: number } | { kind: 'band'; index: number };

function LaneTip({ lane, best, end, axis, style }: { lane: Lane; best?: IslandBest; end?: IslandEnd; axis: Axis; style: CSSProperties }) {
  return (
    <div className="hover-tip run-timeline-tip" style={style}>
      <div className="hover-tip-title">
        <IslandSwatch island={lane.island} /> Island {lane.island}
      </div>
      <div className="hover-tip-row">
        Final best<b>{fitness(best?.fitness ?? null)}</b>
      </div>
      <div className="hover-tip-row">
        Improvements<b>{numberFormat.format(lane.steps.length)}</b>
      </div>
      <div className="hover-tip-row">
        Last improved
        <b>
          {lane.lastImproved === null
            ? 'Never'
            : axis === 'evaluations'
              ? `${compactNumber.format(lane.lastImproved)} evals`
              : `gen ${lane.lastImproved}`}
        </b>
      </div>
      <div className="hover-tip-row">
        Stopped<b>{end ? stopText(end) : 'No end recorded'}</b>
      </div>
    </div>
  );
}

// On top, the run's share of its improvement so far. Below, a lane per island: a tick per improving step (taller for
// bigger ones), dashed after its last, and a marker for why it stopped.
function Timeline({ data, improvement }: { data: OverviewData; improvement: Improvement }) {
  const { histories, axis, curve } = data;
  const ends = data.result.island_ends;
  const best = data.best && data.bestX !== null ? { island: data.best.island_id, x: data.bestX } : null;
  const [ref, size] = useSize();
  const [hover, setHover] = useState<Hover | null>(null);
  const lanes = useMemo(() => histories.flatMap((history) => laneOf(history, axis, improvement) ?? []), [histories, axis, improvement]);
  const endOf = (island: number) => ends.find((end) => end.island_id === island);

  const width = size.width;
  const height = TOP + BAND + GAP + lanes.length * LANE + AXIS;
  const x0 = Math.min(...lanes.map((lane) => lane.start));
  const x1 = Math.max(...lanes.map((lane) => lane.end));
  const plotRight = width - RIGHT;
  const sx = (x: number) => LABEL + ((x - x0) / (x1 - x0 || 1)) * (plotRight - LABEL);
  const sy = (value: number) => TOP + (1 - Math.max(0, Math.min(1, value))) * BAND;
  const laneY = (index: number) => TOP + BAND + GAP + index * LANE + LANE / 2;
  const lanesBottom = TOP + BAND + GAP + lanes.length * LANE;
  const biggest = maxOf(
    lanes.flatMap((lane) => lane.steps.map((step) => step.size)),
    1e-12
  );
  const tickHalf = (size: number) => 2 + 9 * Math.sqrt(size / biggest);
  const formatX = (x: number) => (axis === 'evaluations' ? `${numberFormat.format(x)} evaluations` : `Generation ${x}`);

  // Notches on the same x keep the strictest; labels too close together are joined.
  const notches = NOTCHES.flatMap((level) => {
    const x = crossing(curve, level);
    return x === null ? [] : [{ level, x, share: curve.find((point) => point.x === x)!.share }];
  }).filter((notch, i, all) => all[i + 1]?.x !== notch.x);
  const labels: { x: number; text: string }[] = [];
  for (const notch of notches) {
    const previous = labels.at(-1);
    if (previous && sx(notch.x) - previous.x < 44) previous.text += ` · ${share(notch.level)}`;
    else labels.push({ x: sx(notch.x), text: share(notch.level) });
  }

  let band = '';
  curve.forEach((point, i) => (band += i === 0 ? `M${sx(point.x)},${sy(point.share)}` : `H${sx(point.x)}V${sy(point.share)}`));
  band += `H${sx(x1)}`;
  const area = curve.length ? `${band}V${sy(0)}H${sx(curve[0]!.x)}Z` : '';

  const onBandMove = (event: PointerEvent<SVGRectElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const x = x0 + ((event.clientX - box.left) / box.width) * (x1 - x0);
    let index = 0;
    while (index + 1 < curve.length && curve[index + 1]!.x <= x) index++;
    setHover({ kind: 'band', index });
  };

  const hoveredLane = hover?.kind === 'lane' ? lanes.findIndex((lane) => lane.island === hover.island) : -1;
  const hoveredPoint = hover?.kind === 'band' ? curve[hover.index] : undefined;
  const dim = (island: number) => (hover?.kind === 'lane' && hover.island !== island ? 0.2 : 1);
  // One key entry per marker shape in use.
  const stopKeys = new Map<string, TerminationReason | null>();
  for (const lane of lanes) {
    const reason = endOf(lane.island)?.termination_reason ?? null;
    const marker = reason === null ? 'missing' : REASONS[reason].marker;
    if (!stopKeys.has(marker)) stopKeys.set(marker, reason);
  }

  return (
    <>
      <div ref={ref} className="run-timeline" style={{ height }}>
        {width > 0 && lanes.length > 0 && (
          <svg width={width} height={height} role="img" aria-label="Improvement over the run, overall and per island">
            <g className="run-timeline-grid">
              {niceTicks(x0, x1, Math.max(3, Math.floor((plotRight - LABEL) / 110))).map((tick) => (
                <g key={tick}>
                  <line x1={sx(tick)} x2={sx(tick)} y1={TOP} y2={lanesBottom} />
                  <text x={sx(tick)} y={lanesBottom + 18} textAnchor="middle">
                    {tickFormat.format(tick)}
                  </text>
                </g>
              ))}
              <text x={plotRight} y={height - 2} textAnchor="end">
                {axis === 'evaluations' ? 'Evaluations (per island)' : 'Generation'}
              </text>
              <line className="run-timeline-ceiling" x1={LABEL} x2={plotRight} y1={sy(1)} y2={sy(1)} />
              <text x={LABEL - 12} y={sy(1)} textAnchor="end" dominantBaseline="middle">
                100%
              </text>
              <text x={LABEL - 12} y={sy(0)} textAnchor="end" dominantBaseline="middle">
                0%
              </text>
            </g>

            <g className="run-timeline-notches">
              {notches.map((notch) => (
                <line key={notch.level} x1={sx(notch.x)} x2={sx(notch.x)} y1={sy(notch.share)} y2={lanesBottom} />
              ))}
              {labels.map((label) => (
                <text key={label.text} x={Math.max(LABEL + 14, Math.min(label.x, plotRight - 30))} y={TOP - 12} textAnchor="middle">
                  {label.text}
                </text>
              ))}
            </g>

            <g className="run-timeline-band">
              <defs>
                <linearGradient id="run-timeline-fill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0" stopColor="#ededed" stopOpacity={0.2} />
                  <stop offset="1" stopColor="#ededed" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <path className="run-timeline-area" d={area} fill="url(#run-timeline-fill)" />
              <path className="run-timeline-curve" d={band} pathLength={1} />
              {notches.map((notch) => (
                <circle key={notch.level} className="run-timeline-notch-dot" cx={sx(notch.x)} cy={sy(notch.share)} r={3.5} />
              ))}
            </g>

            {lanes.map((lane, index) => {
              const color = islandColor(lane.island);
              const y = laneY(index);
              const turn = sx(lane.lastImproved ?? lane.start);
              const end = endOf(lane.island);
              return (
                <g key={lane.island} className="run-timeline-lane" opacity={dim(lane.island)} style={{ animationDelay: `${0.15 + index * 0.06}s` }}>
                  <circle cx={8} cy={y} r={4} fill={color} />
                  <text className="run-timeline-label" x={18} y={y} dominantBaseline="middle">
                    Island {lane.island}
                  </text>
                  <line x1={sx(lane.start)} x2={turn} y1={y} y2={y} stroke={color} strokeOpacity={0.55} strokeWidth={1.5} />
                  <line x1={turn} x2={sx(lane.end)} y1={y} y2={y} stroke={color} strokeOpacity={0.45} strokeWidth={1.5} strokeDasharray="3 4" />
                  <path
                    d={lane.steps
                      .map((step) => `M${sx(step.x).toFixed(1)},${(y - tickHalf(step.size)).toFixed(1)}V${(y + tickHalf(step.size)).toFixed(1)}`)
                      .join('')}
                    stroke={color}
                    strokeWidth={1.5}
                  />
                  <g transform={`translate(${sx(lane.end)},${y})`}>
                    <StopGlyph reason={end?.termination_reason ?? null} color={color} />
                  </g>
                </g>
              );
            })}
            {best && lanes.some((lane) => lane.island === best.island) && (
              <path
                className="run-timeline-best"
                d={`M0,-6.5L6.5,0L0,6.5L-6.5,0Z`}
                transform={`translate(${sx(best.x)},${laneY(lanes.findIndex((lane) => lane.island === best.island))})`}
                opacity={dim(best.island)}
              />
            )}

            {hoveredPoint && (
              <g className="run-timeline-hover">
                <line x1={sx(hoveredPoint.x)} x2={sx(hoveredPoint.x)} y1={TOP} y2={lanesBottom} />
                <circle cx={sx(hoveredPoint.x)} cy={sy(hoveredPoint.share)} r={4} />
              </g>
            )}
            <rect
              x={LABEL}
              y={TOP - 4}
              width={Math.max(0, plotRight - LABEL)}
              height={BAND + 8}
              fill="transparent"
              onPointerMove={onBandMove}
              onPointerLeave={() => setHover(null)}
            />
            {lanes.map((lane, index) => (
              <rect
                key={lane.island}
                x={0}
                y={laneY(index) - LANE / 2}
                width={width}
                height={LANE}
                fill="transparent"
                onPointerEnter={() => setHover({ kind: 'lane', island: lane.island })}
                onPointerLeave={() => setHover(null)}
              />
            ))}
          </svg>
        )}
        {hoveredPoint && (
          <div
            className="hover-tip"
            style={{
              top: TOP,
              ...(sx(hoveredPoint.x) > width * 0.6 ? { right: width - sx(hoveredPoint.x) + 14 } : { left: sx(hoveredPoint.x) + 14 }),
            }}
          >
            <div className="hover-tip-title">By {formatX(hoveredPoint.x)}</div>
            <div className="hover-tip-row">
              Improvement made
              <b>{share(hoveredPoint.share)}</b>
            </div>
          </div>
        )}
        {hoveredLane >= 0 && (
          <LaneTip
            lane={lanes[hoveredLane]!}
            best={data.bests.find((best) => best.island_id === lanes[hoveredLane]!.island)}
            end={endOf(lanes[hoveredLane]!.island)}
            axis={axis}
            style={{
              left: LABEL,
              ...(hoveredLane > lanes.length / 2
                ? { bottom: height - laneY(hoveredLane) + LANE / 2 + 4 }
                : { top: laneY(hoveredLane) + LANE / 2 + 4 }),
            }}
          />
        )}
      </div>
      <div className="run-timeline-keys">
        <span className="run-timeline-key">
          <svg width="14" height="14" aria-hidden="true">
            <path d="M3,4V10M7,1V13M11,5V9" />
          </svg>
          An island improved its best; taller ticks gained more
        </span>
        <span className="run-timeline-key">
          <svg width="18" height="14" aria-hidden="true">
            <path d="M0,7H18" strokeDasharray="3 4" />
          </svg>
          No improvement after the last tick
        </span>
        {best && (
          <span className="run-timeline-key">
            <svg width="14" height="14" aria-hidden="true">
              <path className="run-timeline-best" d="M7,1.5L12.5,7L7,12.5L1.5,7Z" />
            </svg>
            Run best first reached
          </span>
        )}
        {[...stopKeys].map(([marker, reason]) => (
          <span key={marker} className="run-timeline-key">
            <svg width="14" height="14" aria-hidden="true">
              <g transform="translate(7,7)">
                <StopGlyph reason={reason} color="var(--ink-2)" />
              </g>
            </svg>
            {KEY_TEXT[marker]}
          </span>
        ))}
      </div>
    </>
  );
}

export default function RunTimeline({ data }: { data: OverviewData }) {
  const { improvement } = data;
  if (!improvement || !data.histories.length) return null;
  return (
    <OverviewCard
      title="Run timeline"
      subtitle="Improvement made by the run, and where each island improved"
      runId={data.run.run_id}
      tab="convergence"
    >
      <Timeline data={data} improvement={improvement} />
    </OverviewCard>
  );
}
