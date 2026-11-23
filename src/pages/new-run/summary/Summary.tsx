import { useState } from 'react';

import { NAME_MAX } from '@/api/runs.ts';
import Icon from '@/components/Icon.tsx';
import { numberFormat, TOPOLOGIES } from '@/format.ts';
import { randomName, STAGES, type Form, type Patch } from '@/pages/new-run/form.ts';

import StartButton, { type StartPhase } from './StartButton.tsx';

import './summary.css';

type SummaryProps = {
  form: Form;
  errors: Record<string, string>;
  submit: { phase: StartPhase; error: string };
  patch: Patch;
  onLaunch: () => void;
};

export default function Summary({ form, errors, submit, patch, onLaunch }: SummaryProps) {
  const [spins, setSpins] = useState(0);

  const errorCount = Object.keys(errors).length;
  const stages = STAGES.filter((stage) => form.clustering[stage.key]).map((stage) => stage.label);
  const stagnationLimit = form.text['termination.stagnation_generations'].trim();
  const gens = (text: string) => `${text} ${Number(text) === 1 ? 'gen' : 'gens'}`;
  const stagnation = errors['termination.stagnation_generations'] || Number(stagnationLimit) === 0 ? '—' : gens(stagnationLimit);

  return (
    <aside className="card new-run-summary">
      <h3>Summary</h3>
      <div className="new-run-field">
        <label htmlFor="run-name">Run name</label>
        <div className="name-row">
          <input
            id="run-name"
            className={`input monospace${errors.name ? ' new-run-input-invalid' : ''}`}
            value={form.name}
            maxLength={NAME_MAX}
            spellCheck={false}
            onChange={(event) => patch({ name: event.target.value })}
          />
          <button
            className="button icon-button name-shuffle"
            title="Generate another name"
            aria-label="Generate another name"
            onClick={() => {
              patch({ name: randomName() });
              setSpins((n) => n + 1);
            }}
          >
            <span key={spins} className={spins ? 'name-shuffle-spun' : undefined}>
              <Icon name="rerun" size={14} />
            </span>
          </button>
        </div>
        {errors.name && <span className="field-error">{errors.name}</span>}
      </div>
      <dl>
        <dt>Preset</dt>
        <dd>{form.preset.preset}</dd>
        <dt>Islands</dt>
        <dd>{form.islands}</dd>
        <dt>Budget</dt>
        <dd>{errors.evaluation_budget ? '—' : numberFormat.format(Number(form.text.evaluation_budget))}</dd>
        <dt>Generations</dt>
        <dd>{errors.target_generations ? '—' : form.text.target_generations.trim()}</dd>
        <dt>Stagnation</dt>
        <dd>{stagnation}</dd>
        <dt>Migration</dt>
        <dd>{form.migration ? (TOPOLOGIES[form.topology] ?? form.topology) : '—'}</dd>
        {form.migration && (
          <>
            <dt>Schedule</dt>
            <dd>
              {errors['migration.interval'] || errors['migration.num_migrants']
                ? '—'
                : `${form.text['migration.num_migrants'].trim()} every ${gens(form.text['migration.interval'].trim())}`}
            </dd>
          </>
        )}
        <dt>Clustering</dt>
        <dd>{stages.join(' → ') || '—'}</dd>
        <dt>Mode</dt>
        <dd>{form.stream ? 'Live' : 'Final only'}</dd>
      </dl>
      <hr />
      {errorCount > 0 && (
        <p className="start-note">
          <Icon name="alert" size={14} />
          {errorCount === 1 ? 'Fix the highlighted field to start.' : `Fix the ${errorCount} highlighted fields to start.`}
        </p>
      )}
      {submit.error && (
        <p className="start-note">
          <Icon name="alert" size={14} />
          {submit.error}
        </p>
      )}
      <StartButton phase={submit.phase} disabled={errorCount > 0 || submit.phase !== 'idle'} onLaunch={onLaunch} />
    </aside>
  );
}
