import type { ReactNode } from 'react';

import type { Form, Patch, SetText, SettingKey } from '@/pages/new-run/form.ts';
import { ISLAND_COLORS, numberFormat, vars } from '@/pages/new-run/shared.ts';
import type { Presets } from '@/types.ts';

import type { FieldProps } from './fields.tsx';

import './search.css';

const compactNumber = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });

type TileProps = Omit<FieldProps, 'decimal' | 'disabled'> & { hint: string; children?: ReactNode };

function NumberTile({ id, label, value, onChange, error, hint, placeholder, children }: TileProps) {
  return (
    <div className="sd-tile">
      <label className="sd-l" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className={`sd-input num${error ? ' invalid' : ''}`}
        inputMode="numeric"
        placeholder={placeholder}
        value={value}
        spellCheck={false}
        onChange={(event) => onChange(event.target.value)}
      />
      {children}
      {error ? <span className="field-error">{error}</span> : <small>{hint}</small>}
    </div>
  );
}

// The island count rolls like an odometer between − and +; the islands pop in and out under it.
function IslandStepper({ form, islandCounts, patch }: { form: Form; islandCounts: number[]; patch: Patch }) {
  const index = islandCounts.indexOf(form.islands);
  const step = (delta: number) => {
    const next = islandCounts[index + delta];
    if (next !== undefined) patch({ islands: next });
  };

  return (
    <>
      <div className="roll">
        <button className="btn btn-icon" aria-label="Fewer islands" disabled={index <= 0} onClick={() => step(-1)}>
          −
        </button>
        <span className="roll-window" aria-live="polite">
          <span className="roll-strip" style={{ transform: `translateY(${(-Math.max(0, index) / islandCounts.length) * 100}%)` }}>
            {islandCounts.map((count) => (
              <b key={count} className="sd-big num">
                {count}
              </b>
            ))}
          </span>
        </span>
        <button className="btn btn-icon" aria-label="More islands" disabled={index >= islandCounts.length - 1} onClick={() => step(1)}>
          +
        </button>
      </div>
      <div className="roll-dots">
        {Array.from({ length: form.islands }, (_, i) => (
          <span key={i} style={vars({ '--c': ISLAND_COLORS[i % ISLAND_COLORS.length]! })} />
        ))}
      </div>
    </>
  );
}

type SearchProps = { form: Form; errors: Record<string, string>; overrides: Presets['overrides']; patch: Patch; setText: SetText };

export default function SearchSection({ form, errors, overrides, patch, setText }: SearchProps) {
  const islandSpec = overrides.num_islands;
  const islandCounts =
    islandSpec?.type === 'int' && islandSpec.min !== undefined && islandSpec.max !== undefined
      ? Array.from({ length: islandSpec.max - islandSpec.min + 1 }, (_, i) => islandSpec.min! + i)
      : [form.islands];

  const limits = (key: SettingKey) => {
    const spec = overrides[key];
    return spec?.type === 'int' ? { min: spec.min, max: spec.max } : {};
  };
  // The limits as hint text, e.g. " · 1,000 to 250,000" or " · at least 2".
  const range = (key: SettingKey) => {
    const { min, max } = limits(key);
    if (min !== undefined && max !== undefined) return ` · ${numberFormat.format(min)} to ${numberFormat.format(max)}`;
    if (min !== undefined) return ` · at least ${numberFormat.format(min)}`;
    return max === undefined ? '' : ` · at most ${numberFormat.format(max)}`;
  };
  // Without limits from /presets, a seed is any 32-bit unsigned number.
  const { min: seedMin = 0, max: seedMax = 2 ** 32 - 1 } = limits('seed');

  // Quick picks outside the runner's limits for the setting are left out.
  const chips = (key: SettingKey, picks: number[]) => {
    const { min = -Infinity, max = Infinity } = limits(key);
    return (
      <div className="sd-chips">
        {picks
          .filter((pick) => min <= pick && pick <= max)
          .map((pick) => (
            <button key={pick} className={Number(form.text[key]) === pick ? 'on' : ''} onClick={() => setText(key)(String(pick))}>
              {compactNumber.format(pick)}
            </button>
          ))}
      </div>
    );
  };

  return (
    <section className="nr-step">
      <h2>Search</h2>
      <p className="desc">Size and length of the run.</p>
      <div className="sd">
        <div className="sd-tile">
          <span className="sd-l">Islands</span>
          <IslandStepper form={form} islandCounts={islandCounts} patch={patch} />
          <small>Each evolves its own population</small>
        </div>
        <NumberTile
          id="f-budget"
          label="Evaluation budget"
          value={form.text.evaluation_budget}
          onChange={setText('evaluation_budget')}
          error={errors.evaluation_budget}
          hint={`Shared across all islands${range('evaluation_budget')}`}
        >
          {chips('evaluation_budget', [10000, 25000, 50000, 100000, 250000])}
        </NumberTile>
        <NumberTile
          id="f-generations"
          label="Target generations"
          value={form.text.target_generations}
          onChange={setText('target_generations')}
          error={errors.target_generations}
          hint={`Guides population size, not a hard limit${range('target_generations')}`}
        >
          {chips('target_generations', [50, 100, 200, 500])}
        </NumberTile>
        <NumberTile
          id="f-seed"
          label="Runner seed"
          value={form.text.seed}
          onChange={setText('seed')}
          error={errors.seed}
          placeholder="Random"
          hint="Random picks a fresh seed for every run"
        >
          <div className="sd-chips">
            <button className={form.text.seed.trim() ? '' : 'on'} onClick={() => setText('seed')('')}>
              Random
            </button>
            <button onClick={() => setText('seed')(String(seedMin + Math.floor(Math.random() * (seedMax - seedMin + 1))))}>Roll one</button>
          </div>
        </NumberTile>
      </div>
    </section>
  );
}
