import type { ReactNode } from 'react';

// A row of buttons of which one is on. `disabled` holds the reason, shown on hover.
export default function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  className = '',
}: {
  label: string;
  value: T;
  options: { key: T; label: ReactNode; disabled?: string }[];
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div className={`segmented-control ${className}`.trim()} role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.key}
          className={value === option.key ? 'on' : ''}
          aria-pressed={value === option.key}
          disabled={Boolean(option.disabled)}
          title={option.disabled}
          onClick={() => onChange(option.key)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
