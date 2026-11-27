import { useMemo, useState, type PointerEvent } from 'react';

import { numberFormat } from '@/format.ts';
import { arrivalsOf } from '@/pages/run-workspace/migration/migration.ts';
import { IslandSwatch } from '@/pages/run-workspace/shared.tsx';

import OverviewCard from './OverviewCard.tsx';
import { percent, type OverviewData } from './overview.ts';

import './migration.css';

type Kind = 'lift' | 'same' | 'behind';

const KINDS: { kind: Kind; label: string }[] = [
  { kind: 'lift', label: 'From a better region' },
  { kind: 'same', label: 'Same' },
  { kind: 'behind', label: 'Into a better region' },
];

// Each arrival compares the best of the cluster migrants left with the one they landed in, as migrants from a better region can lift the island they join.
// A 100-square waffle shows all migrants, and a bar per island splits them.
// Hovering an island's row shows its migrants, and the island most of them came from, above the rows.
export default function Migration({ data }: { data: OverviewData }) {
  const [focusIsland, setFocusIsland] = useState<number | null>(null);
  const maximising = data.result.run.maximising;
  const arrivals = useMemo(() => arrivalsOf(data.result.graph), [data]);
  const kindOf = (from: number | null, to: number | null): Kind => {
    if (from === null || to === null || from === to) return 'same';
    return (maximising ? from > to : from < to) ? 'lift' : 'behind';
  };
  const totals: Record<Kind, number> = { lift: 0, same: 0, behind: 0 };
  const byIsland = new Map<number, Record<Kind, number>>();
  // Migrants into each island by the island they came from.
  const sources = new Map<number, Map<number, number>>();
  for (const arrival of arrivals) {
    const kind = kindOf(arrival.fromBest, arrival.toBest);
    totals[kind] += arrival.migrants;
    const island = byIsland.get(arrival.toIsland) ?? { lift: 0, same: 0, behind: 0 };
    island[kind] += arrival.migrants;
    byIsland.set(arrival.toIsland, island);
    const from = sources.get(arrival.toIsland) ?? new Map<number, number>();
    from.set(arrival.fromIsland, (from.get(arrival.fromIsland) ?? 0) + arrival.migrants);
    sources.set(arrival.toIsland, from);
  }
  const all = totals.lift + totals.same + totals.behind;
  // Squares per kind, rounded so they add up to 100.
  const lift = Math.round((totals.lift / (all || 1)) * 100);
  const behind = Math.round((totals.behind / (all || 1)) * 100);
  const cells: Kind[] = [
    ...Array<Kind>(lift).fill('lift'),
    ...Array<Kind>(Math.max(0, 100 - lift - behind)).fill('same'),
    ...Array<Kind>(behind).fill('behind'),
  ];
  const focused = focusIsland === null ? undefined : byIsland.get(focusIsland);
  const mainSource = focusIsland === null ? undefined : [...sources.get(focusIsland)!].reduce((top, entry) => (entry[1] > top[1] ? entry : top));
  // The row under the pointer, read on the rows as a whole so the gaps between them keep it instead of clearing it.
  const onRows = (event: PointerEvent) => {
    const island = (event.target as HTMLElement).closest<HTMLElement>('[data-island]')?.dataset.island;
    if (island !== undefined) setFocusIsland(Number(island));
  };

  return (
    <OverviewCard title="Migration" runId={data.run.run_id} tab="migration">
      {!all ? (
        <p className="hint">No migrant arrivals were clustered.</p>
      ) : (
        <>
          <p className="overview-headline">
            <b>{percent(totals.lift / all)}</b> of migrants came from better regions and could help their new island.{' '}
            <b>{percent(totals.behind / all)}</b> landed where the search was already ahead.*
          </p>
          <div className="arrivals">
            <div className="arrivals-waffle" role="img" aria-label="Where migrants landed, compared with where they left">
              {cells.map((kind, i) => (
                <i key={i} className={`arrivals-${kind}`} style={{ animationDelay: `${i * 6}ms` }} />
              ))}
            </div>
            <div className="arrivals-islands" onPointerMove={onRows} onPointerLeave={() => setFocusIsland(null)}>
              <span className="arrivals-islands-head">
                {focused && mainSource ? (
                  <>
                    <b>Island {focusIsland}</b> · {numberFormat.format(focused.lift + focused.same + focused.behind)} migrants · mostly from Island{' '}
                    {mainSource[0]} ({numberFormat.format(mainSource[1])})
                  </>
                ) : (
                  'Into each island'
                )}
              </span>
              {[...byIsland]
                .sort((a, b) => a[0] - b[0])
                .map(([island, counts]) => {
                  const total = counts.lift + counts.same + counts.behind;
                  return (
                    <div
                      key={island}
                      data-island={island}
                      className={`arrivals-row${focusIsland !== null && focusIsland !== island ? ' arrivals-dim' : ''}`}
                    >
                      <span>
                        <IslandSwatch island={island} />
                        {island}
                      </span>
                      <div className="arrivals-bar">
                        {KINDS.map(({ kind }) => (
                          <i key={kind} className={`arrivals-${kind}`} style={{ flexGrow: counts[kind] }} />
                        ))}
                      </div>
                      <small>{percent(counts.lift / total)}</small>
                    </div>
                  );
                })}
            </div>
          </div>
          <div className="overview-legend">
            {KINDS.map(({ kind, label }) => (
              <span key={kind}>
                <i className={`overview-key arrivals-${kind}`} />
                {label}
              </span>
            ))}
          </div>
          <p className="hint arrivals-note">* Compares cluster bests only</p>
        </>
      )}
    </OverviewCard>
  );
}
