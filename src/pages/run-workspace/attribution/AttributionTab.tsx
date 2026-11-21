import { useMemo, useState } from 'react';

import { islandColor } from '@/colors.ts';
import Icon from '@/components/Icon.tsx';
import { fitness, numberFormat } from '@/format.ts';
import { EmptyState, NoResult, type ResultQuery } from '@/pages/run-workspace/shared.tsx';
import type { Player, Run, ShapleyAttribution, ShapleyGame } from '@/types.ts';

import { waterfallSlots } from './attribution.ts';

import './attribution.css';

type View = 'islands' | 'routes';

const playerKey = (player: Player) => (Array.isArray(player) ? player.join('-') : String(player));
const playerName = (player: Player) => (Array.isArray(player) ? `${player[0]} → ${player[1]}` : `Island ${player}`);
const playerColor = (player: Player) => islandColor(Array.isArray(player) ? player[0] : player);
// Credit sits next to its share, so four significant digits are plenty.
const creditFormat = new Intl.NumberFormat('en', { maximumSignificantDigits: 4 });
// Very small credits (fitness near zero, as in symbolic regression) switch to e-notation instead of long decimals.
const credit = (value: number) => (value !== 0 && Math.abs(value) < 1e-3 ? value.toExponential(2) : creditFormat.format(value));

const percent = (share: number) => {
  if (share !== 0 && Math.abs(share) < 0.001) return share > 0 ? '<0.1%' : '>−0.1%';
  return `${Math.abs(share) < 0.1 && share !== 0 ? (share * 100).toFixed(1) : Math.round(share * 100)}%`;
};

function Swatch({ player }: { player: Player }) {
  return Array.isArray(player) ? (
    <span className="player-route">
      <i className="swatch" style={{ background: islandColor(player[0]) }} />
      <i className="swatch" style={{ background: islandColor(player[1]) }} />
    </span>
  ) : (
    <i className="swatch" style={{ background: islandColor(player) }} />
  );
}

// The run's improvement as a bar from its starting best to its final best. For routes, the part the islands reached
// without any migration is set apart, since only the rest is shared between the routes.
function Shared({ shapley, game, view, maximising }: { shapley: ShapleyAttribution; game: ShapleyGame; view: View; maximising: boolean }) {
  const shared = game.full_value - game.empty_value;
  const alone = view === 'routes' ? game.empty_value / game.full_value || 0 : 0;
  const coverage = shapley.coverage.evaluations ? shapley.coverage.supported / shapley.coverage.evaluations : 0;
  return (
    <section className="card shared">
      <div className="shared-ends">
        <div>
          <span className="muted">Best at the start</span>
          <strong>{fitness(shapley.baseline_fitness)}</strong>
        </div>
        <span className="shared-arrow">
          <Icon name="arrowR" size={18} />
          <small>{maximising ? 'higher is better' : 'lower is better'}</small>
        </span>
        <div className="r">
          <span className="muted">Best at the end</span>
          <strong>{fitness(shapley.observed_best_fitness)}</strong>
        </div>
      </div>
      <div className="shared-bar" role="img" aria-label={`Improvement of ${fitness(game.full_value)}`}>
        {alone > 0 && <i className="alone" style={{ width: `${alone * 100}%` }} />}
        <i className="credited" style={{ width: `${(1 - alone) * 100}%` }} />
      </div>
      <div className="shared-caption">
        <p className="shared-text">
          {view === 'islands' ? (
            <>
              An improvement of <b>{fitness(game.full_value)}</b>, shared between the islands below.
            </>
          ) : (
            <>
              Of the <b>{fitness(game.full_value)}</b> improvement, <span className="alone-key">{fitness(game.empty_value)}</span> was reachable with
              no migration. The other <b className="credited-key">{fitness(shared)}</b> ({percent(shared / game.full_value || 0)}) needed migrants.
            </>
          )}
        </p>
        <p className="shared-coverage">
          Ancestry coverage {percent(coverage)}
          {shapley.supported_best_fitness !== shapley.observed_best_fitness &&
            ` · Used the best fitness (${fitness(shapley.supported_best_fitness)}) with full ancestry coverage.`}
        </p>
      </div>
      {shapley.warnings.length > 0 && (
        <ul className="shared-warnings">
          {shapley.warnings.map((warning, i) => (
            <li key={i}>{warning}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

// Ranked credit per player, as bars from a zero line, so negative credit reads as pulling the other way.
function Credit({ game, view }: { game: ShapleyGame; view: View }) {
  const shared = game.full_value - game.empty_value;
  const players = [...game.players].sort((a, b) => b.value - a.value);
  const values = players.map((p) => p.value);
  const lo = Math.min(0, ...values);
  const span = Math.max(...values, 0) - lo || 1;
  const at = (v: number) => ((v - lo) / span) * 100;
  const [first, second] = players;
  return (
    <section className="card">
      <div className="card-head card-heading">
        <h3>{view === 'islands' ? 'Credit per island' : 'Credit per route'}</h3>
        <span className="muted">Shapley value, as a share of the shared improvement</span>
      </div>
      {first && (
        <p className="credit-headline">
          <b>{playerName(first.player)}</b> holds the largest share, <b>{percent(first.value / shared || 0)}</b>
          {second && (
            <>
              , followed by <b>{playerName(second.player)}</b> at {percent(second.value / shared || 0)}
            </>
          )}
          .
        </p>
      )}
      <div className="credit-bars">
        {players.map(({ player, value, standard_error: error }) => (
          <div key={playerKey(player)} className="credit-row">
            <span className="credit-name">
              <Swatch player={player} />
              {playerName(player)}
            </span>
            <span className="credit-track">
              {lo < 0 && <i className="credit-zero" style={{ left: `${at(0)}%` }} />}
              <i
                className="credit-fill"
                style={{ left: `${Math.min(at(0), at(value))}%`, width: `${Math.abs(at(value) - at(0))}%`, background: playerColor(player) }}
              />
            </span>
            <span className="credit-value">
              <b>{percent(value / shared || 0)}</b>
              <small>
                {credit(value)}
                {error !== null && ` ± ${credit(error)}`}
              </small>
            </span>
          </div>
        ))}
      </div>
      <p className="hint">
        {view === 'islands'
          ? 'An improvement counts for a coalition only if every island in its ancestry is a member.'
          : 'An improvement counts for a coalition only if every route its ancestry crossed is a member.'}{' '}
        Island and route values come from separate games, so they do not add.
      </p>
    </section>
  );
}

const coalitionKey = (keys: Iterable<string>) => [...keys].sort().join('|');

// The improvement a chosen subset of players reaches on its own. Each chip shows that player's marginal contribution to
// the current coalition: what adding it (or removing it) changes. Route coalitions often move only when routes combine.
function Coalitions({ game, view }: { game: ShapleyGame; view: View }) {
  const players = [...game.players].sort((a, b) => b.value - a.value);
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set(players.slice(0, 2).map((p) => playerKey(p.player))));
  const values = useMemo(() => new Map(game.coalitions.map((c) => [coalitionKey(c.players.map(playerKey)), c.value])), [game]);
  const shared = game.full_value - game.empty_value;
  if (!game.coalitions.length)
    return (
      <section className="card">
        <div className="card-head">
          <h3>Coalitions</h3>
        </div>
        <p className="hint">
          Sampled game ({numberFormat.format(game.sampled_orders ?? 0)} orders over {players.length} players), so coalition values were not computed.
        </p>
      </section>
    );
  const valueOf = (keys: ReadonlySet<string>) => (values.get(coalitionKey(keys)) ?? game.empty_value) - game.empty_value;
  const reached = valueOf(picked);
  const shapleySum = players.filter((p) => picked.has(playerKey(p.player))).reduce((sum, p) => sum + p.value, 0);
  const flipped = (key: string) => {
    const next = new Set(picked);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  };
  return (
    <section className="card">
      <div className="card-head card-heading">
        <h3>Coalitions</h3>
        <span className="muted">Improvement a subset reaches on its own</span>
      </div>
      <div className="group-chips" role="group" aria-label="Coalition">
        {players.map(({ player }) => {
          const key = playerKey(player);
          const change = (valueOf(flipped(key)) - reached) / shared || 0;
          return (
            <button
              key={key}
              className={`group-chip${picked.has(key) ? '' : ' off'}`}
              aria-pressed={picked.has(key)}
              aria-label={playerName(player)}
              onClick={() => setPicked(flipped(key))}
            >
              <Swatch player={player} />
              {playerName(player)}
              <small className={change > 0 ? 'up' : change < 0 ? 'down' : undefined}>
                {change === 0 ? '±0' : `${change > 0 ? '+' : '−'}${percent(Math.abs(change))}`}
              </small>
            </button>
          );
        })}
      </div>
      <div className="group-result">
        <strong>{percent(reached / shared || 0)}</strong>
        <span className="muted">
          v(S) = {fitness(reached)} of {fitness(shared)}
        </span>
      </div>
      <div className="meter">
        <i style={{ width: `${Math.max(0, Math.min(1, reached / shared || 0)) * 100}%` }} />
      </div>
      <p className="hint">
        {picked.size === 0
          ? view === 'islands'
            ? 'The empty coalition reaches no improvement.'
            : `With no routes, only the ${fitness(game.empty_value)} reached without migration counts.`
          : `Sum of the members' Shapley values: ${percent(shapleySum / shared || 0)}. ${
              reached > shapleySum + 1e-9
                ? 'The coalition reaches more, so its members complement each other.'
                : reached < shapleySum - 1e-9
                  ? 'The coalition reaches less, so part of their credit depends on players outside it.'
                  : 'The coalition reaches exactly that.'
            }`}{' '}
        Each chip shows the change from adding or removing that player.
      </p>
    </section>
  );
}

const factorial = (n: number): number => (n <= 1 ? 1 : n * factorial(n - 1));

// One example order of players joining, as a waterfall: each bar is what that player adds when it joins.
function Orders({ game }: { game: ShapleyGame }) {
  const [index, setIndex] = useState(0);
  const steps = game.orders[Math.min(index, game.orders.length - 1)] ?? [];
  if (!steps.length) return null;
  const width = 800;
  const height = 240;
  const top = 26;
  const bottom = 46;
  const lo = Math.min(game.empty_value, ...steps.map((s) => Math.min(s.before, s.after)));
  const hi = Math.max(game.full_value, ...steps.map((s) => Math.max(s.before, s.after)));
  const sy = (v: number) => top + (1 - (v - lo) / (hi - lo || 1)) * (height - top - bottom);
  const slots = waterfallSlots(steps);
  const slot = width / slots.length;
  const bar = Math.min(64, slot * 0.55);
  const noun = Array.isArray(steps[0]!.player) ? 'routes' : 'islands';
  return (
    <section className="card orders">
      <div className="card-head">
        <h3>Marginal contributions</h3>
        {game.orders.length > 1 && (
          <div className="seg push" role="group" aria-label="Example order">
            {game.orders.map((_, i) => (
              <button key={i} className={i === index ? 'on' : ''} aria-pressed={i === index} onClick={() => setIndex(i)}>
                π{i + 1}
              </button>
            ))}
          </div>
        )}
      </div>
      <p className="section-sub">
        Players join one at a time in order π{index + 1}. Each bar is a player&apos;s marginal contribution given those already present; its Shapley
        value is the mean over{' '}
        {game.sampled_orders
          ? `${numberFormat.format(game.sampled_orders)} sampled orders`
          : `all ${numberFormat.format(factorial(game.players.length))} orders`}
        .
      </p>
      <svg viewBox={`0 0 ${width} ${height}`} className="waterfall" role="img" aria-label={`Order ${index + 1}, step by step`}>
        <line className="waterfall-base" x1={0} x2={width} y1={sy(lo)} y2={sy(lo)} />
        {slots.map((entry, i) => {
          const x = slot * (i + 0.5);
          const level = entry.kind === 'step' ? entry.step.after : entry.steps[0]!.after;
          const next = i < slots.length - 1 && (
            <line className="waterfall-link" x1={x + bar / 2} x2={slot * (i + 1.5) - bar / 2} y1={sy(level)} y2={sy(level)} />
          );
          if (entry.kind === 'zeros') {
            const single = entry.steps.length === 1;
            return (
              <g key={i} className="waterfall-zeros">
                <title>{entry.steps.map((step) => playerName(step.player)).join(', ')} added nothing</title>
                {next}
                <line x1={x - bar / 2} x2={x + bar / 2} y1={sy(level)} y2={sy(level)} />
                <text className="waterfall-added" x={x} y={sy(level) - 8} textAnchor="middle">
                  +0
                </text>
                <text className="waterfall-name" x={x} y={height - bottom + 20} textAnchor="middle">
                  {single ? playerName(entry.steps[0]!.player) : `${entry.steps.length} ${noun}`}
                </text>
                <text className="waterfall-step" x={x} y={height - bottom + 36} textAnchor="middle">
                  {single ? `step ${entry.first}` : `steps ${entry.first}–${entry.last}`}
                </text>
              </g>
            );
          }
          const { step } = entry;
          const y = sy(Math.max(step.before, step.after));
          const added = step.after - step.before;
          return (
            <g key={i}>
              {next}
              <rect
                x={x - bar / 2}
                y={y}
                width={bar}
                height={Math.max(2, Math.abs(sy(step.after) - sy(step.before)))}
                rx={4}
                fill={playerColor(step.player)}
              />
              <text className="waterfall-added" x={x} y={y - 8} textAnchor="middle">
                {added >= 0 ? '+' : '−'}
                {credit(Math.abs(added))}
              </text>
              <text className="waterfall-name" x={x} y={height - bottom + 20} textAnchor="middle">
                {playerName(step.player)}
              </text>
              <text className="waterfall-step" x={x} y={height - bottom + 36} textAnchor="middle">
                step {entry.number}
              </text>
            </g>
          );
        })}
      </svg>
    </section>
  );
}

function Attribution({ shapley, maximising }: { shapley: ShapleyAttribution; maximising: boolean }) {
  // The Migration tab links here with ?view=routes.
  const [view, setView] = useState<View>(() => (new URLSearchParams(window.location.search).get('view') === 'routes' ? 'routes' : 'islands'));
  const game = shapley[view];
  const calculationLabel = game.sampled_orders
    ? `Estimated from ${numberFormat.format(game.sampled_orders)} sampled orders`
    : `Exact, from all ${numberFormat.format(game.coalitions.length)} groups`;
  const change = (next: View) => {
    setView(next);
    window.history.replaceState(null, '', `${window.location.pathname}${next === 'routes' ? '?view=routes' : ''}`);
  };
  return (
    <>
      <div className="attribution-head">
        <div className="seg" role="group" aria-label="Players">
          <button className={view === 'islands' ? 'on' : ''} aria-pressed={view === 'islands'} onClick={() => change('islands')}>
            Island attribution
          </button>
          <button className={view === 'routes' ? 'on' : ''} aria-pressed={view === 'routes'} onClick={() => change('routes')}>
            Migration route attribution
          </button>
        </div>
        <span className="muted">{calculationLabel}</span>
      </div>
      <Shared shapley={shapley} game={game} view={view} maximising={maximising} />
      <div className="attribution-grid">
        <Credit key={`credit-${view}`} game={game} view={view} />
        <Coalitions key={`coalitions-${view}`} game={game} view={view} />
      </div>
      <Orders key={`orders-${view}`} game={game} />
    </>
  );
}

export default function AttributionTab({ run, result }: { run: Run; result: ResultQuery }) {
  if (!result.data) return <NoResult run={run} result={result} />;
  const { shapley } = result.data.explainability;
  if (shapley.status === 'unavailable') return <EmptyState icon="alert" title="No attribution for this run" detail={shapley.detail} />;
  return <Attribution shapley={shapley} maximising={result.data.run.maximising} />;
}
