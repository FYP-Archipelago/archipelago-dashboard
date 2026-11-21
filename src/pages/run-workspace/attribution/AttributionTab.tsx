import { useState } from 'react';

import { islandColor } from '@/colors.ts';
import Icon from '@/components/Icon.tsx';
import { fitness, numberFormat } from '@/format.ts';
import { EmptyState, NoResult, type ResultQuery } from '@/pages/run-workspace/shared.tsx';
import type { Player, Run, ShapleyAttribution, ShapleyGame } from '@/types.ts';

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
      </div>
    </>
  );
}

export default function AttributionTab({ run, result }: { run: Run; result: ResultQuery }) {
  if (!result.data) return <NoResult run={run} result={result} />;
  const { shapley } = result.data.explainability;
  if (shapley.status === 'unavailable') return <EmptyState icon="alert" title="No attribution for this run" detail={shapley.detail} />;
  return <Attribution shapley={shapley} maximising={result.data.run.maximising} />;
}
