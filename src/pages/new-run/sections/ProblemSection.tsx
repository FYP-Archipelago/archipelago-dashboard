import Icon from '@/components/Icon.tsx';
import { presetParts } from '@/format.ts';
import { presetSettings, type Form, type Patch } from '@/pages/new-run/form.ts';
import type { Preset } from '@/types.ts';

import BenchGlyph from './BenchGlyph.tsx';

import './problem.css';

const ALGORITHMS: Record<string, string> = {
  ga: 'Genetic Algorithm',
  de: 'Differential Evolution',
  es: 'Evolution Strategy',
  gp: 'Genetic Programming',
  pso: 'Particle Swarm',
};

export default function ProblemSection({ presets, form, patch }: { presets: Preset[]; form: Form; patch: Patch }) {
  return (
    <section className="new-run-step">
      <h2>Problem</h2>
      <p className="new-run-step-description">What to optimise, and with which algorithm. Optimal defaults come with each.</p>
      <div className="presets" role="radiogroup" aria-label="Problem">
        {presets.map((preset, index) => {
          const problem = presetParts(preset.preset).problem.replaceAll('_', ' ');
          const on = preset.preset === form.preset.preset;
          return (
            <button
              key={preset.preset}
              className={`preset-option${on ? ' preset-option-on' : ''}`}
              role="radio"
              aria-checked={on}
              title={preset.description}
              onClick={() => !on && patch(presetSettings(preset))}
            >
              <span className="preset-glyph">
                <BenchGlyph
                  benchmark={preset.benchmark}
                  instance={preset.preset}
                  variant={presets.slice(0, index).filter((other) => other.benchmark === preset.benchmark).length}
                />
              </span>
              <span className="preset-checkmark">
                <Icon name="check" size={13} stroke={2.4} />
              </span>
              <span className="preset-description">
                <strong>{problem}</strong>
                <small>{ALGORITHMS[preset.algorithm] ?? preset.algorithm.toUpperCase()}</small>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
