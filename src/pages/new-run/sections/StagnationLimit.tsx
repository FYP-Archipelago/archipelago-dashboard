import { useRef, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';

import Icon from '@/components/Icon.tsx';
import type { Form, SetText } from '@/pages/new-run/form.ts';
import { arrowStep } from '@/pages/new-run/shared.ts';

type Props = { form: Form; error: string | undefined; setText: SetText; picks: ReactNode };

// A best-so-far line that improves, then runs flat; the flat stretch is the limit, ending in the stagnation X.
// The track spans the target run, so dragging the X along it sets the limit against the run's length.
export default function StagnationLimit({ form, error, setText, picks }: Props) {
  const track = useRef<HTMLDivElement>(null);
  const set = setText('termination.stagnation_generations');
  const text = form.text['termination.stagnation_generations'].trim();
  const limit = Number(text);
  const off = text !== '' && limit === 0;
  const valid = !error && Number.isInteger(limit) && limit > 0;
  const target = Number(form.text.target_generations);
  const span = Number.isInteger(target) && target >= 2 ? target : 200;
  const at = valid ? Math.min(limit / span, 1) * 100 : 0;

  const drag = (event: PointerEvent<HTMLDivElement>) => {
    const rect = track.current!.getBoundingClientRect();
    const fraction = Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1);
    set(String(Math.max(1, Math.round(fraction * span))));
  };
  const step = (event: KeyboardEvent<HTMLDivElement>) => {
    const delta = arrowStep(event, true);
    if (!delta) return;
    event.preventDefault();
    set(String(Math.min(Math.max(1, (valid ? limit : 0) + delta), span)));
  };

  return (
    <div className="search-setting-tile search-stagnation">
      <div className="search-stagnation-text">
        <label className="search-setting-label" htmlFor="f-stagnation">
          Stagnation limit
        </label>
        {error && <span className="field-error">{error}</span>}
      </div>
      <input
        id="f-stagnation"
        className={`search-setting-input numeric search-stagnation-input${off ? ' search-stagnation-input-off' : ''}${error ? ' search-setting-input-invalid' : ''}`}
        inputMode="numeric"
        value={off ? 'Off' : form.text['termination.stagnation_generations']}
        spellCheck={false}
        onFocus={(event) => off && event.target.select()}
        onChange={(event) => {
          const typed = event.target.value.trim();
          set(/^off$/i.test(typed) ? '0' : typed.replace(/^off/i, ''));
        }}
      />
      <div className={`stagnation-plot${off ? ' stagnation-plot-off' : ''}`}>
        <svg className="stagnation-plot-rise" viewBox="0 0 52 40" aria-hidden="true">
          <path d="M1,-5C8,8 24,17 52,18" />
          <circle cx="52" cy="18" r="2.5" />
        </svg>
        <div
          ref={track}
          className="stagnation-plot-track"
          role="slider"
          tabIndex={0}
          aria-label="Stagnation limit"
          aria-valuemin={1}
          aria-valuemax={span}
          aria-valuenow={valid ? limit : undefined}
          aria-valuetext={off ? 'Off' : undefined}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            event.currentTarget.dataset.dragging = 'true';
            drag(event);
          }}
          onPointerMove={(event) => event.currentTarget.hasPointerCapture(event.pointerId) && drag(event)}
          onPointerUp={(event) => delete event.currentTarget.dataset.dragging}
          onKeyDown={step}
        >
          <i className="stagnation-plot-flat" style={{ width: off ? '100%' : `${at}%` }} />
          {!off && (
            <>
              <i className="stagnation-plot-after" style={{ left: `${at}%` }} />
              <span className="stagnation-plot-cross" style={{ left: `${at}%` }}>
                <Icon name="x" size={14} stroke={3} />
              </span>
            </>
          )}
          {!off && valid && at >= 2 && <i className="stagnation-plot-span" style={{ width: `${at}%` }} />}
          <span className="stagnation-plot-meaning">
            {off
              ? 'No limit: islands run until their budget is spent'
              : valid
                ? `${limit} ${limit === 1 ? 'generation' : 'generations'} without improvement`
                : ''}
          </span>
          <span className="stagnation-plot-end">{span} target</span>
        </div>
      </div>
      <div className="search-setting-quick-picks">
        <button className={off ? 'search-setting-quick-pick-selected' : ''} onClick={() => set('0')}>
          Off
        </button>
        {picks}
      </div>
    </div>
  );
}
