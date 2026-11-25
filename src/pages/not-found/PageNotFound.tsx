import { islandColor } from '@/colors.ts';
import Link from '@/components/Link.tsx';
import { seeded, type Point } from '@/drawing.ts';
import { runsHref } from '@/route.ts';
import { vars } from '@/style.ts';

import './page-not-found.css';

// "404" drawn as the network view draws a run: each 4 an island's cluster of search points joined by its search paths,
// the 0 an island with nothing in it. Migrants sent to the 0 find nothing and vanish.
function IslandCode() {
  const four = ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'];
  const zero = ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'];
  const cell = 22;
  const random = seeded('404');
  const digits = [four, zero, four].map((rows, d) => {
    const left = 20 + d * 150;
    const dots = rows.flatMap((row, y) =>
      [...row].flatMap((on, x) =>
        on === '#' ? [{ x, y, at: [left + x * cell + (random() - 0.5) * 6, 20 + y * cell + (random() - 0.5) * 6] as Point }] : []
      )
    );
    const edges = dots.flatMap((a) =>
      dots.filter((b) => (b.x === a.x + 1 && b.y === a.y) || (b.y === a.y + 1 && Math.abs(b.x - a.x) <= 1)).map((b) => [a.at, b.at] as const)
    );
    return { dots, edges, colour: islandColor(d === 0 ? 0 : 1) };
  });
  const [left, empty, right] = digits;
  const centre: Point = [20 + 150 + 2 * cell, 20 + 3 * cell];
  const arc = (from: Point) => `M${from[0]},${from[1]} Q${(from[0] + centre[0]) / 2},${Math.min(from[1], centre[1]) - 70} ${centre[0]},${centre[1]}`;
  const migrations = [arc(left!.dots[4]!.at), arc(right!.dots[1]!.at)];
  return (
    <svg className="island-code" viewBox="0 0 450 200" aria-hidden="true">
      {migrations.map((path, i) => (
        <path key={i} className="island-code-migration" d={path} />
      ))}
      {[left!, right!].map(({ edges, colour }, d) =>
        edges.map(([a, b], i) => <line key={`${d}-${i}`} className="island-code-edge" x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={colour} />)
      )}
      {[left!, right!].map(({ dots, colour }, d) => dots.map(({ at }, i) => <circle key={`${d}-${i}`} cx={at[0]} cy={at[1]} r={5} fill={colour} />))}
      {empty!.dots.map(({ at }, i) => (
        <circle key={i} className="island-code-empty" cx={at[0]} cy={at[1]} r={5} style={vars({ '--d': `${i * 0.12}s` })} />
      ))}
      {migrations.map((path, i) => (
        <circle key={i} className="island-code-migrant" r={3.5} style={vars({ offsetPath: `path("${path}")`, '--d': `${i * -1.3}s` })} />
      ))}
    </svg>
  );
}

export default function PageNotFound() {
  return (
    <div className="page">
      <div className="not-found">
        <IslandCode />
        <h1>Oooh, this page is off the map</h1>
        <div className="not-found-actions">
          <Link className="button button-primary" href={runsHref}>
            Back to Runs
          </Link>
        </div>
      </div>
    </div>
  );
}
