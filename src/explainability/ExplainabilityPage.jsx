import React, { useEffect, useState } from 'react';
import { readAttribution } from './attribution.js';
import './explainability.css';

const number = new Intl.NumberFormat('en', { maximumFractionDigits: 4 });
const percentage = new Intl.NumberFormat('en', { maximumFractionDigits: 1 });
const fmt = (value) => number.format(value);
const pct = (value) => `${percentage.format(value)}%`;

function Metric({ label, value, detail }) {
  return (
    <div className="ex-metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

function Attribution({ data }) {
  const [mode, setMode] = useState('islands'),
    [coalition, setCoalition] = useState([]),
    [walk, setWalk] = useState('0'),
    [step, setStep] = useState(0);
  const game = data.games[mode],
    isRoutes = mode === 'routes',
    sampled = game.sampled;
  const selected = game.coalitions.find((c) => c.players.length === coalition.length && c.players.every((id) => coalition.includes(id)));
  const example = game.orders.find((e) => e.id === walk) || game.orders[0],
    current = example?.steps[step];
  const changeMode = (next) => {
    setMode(next);
    setCoalition([]);
    setWalk('0');
    setStep(0);
  };
  return (
    <div data-attribution>
      <div className="ex-summary">
        <Metric
          label="Initial best fitness"
          value={fmt(data.baseline_fitness)}
          detail={data.maximising ? 'Maximisation · higher is better' : 'Minimisation · lower is better'}
        />
        <Metric
          label="Supported best fitness"
          value={fmt(data.supported_best_fitness)}
          detail={`Observed best: ${fmt(data.observed_best_fitness)}`}
        />
        <Metric
          label="Attributed improvement"
          value={fmt(game.allocated_gain)}
          detail={isRoutes ? 'Relative to the migration-free lineage baseline' : 'Relative to the initial-population best'}
        />
        <Metric
          label="Ancestry coverage"
          value={pct(data.coverage.percent)}
          detail={`${data.coverage.supported.toLocaleString()} / ${data.coverage.total.toLocaleString()} evaluations`}
        />
      </div>
      <div className="ex-mode-row">
        <div className="ex-switch" role="group" aria-label="Attribution players">
          <button aria-pressed={!isRoutes} onClick={() => changeMode('islands')}>
            Islands
          </button>
          <button aria-pressed={isRoutes} onClick={() => changeMode('routes')}>
            Migration routes
          </button>
        </div>
        <span className="ex-method">
          {sampled ? `${game.sampled_orders.toLocaleString()} sampled orders` : `Exact · ${game.coalitions.length.toLocaleString()} coalitions`}
        </span>
      </div>
      <div className="ex-grid">
        <section className="ex-card ex-rankings" aria-labelledby="ex-credit-heading">
          <h2 id="ex-credit-heading">{isRoutes ? 'Migration-route contributions' : 'Island contributions'}</h2>
          <p className="ex-description">
            {isRoutes
              ? 'Directed migration routes are coalition players; each route aggregates its recorded migration events.'
              : 'Shapley values allocate fitness improvement across islands using complete recorded ancestry.'}
          </p>
          {game.allocated_gain > 0 && game.players[0] && (
            <p className="ex-leading">
              Largest contribution{' '}
              <strong>
                {game.players[0].label} · {pct(game.players[0].share_percent)}
              </strong>
            </p>
          )}
          {game.players.length === 0 ? (
            <div className="ex-empty">No cross-island dependencies recorded.</div>
          ) : (
            <div className="ex-bars" aria-label="Shapley contributions">
              {game.players.map((player) => (
                <div className="ex-bar-row" key={player.id}>
                  <div className="ex-bar-label">
                    <span>{player.label}</span>
                    <strong>
                      {fmt(player.value)} <small>({pct(player.share_percent)})</small>
                    </strong>
                  </div>
                  <div
                    className="ex-track"
                    role="meter"
                    aria-label={`${player.label} share of allocated gain`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={player.share_percent}
                  >
                    <span style={{ width: `${player.bar_percent}%` }} />
                  </div>
                  {sampled && <small className="ex-sampling-error">Monte Carlo standard error: {fmt(player.standard_error)}</small>}
                </div>
              ))}
            </div>
          )}
          <div className="ex-reconciliation">
            <span>
              Baseline v(∅) <b>{fmt(game.empty_value)}</b>
            </span>
            <span>
              Total attribution Σφᵢ <b>{fmt(game.allocated_gain)}</b>
            </span>
            <span>
              Full coalition v(N) <b>{fmt(game.full_value)}</b>
            </span>
          </div>
          <p className="ex-description">
            Fitness improvement units; bars normalized to the maximum contribution. Percentages denote shares of total attribution.{' '}
            {game.allocated_gain === 0 ? 'No additional improvement is attributable in this game. ' : ''}Island and route attributions are separate
            games and are not additive.
          </p>
          {sampled && <p className="ex-description">Standard errors quantify Monte Carlo estimation error, not between-run variability.</p>}
        </section>
        <section className="ex-card ex-lab" aria-labelledby="ex-coalition-heading">
          <h2 id="ex-coalition-heading">Coalition value</h2>
          {sampled ? (
            <div className="ex-empty">
              <p>
                Exact enumeration is limited to ten players. This game contains {game.players.length} players and uses{' '}
                {game.sampled_orders.toLocaleString()} sampled permutations.
              </p>
              <p>Permutation-specific marginal contributions are reported below.</p>
            </div>
          ) : (
            <>
              <p className="ex-description">
                v(S) is the maximum fitness improvement supported by complete ancestry within the selected {isRoutes ? 'routes' : 'islands'}.
              </p>
              <div className="ex-coalition-controls">
                {game.players.map((player) => (
                  <label key={player.id}>
                    <input
                      type="checkbox"
                      checked={coalition.includes(player.id)}
                      onChange={() => setCoalition((ids) => (ids.includes(player.id) ? ids.filter((id) => id !== player.id) : [...ids, player.id]))}
                    />
                    {player.label}
                  </label>
                ))}
              </div>
              <div className="ex-coalition-result">
                <span>Coalition value v(S)</span>
                <strong data-coalition-value aria-live="polite">
                  {fmt(selected?.value ?? 0)}
                </strong>
                <small>fitness improvement from the initial baseline</small>
              </div>
              <div className="ex-track ex-coalition-track">
                <span style={{ width: `${selected?.value_percent ?? 0}%` }} />
              </div>
              <div className="ex-coalition-actions">
                <button className="text-button" onClick={() => setCoalition([])}>
                  Clear selection
                </button>
                <button className="text-button" onClick={() => setCoalition(game.players.map((p) => p.id))}>
                  Select all
                </button>
              </div>
              <p className="ex-description">
                {isRoutes
                  ? 'All islands remain available. The empty coalition retains improvement supported by migration-free lineages.'
                  : 'Support requires the evaluation’s island and every recorded ancestor; partial parent-path reachability is insufficient.'}
              </p>
            </>
          )}
        </section>
      </div>
      <section className="ex-card ex-walk" aria-labelledby="ex-walk-heading">
        <div className="ex-walk-head">
          <h2 id="ex-walk-heading">Marginal contributions</h2>
          {example && (
            <label>
              Permutation{' '}
              <select
                aria-label="Permutation"
                value={example.id}
                onChange={(event) => {
                  setWalk(event.target.value);
                  setStep(0);
                }}
              >
                {game.orders.map((e, i) => (
                  <option key={e.id} value={e.id}>
                    π {i + 1}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        {current ? (
          <>
            <div className="ex-order" aria-label="Coalition permutation">
              {example.steps.map((item, i) => (
                <button key={item.player_id} onClick={() => setStep(i)} aria-pressed={i === step} className={i <= step ? 'joined' : ''}>
                  <small>{i + 1}</small>
                  {item.label}
                </button>
              ))}
            </div>
            <div className="ex-walk-detail" aria-live="polite">
              <span>
                v(S)
                <br />
                <strong>{fmt(current.before)}</strong>
              </span>
              <span className="ex-join">+ {current.label}</span>
              <span>
                v(S ∪ {'{i}'})<br />
                <strong>{fmt(current.after)}</strong>
              </span>
              <span className="ex-marginal">
                Marginal contribution Δᵢ(S)
                <br />
                <strong>+{fmt(current.marginal)}</strong>
              </span>
            </div>
            <div className="ex-step-controls">
              <button className="secondary" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
                Previous
              </button>
              <span>
                Step {step + 1} of {example.steps.length}
              </span>
              <button className="secondary" disabled={step === example.steps.length - 1} onClick={() => setStep((s) => s + 1)}>
                Next step
              </button>
            </div>
            <p className="ex-description">
              Δᵢ(S) = v(S ∪ {'{i}'}) − v(S). Shapley values average these increments over {sampled ? 'sampled permutations' : 'all permutations'}; the
              selected permutation shows one marginal allocation.
            </p>
          </>
        ) : (
          <p className="ex-description">No migration-route players available for marginal analysis.</p>
        )}
      </section>
      <details className="ex-card ex-method-detail">
        <summary>Method and assumptions</summary>
        <div className="ex-method-grid">
          <div>
            <h3>Characteristic function</h3>
            <p>
              v(S) is the best ancestry-supported improvement relative to the initial-population best. Fitness direction follows the run objective;
              initial-population quality is held fixed.
            </p>
            <p>Shapley values are mean permutation-marginal contributions and satisfy Σᵢφᵢ = v(N) − v(∅).</p>
          </div>
          <div>
            <h3>Attribution scope</h3>
            <p>
              Single-run observational attribution of recorded dependencies. These values do not estimate counterfactual optimiser performance or
              causal effects of island or route removal.
            </p>
            <p>Attribution is specific to the recorded run and game definition. Equal contributions need not imply equivalent island performance.</p>
          </div>
          <div>
            <h3>Lineage completeness</h3>
            <p>
              {data.coverage.excluded === 0
                ? 'All recorded evaluations have resolved ancestry.'
                : `${data.coverage.excluded.toLocaleString()} evaluations lack fully resolved ancestry.`}{' '}
              Missing parents, cycles and dependent descendants are excluded.
            </p>
            <p>Coverage is conditional on source-log completeness. Aggregated cluster links are not used to reconstruct individual ancestry.</p>
          </div>
        </div>
        <p className="ex-description">
          Reference:{' '}
          <a href="https://doi.org/10.1515/9781400881970-018" target="_blank" rel="noreferrer">
            Shapley, A Value for n-Person Games
          </a>
          . {sampled ? 'Permutation sampling with a fixed seed.' : 'Exact coalition enumeration.'}
        </p>
      </details>
    </div>
  );
}

const POLL_MS = 2000; // how often an unfinished run's result is requested again
const PENDING = 'Attribution is computed when clustering finishes.';
const STOPPED = 'This run stopped before clustering finished, so it has no attribution.';

export default function ExplainabilityPage({ runId, api }) {
  const [state, setState] = useState(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!runId) return;
    const controller = new AbortController();
    let active = true;
    let timer;
    const show = (value) => {
      if (active) setState({ runId, api, retry, ...value });
    };

    async function load() {
      try {
        const result = await api.result(runId, { signal: controller.signal });
        if (active) show(readAttribution(result, runId));
      } catch (error) {
        if (!active) return;
        // The backend answers 404 until the run's result is saved, and a stopped run never gets one.
        const noResultYet = error.status === 404 && !/run not found/i.test(error.message);
        if (noResultYet && /run (failed|cancelled)$/i.test(error.message)) {
          show({ status: 'unavailable', detail: STOPPED });
        } else if (noResultYet) {
          show({ status: 'pending', detail: PENDING });
          timer = setTimeout(load, POLL_MS);
        } else {
          show({ error: error.message || 'Could not load the run result. Retry to request it again.' });
        }
      }
    }

    load();
    return () => {
      active = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [runId, api, retry]);

  // State left from a previous run, backend or retry is ignored until the new request answers.
  const current = state?.runId === runId && state.api === api && state.retry === retry ? state : null;

  let body;
  if (!runId) {
    body = (
      <div className="ex-card ex-unavailable">
        <h2>No run selected</h2>
        <p>Select a run to see its attribution.</p>
      </div>
    );
  } else if (current?.error) {
    body = (
      <div className="notice" role="alert">
        {current.error}{' '}
        <button className="secondary" onClick={() => setRetry((x) => x + 1)}>
          Retry
        </button>
      </div>
    );
  } else if (current?.status === 'unavailable') {
    body = (
      <div className="ex-card ex-unavailable">
        <h2>Shapley attribution unavailable</h2>
        <p>
          <code>{runId}</code>
        </p>
        <p>{current.detail}</p>
      </div>
    );
  } else if (!current?.data) {
    body = <p role="status">{current?.status === 'pending' ? current.detail : 'Loading attribution…'}</p>;
  } else {
    const { data } = current;
    body = (
      <>
        <p className="ex-run-meta">
          <code>{data.run_id}</code>
          <span>
            {api.isDemo ? 'Recorded demonstration' : 'Backend analysis'} · {data.algorithm} · {data.benchmark} · {data.topology ?? 'no migration'}
          </span>
        </p>
        {data.warnings.map((message) => (
          <div className="notice" role="status" key={message}>
            {message}
          </div>
        ))}
        <Attribution key={data.run_id} data={data} />
      </>
    );
  }

  return (
    <div className="page explainability-page">
      <header className="ex-heading">
        <div>
          <h1>Explainability</h1>
          <p className="question">Lineage-based Shapley attribution of fitness improvement.</p>
        </div>
      </header>
      {body}
    </div>
  );
}
