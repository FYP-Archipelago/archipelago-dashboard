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
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        className={`input num${error ? ' invalid' : ''}`}
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
  preview?: boolean;
};

// A number typed straight into a sentence, on an underline that grows with it. Up and down arrows step it.
export function InlineNumber({ label, value, onChange, onStep, invalid, preview }: InlineNumberProps) {
  return (
    <input
      className={`inline-num num${invalid ? ' invalid' : ''}${preview ? ' preview' : ''}`}
      inputMode="numeric"
      aria-label={label}
      aria-invalid={invalid}
      value={value}
      spellCheck={false}
      style={{ width: `calc(${Math.max(2, value.length)}ch + 10px)` }}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={(event) => {
        const delta = { ArrowUp: 1, ArrowDown: -1 }[event.key];
        if (!delta) return;
        event.preventDefault();
        onStep(delta * (event.shiftKey ? 10 : 1));
      }}
    />
  );
}

export function Switch({ on }: { on: boolean }) {
  return <span className={`switch${on ? ' on' : ''}`} aria-hidden="true" />;
}
