import { CLUSTER_FIELDS } from './run-form.js';

const STAGES = [
  ['lsh', 'LSH'],
  ['birch', 'BIRCH'],
  ['denstream', 'DenStream'],
];
const DETAIL_LEVELS = ['0.5', '0.6', '0.7', '0.8', '0.9', '1', '1.1', '1.2', '1.3', '1.4', '1.5', '1.6', '1.7', '1.8', '1.9', '2'];
export default function ClusteringControls({ value, onChange, errors = {} }) {
  const set = (key, next) => onChange({ ...value, [key]: next });
  return (
    <section className="clustering-controls" aria-labelledby="clustering-title">
      <h3 id="clustering-title">Clustering</h3>
      <p className="setup-note" id="clustering-help">
        LSH → BIRCH → DenStream. Select at least one stage.
      </p>
      <div className="stage-row" role="group" aria-label="Clustering stages">
        {STAGES.map(([key, label]) => (
          <label className="stage-option" key={key}>
            <input
              name={key}
              type="checkbox"
              aria-invalid={!!errors.stages}
              aria-describedby={`clustering-help${errors.stages ? ' clustering-stage-error' : ''}`}
              checked={value[key]}
              onChange={(event) => set(key, event.target.checked)}
            />
            <span>
              <strong>{label}</strong>
            </span>
          </label>
        ))}
      </div>
      {errors.stages && (
        <p id="clustering-stage-error" className="field-error" role="alert">
          {errors.stages}
        </p>
      )}
      <label className="detail-control">
        Clustering detail
        <select
          name="detail"
          value={value.detail}
          onChange={(event) => set('detail', event.target.value)}
          aria-invalid={!!errors.detail}
          aria-describedby={`detail-help${errors.detail ? ' detail-error' : ''}`}
        >
          {DETAIL_LEVELS.map((level) => (
            <option key={level} value={level}>
              {level}
              {level === '0.5' ? ' — Coarse' : level === '1' ? ' — Default' : level === '2' ? ' — Fine' : ''}
            </option>
          ))}
        </select>
        <small id="detail-help">Scales automatic BIRCH and DenStream distances: 0.5 is coarse, 2 is fine.</small>
      </label>
      {errors.detail && (
        <p id="detail-error" className="field-error">
          {errors.detail}
        </p>
      )}
      <details className="advanced-clustering">
        <summary>Advanced clustering settings</summary>
        <p className="setup-note">Automatic values are selected from this run.</p>
        <div className="details-body param-grid">
          {Object.entries(CLUSTER_FIELDS)
            .filter(([key, rule]) => key !== 'detail' && (!rule.stage || value[rule.stage]))
            .map(([key, rule]) => (
              <div className="cluster-parameter" key={key}>
                <label htmlFor={`cluster-${key}`}>{rule.label}</label>
                <div className={rule.auto ? 'cluster-auto-input' : undefined}>
                  {rule.auto && (
                    <select
                      id={`cluster-mode-${key}`}
                      aria-label={`${rule.label} mode`}
                      value={value[key] == null ? 'auto' : 'manual'}
                      onChange={(event) => set(key, event.target.value === 'auto' ? null : '')}
                    >
                      <option value="auto">Automatic</option>
                      <option value="manual">Manual</option>
                    </select>
                  )}
                  <input
                    id={`cluster-${key}`}
                    name={`clustering.${key}`}
                    type="number"
                    min={rule.min ?? (rule.positive ? '0' : undefined)}
                    max={rule.max}
                    step={rule.step}
                    value={value[key] ?? ''}
                    disabled={rule.auto && value[key] == null}
                    onChange={(event) => set(key, event.target.value)}
                    aria-invalid={!!errors[key]}
                    aria-describedby={errors[key] ? `cluster-error-${key}` : undefined}
                    placeholder={rule.auto ? (value[key] == null ? 'Selected from run data' : 'Enter a positive value') : undefined}
                  />
                </div>
                {errors[key] && (
                  <p id={`cluster-error-${key}`} className="field-error">
                    {errors[key]}
                  </p>
                )}
              </div>
            ))}
        </div>
      </details>
    </section>
  );
}
