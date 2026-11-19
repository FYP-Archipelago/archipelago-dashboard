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

export function Switch({ on }: { on: boolean }) {
  return <span className={`switch${on ? ' on' : ''}`} aria-hidden="true" />;
}
