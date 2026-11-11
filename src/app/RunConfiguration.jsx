import React from 'react';
import { runValueLabel } from '../runs/run-form.js';

const display = (value) =>
  value === null
    ? 'Automatic'
    : typeof value === 'boolean'
      ? value
        ? 'Enabled'
        : 'Disabled'
      : typeof value === 'string'
        ? runValueLabel(value)
        : String(value);
const label = (key) => key.replaceAll('_', ' ').replaceAll('.', ' / ');
function Fields({ values, prefix = '' }) {
  return Object.entries(values).map(([key, value]) => {
    const name = prefix + key;
    return value && typeof value === 'object' && !Array.isArray(value) ? (
      <Fields key={name} values={value} prefix={`${name}.`} />
    ) : (
      <div className="configuration-field" key={name}>
        <dt>{label(name)}</dt>
        <dd>{Array.isArray(value) ? value.join(', ') : display(value)}</dd>
      </div>
    );
  });
}

export default function RunConfiguration({ configuration, recorded = false }) {
  const mainKeys = [
    'lsh',
    'birch',
    'denstream',
    'detail',
    ...(configuration?.clustering.birch ? ['birch_threshold'] : []),
    ...(configuration?.clustering.denstream ? ['denstream_epsilon', 'denstream_half_life'] : []),
  ];
  const primary = Object.fromEntries(Object.entries(configuration?.clustering || {}).filter(([key]) => mainKeys.includes(key)));
  const additional = Object.fromEntries(Object.entries(configuration?.clustering || {}).filter(([key]) => !mainKeys.includes(key)));
  return (
    <section className="run-configuration" aria-label="Run configuration">
      <h2>Configuration</h2>
      {!configuration ? (
        <p className="configuration-note">Request settings are not saved in this browser.</p>
      ) : (
        <>
          <dl className="configuration-summary">
            <div>
              <dt>{recorded ? 'Recording' : 'Preset'}</dt>
              <dd>{configuration.preset}</dd>
            </div>
            <div>
              <dt>Updates</dt>
              <dd>{configuration.stream ? 'Live updates' : 'Final result only'}</dd>
            </div>
          </dl>
          <div className="configuration-columns">
            <section>
              <h3>{recorded ? 'Offline clustering' : 'Clustering settings'}</h3>
              <dl className="configuration-fields">
                <Fields values={primary} />
              </dl>
              {Object.keys(additional).length > 0 && (
                <details className="configuration-additional">
                  <summary>Additional parameters</summary>
                  <dl className="configuration-fields">
                    <Fields values={additional} />
                  </dl>
                </details>
              )}
            </section>
            <section>
              <h3>{recorded ? 'Recorded runner settings' : 'Runner overrides'}</h3>
              {Object.keys(configuration.overrides).length ? (
                <dl className="configuration-fields">
                  <Fields values={configuration.overrides} />
                </dl>
              ) : (
                <p className="configuration-note">Preset defaults</p>
              )}
            </section>
          </div>
          {recorded && <p className="configuration-note">Clustering settings apply to the Python export of this recording.</p>}
        </>
      )}
    </section>
  );
}
