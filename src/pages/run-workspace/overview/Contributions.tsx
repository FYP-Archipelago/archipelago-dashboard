import { islandColor } from '@/colors.ts';
import { useSize } from '@/pages/run-workspace/charts/LineChart.tsx';

import OverviewCard from './OverviewCard.tsx';
import { listed, percent, sharesOf, type OverviewData, type Share } from './overview.ts';

import './contributions.css';

// `share` is the label; `weight` sets the area, and is the share unless the block was enlarged to fit its label.
type Cell = Share & { weight: number; x: number; y: number; w: number; h: number };

// Squarified treemap: rows run along the shorter side and grow while that keeps cells closer to square.
function squarify(items: (Share & { weight: number })[], width: number, height: number): Cell[] {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  const cells: Cell[] = [];
  let [x, y, w, h] = [0, 0, width, height];
  let rest = [...items].sort((a, b) => b.weight - a.weight).map((item) => ({ ...item, area: (item.weight / total) * width * height }));
  const worst = (row: typeof rest, side: number) => {
    const sum = row.reduce((s, item) => s + item.area, 0);
    return Math.max(...row.map((item) => Math.max((side * side * item.area) / (sum * sum), (sum * sum) / (side * side * item.area))));
  };
  while (rest.length) {
    const side = Math.min(w, h);
    let row = [rest[0]!];
    let i = 1;
    while (i < rest.length && worst([...row, rest[i]!], side) <= worst(row, side)) row = [...row, rest[i++]!];
    rest = rest.slice(i);
    const sum = row.reduce((s, item) => s + item.area, 0);
    const thickness = sum / side;
    let offset = 0;
    for (const item of row) {
      const length = item.area / thickness;
      cells.push(w >= h ? { ...item, x, y: y + offset, w: thickness, h: length } : { ...item, x: x + offset, y, w: length, h: thickness });
      offset += length;
    }
    if (w >= h) [x, w] = [x + thickness, w - thickness];
    else [y, h] = [y + thickness, h - thickness];
  }
  return cells;
}

let measure: CanvasRenderingContext2D | null = null;

// Width of a line of text in CSS pixels, in the page's font.
function textWidth(text: string, size: number, weight: number) {
  measure ??= document.createElement('canvas').getContext('2d');
  if (!measure) return text.length * size * 0.6;
  measure.font = `${weight} ${size}px 'Geist Variable', system-ui, sans-serif`;
  return measure.measureText(text).width;
}

// The roomiest label a block fits, all naming the island. 'none' only while the layout is still enlarging blocks.
type Layout = 'stacked' | 'line' | 'stacked-small' | 'none';

function labelLayout(cell: Cell): Layout {
  const share = percent(cell.share);
  const name = `Island ${cell.island}`;
  // Inside the padding: 10px a side; 8px top and bottom when stacked, a little less for one centred line.
  const width = cell.w - 22;
  const fits = (lines: [string, number, number][]) =>
    lines.every(([text, size, weight]) => textWidth(text, size, weight) <= width) &&
    lines.reduce((sum, [, size]) => sum + size * 1.25, 0) <= cell.h - (lines.length > 1 ? 18 : 4);
  if (
    fits([
      [share, 18, 650],
      [name, 12, 500],
    ])
  )
    return 'stacked';
  if (fits([[`${share} · ${name}`, 12, 650]])) return 'line';
  if (
    fits([
      [share, 13, 650],
      [name, 12, 500],
    ])
  )
    return 'stacked-small';
  return 'none';
}

// Blocks too small for any label get more area and the layout is redone until all fit; labels keep the true share.
function fittedTreemap(shares: Share[], width: number, height: number): Cell[] {
  const weights = new Map(shares.map((s) => [s.island, s.share]));
  let cells: Cell[] = [];
  for (let attempt = 0; attempt < 40; attempt++) {
    cells = squarify(
      shares.map((s) => ({ ...s, weight: weights.get(s.island)! })),
      width,
      height
    );
    const cramped = cells.filter((cell) => labelLayout(cell) === 'none');
    if (!cramped.length) break;
    const total = [...weights.values()].reduce((sum, value) => sum + value, 0);
    for (const cell of cramped) weights.set(cell.island, Math.max(weights.get(cell.island)!, total * 0.02) * 1.25);
  }
  return cells;
}

function CellLabel({ cell, layout }: { cell: Cell; layout: Layout }) {
  const share = percent(cell.share);
  if (layout === 'line')
    return (
      <span>
        <b>{share}</b> · Island {cell.island}
      </span>
    );
  return (
    <>
      <b>{share}</b>
      <span>Island {cell.island}</span>
    </>
  );
}

function Treemap({ shares }: { shares: Share[] }) {
  const [box, size] = useSize();
  const positive = shares.filter((s) => s.share > 0);
  // Fills the card's height, so a card stretched beside the network has no empty space.
  const cells = size.width && size.height ? fittedTreemap(positive, size.width, size.height) : [];
  const negative = shares.filter((s) => s.share <= 0);
  return (
    <>
      <div ref={box} className="treemap">
        {cells.map((cell, i) => {
          const layout = labelLayout(cell);
          return (
            <div
              key={cell.island}
              className={`treemap-cell treemap-${layout}`}
              style={{
                left: cell.x,
                top: cell.y,
                width: cell.w,
                height: cell.h,
                background: islandColor(cell.island),
                animationDelay: `${i * 0.06}s`,
              }}
              title={`Island ${cell.island} · ${percent(cell.share)}`}
            >
              <CellLabel cell={cell} layout={layout} />
            </div>
          );
        })}
      </div>
      <p className="hint">
        Each block is an island&apos;s Shapley share of the improvement.
        {negative.length > 0 && ` ${listed(negative.map((s) => `Island ${s.island}`))} earned none.`}
      </p>
    </>
  );
}

export default function Contributions({ data }: { data: OverviewData }) {
  const shapley = data.shapley;
  const shares = shapley ? sharesOf(shapley.islands) : [];
  return (
    <OverviewCard title="Island contributions" runId={data.run.run_id} tab="attribution">
      {!shapley ? (
        <p className="overview-headline muted">
          {data.result.explainability.shapley.status === 'unavailable' ? data.result.explainability.shapley.detail : 'No attribution for this run.'}
        </p>
      ) : (
        <Treemap shares={shares} />
      )}
    </OverviewCard>
  );
}
