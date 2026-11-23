import { arrowStep } from '@/pages/new-run/shared.ts';

export type FieldProps = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
  placeholder?: string;
  decimal?: boolean;
  disabled?: boolean;
};

export function NumberField({ id, label, value, onChange, error, hint, placeholder, decimal, disabled }: FieldProps) {
  return (
    <div className="new-run-field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        className={`input numeric${error ? ' new-run-input-invalid' : ''}`}
        inputMode={decimal ? 'decimal' : 'numeric'}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        aria-invalid={Boolean(error)}
        spellCheck={false}
        onChange={(event) => onChange(event.target.value)}
      />
      {error ? <span className="field-error">{error}</span> : hint && <small>{hint}</small>}
    </div>
  );
}

type InlineNumberProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onStep: (delta: number) => void;
  invalid?: boolean;
};

// A number typed straight into a sentence, on an underline that grows with it. Up and down arrows step it.
export function InlineNumber({ label, value, onChange, onStep, invalid }: InlineNumberProps) {
  return (
    <input
      className={`inline-number-input numeric${invalid ? ' new-run-input-invalid' : ''}`}
      inputMode="numeric"
      aria-label={label}
      aria-invalid={invalid}
      value={value}
      spellCheck={false}
      style={{ width: `calc(${Math.max(2, value.length)}ch + 10px)` }}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={(event) => {
        const delta = arrowStep(event, false);
        if (!delta) return;
        event.preventDefault();
        onStep(delta);
      }}
    />
  );
}

export function Switch({ on }: { on: boolean }) {
  return <span className={`new-run-switch${on ? ' new-run-switch-on' : ''}`} aria-hidden="true" />;
}
