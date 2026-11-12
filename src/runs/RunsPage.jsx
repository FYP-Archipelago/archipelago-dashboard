import React, { useEffect, useRef, useState } from 'react';
import { backendApi } from '../backend/api.js';
import ClusteringControls from './ClusteringControls.jsx';
import { buildRunRequest, initialClustering, runValueLabel, validatePresets } from './run-form.js';
import './runs.css';

const LABELS = {
  num_islands: 'Islands',
  evaluation_budget: 'Evaluation budget',
  target_generations: 'Target generations',
  'migration.enabled': 'Migration',
  'migration.topology': 'Migration topology',
  'migration.interval': 'Migration interval (generations)',
  'migration.num_migrants': 'Migrants per event',
  seed: 'Runner seed (optional)',
};
const labelFor = (key) => LABELS[key] || key.replaceAll('_', ' ');
const HELP = {
  evaluation_budget: 'Total fitness evaluations shared across all islands.',
  target_generations: 'Guides population size; it does not set a hard generation limit.',
  seed: 'Blank uses a fresh seed; migration timing can still change the outcome.',
};

function OverrideField({ name, rule, value, onChange, error }) {
  const label = labelFor(name),
    description = [HELP[name] && `hint-${name}`, error && `error-${name}`].filter(Boolean).join(' ');
  const common = { name, 'aria-invalid': !!error, 'aria-describedby': description || undefined };
  const islandChoices =
    name === 'num_islands' && Number.isSafeInteger(rule.min) && Number.isSafeInteger(rule.max) && rule.max >= rule.min && rule.max - rule.min <= 12
      ? Array.from({ length: rule.max - rule.min + 1 }, (_, index) => rule.min + index)
      : null;
  return (
    <label>
      {label}
      {rule.type === 'bool' ? (
        <select {...common} value={String(!!value)} onChange={(event) => onChange(event.target.value === 'true')}>
          <option value="true">Enabled</option>
          <option value="false">Disabled</option>
        </select>
      ) : rule.type === 'choice' || islandChoices ? (
        <select {...common} value={value ?? ''} onChange={(event) => onChange(event.target.value)}>
          {(islandChoices || rule.choices).map((choice) => (
            <option key={choice} value={choice}>
              {runValueLabel(choice)}
            </option>
          ))}
        </select>
      ) : (
        <input
          {...common}
          type="number"
          step="1"
          min={rule.min}
          max={rule.max}
          value={value ?? ''}
          onChange={(event) => onChange(event.target.value)}
          placeholder={rule.optional ? 'Automatic when blank' : undefined}
        />
      )}
      {HELP[name] && <small id={`hint-${name}`}>{HELP[name]}</small>}
      {error && (
        <span id={`error-${name}`} className="field-error">
          {error}
        </span>
      )}
    </label>
  );
}

export default function RunsPage({ api = backendApi, onOpenRun, onBusyChange }) {
  const [catalog, setCatalog] = useState(null),
    [preset, setPreset] = useState(''),
    [drafts, setDrafts] = useState({});
  const [retry, setRetry] = useState(0);
  const [checks, setChecks] = useState(null);
  const current = checks?.api === api && checks.retry === retry ? checks : {};
  const health = current.health ?? { state: 'checking', message: '' },
    loading = !current.loaded,
    catalogError = current.catalogError ?? '';
  const [clustering, setClustering] = useState(initialClustering),
    [stream, setStream] = useState(true);
  const [busy, setBusy] = useState(false),
    [errors, setErrors] = useState({}),
    [submitError, setSubmitError] = useState('');
  const submitting = useRef(false),
    mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    onBusyChange?.(busy);
  }, [busy, onBusyChange]);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const report = (change) => {
      if (active) setChecks((previous) => ({ ...(previous?.api === api && previous.retry === retry ? previous : { api, retry }), ...change }));
    };
    api
      .health({ signal: controller.signal })
      .then((value) => {
        const ok = value?.status === 'ok' && value?.db === true && value?.redis === true;
        report({
          health: { state: ok ? 'connected' : 'unavailable', message: ok ? '' : 'The backend reports that its database or Redis is unavailable.' },
        });
      })
      .catch((error) => report({ health: { state: 'unavailable', message: error.message } }));
    api
      .presets({ signal: controller.signal })
      .then(validatePresets)
      .then((value) => {
        if (!active) return;
        setCatalog(value);
        setPreset((current) => (value.presets.some((item) => item.preset === current) ? current : value.presets[0].preset));
      })
      .catch((error) => report({ catalogError: error.message }))
      .finally(() => report({ loaded: true }));
    return () => {
      active = false;
      controller.abort();
    };
  }, [api, retry]);
  const selected = catalog?.presets.find((item) => item.preset === preset),
    values = drafts[preset] || {};
  const changeValue = (key, value) => setDrafts((current) => ({ ...current, [preset]: { ...current[preset], [key]: value } }));
  const submit = async (event) => {
    event.preventDefault();
    if (submitting.current || loading || health.state !== 'connected' || catalogError) return;
    setErrors({});
    setSubmitError('');
    let body;
    try {
      body = buildRunRequest({ catalog, preset, values, clustering, stream });
    } catch (error) {
      setErrors(error.fields || {});
      setSubmitError(error.message);
      return;
    }
    submitting.current = true;
    setBusy(true);
    try {
      const run = await api.createRun(body);
      onOpenRun(run.run_id, { run });
    } catch (error) {
      if (mounted.current) setSubmitError(error.message);
    } finally {
      submitting.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  return (
    <div className="runs-page">
      <header className="page-head">
        <h1>Start a new run</h1>
      </header>
      <div className="backend-connection" role="status" aria-live="polite">
        <span className={`status-dot ${health.state === 'connected' ? 'online' : ''}`} />
        <strong>
          {health.state === 'connected' ? 'Backend connected' : health.state === 'checking' ? 'Checking backend…' : 'Backend unavailable'}
        </strong>
        <button type="button" onClick={() => setRetry((value) => value + 1)} disabled={busy}>
          Retry connection
        </button>
      </div>
      {health.message && (
        <div className="notice error" role="alert">
          {health.message}
        </div>
      )}
      {loading && <p role="status">Loading presets…</p>}
      {catalogError && (
        <div className="notice error" role="alert">
          {catalogError}
        </div>
      )}
      {selected && (
        <section className="run-entry">
          <form className="new-run-form" onSubmit={submit} noValidate aria-busy={busy}>
            <fieldset disabled={busy || loading || !!catalogError}>
              <section className="run-preset" aria-label="Preset selection">
                <label>
                  Preset
                  <select
                    name="preset"
                    value={preset}
                    onChange={(event) => {
                      setPreset(event.target.value);
                      setErrors({});
                      setSubmitError('');
                    }}
                  >
                    {catalog.presets.map((item) => (
                      <option key={item.preset} value={item.preset}>
                        {item.algorithm.toUpperCase()} · {runValueLabel(item.benchmark)} — {item.preset}
                      </option>
                    ))}
                  </select>
                </label>
              </section>
              <section className="runner-controls" aria-labelledby="runner-title">
                <h3 id="runner-title">Runner settings</h3>
                <div className="param-grid">
                  {Object.entries(catalog.overrides).map(([key, rule]) => (
                    <OverrideField
                      key={`${preset}:${key}`}
                      name={key}
                      rule={rule}
                      value={Object.hasOwn(values, key) ? values[key] : selected.defaults[key]}
                      onChange={(value) => changeValue(key, value)}
                      error={errors[key]}
                    />
                  ))}
                </div>
              </section>
              <ClusteringControls value={clustering} onChange={setClustering} errors={errors} />
              <section className="run-display-mode" aria-labelledby="display-mode-title">
                <h3 id="display-mode-title">Display mode</h3>
                <div className="display-options" role="radiogroup" aria-labelledby="display-mode-title">
                  <label className="display-option">
                    <input
                      id="live-updates"
                      name="stream-mode"
                      type="radio"
                      value="live"
                      aria-labelledby="live-mode-label"
                      aria-describedby="live-mode-help"
                      checked={stream}
                      onChange={() => setStream(true)}
                    />
                    <span>
                      <strong id="live-mode-label">Live updates</strong>
                      <small id="live-mode-help">Update the clustered graph as the run progresses.</small>
                    </span>
                  </label>
                  <label className="display-option">
                    <input
                      id="final-only"
                      name="stream-mode"
                      type="radio"
                      value="batch"
                      aria-labelledby="batch-mode-label"
                      aria-describedby="batch-mode-help"
                      checked={!stream}
                      onChange={() => setStream(false)}
                    />
                    <span>
                      <strong id="batch-mode-label">Final result only</strong>
                      <small id="batch-mode-help">Cluster after execution and show the completed graph.</small>
                    </span>
                  </label>
                </div>
              </section>
              {submitError && (
                <div className="notice error" role="alert">
                  {submitError}
                </div>
              )}
              <button className="primary" type="submit" disabled={busy || health.state !== 'connected' || loading || !!catalogError}>
                {busy ? 'Starting…' : 'Start run'}
              </button>
            </fieldset>
          </form>
        </section>
      )}
    </div>
  );
}
