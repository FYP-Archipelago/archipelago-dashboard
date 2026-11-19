import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';

import Icon from '@/components/Icon.tsx';

import { ISLAND_COLORS, vars } from './shared.ts';

import './start.css';

export type StartPhase = 'idle' | 'busy' | 'done' | 'failed';

type StartProps = { phase: StartPhase; disabled: boolean; islands: number; onLaunch: () => void };

type Burst = { id: number; x: number; y: number };

// Hold to launch: a fill charges across the button while the islands light up, then the run starts with a burst.
export default function StartButton({ phase, disabled, islands, onLaunch }: StartProps) {
  const [bursts, setBursts] = useState<Burst[]>([]);
  const [charge, setCharge] = useState(0);
  const chargeFrame = useRef(0);

  useEffect(() => () => cancelAnimationFrame(chargeFrame.current), []);

  const launch = (button: HTMLElement) => {
    const id = performance.now() + Math.random();
    setBursts((list) => [...list, { id, x: button.clientWidth / 2, y: button.clientHeight / 2 }]);
    window.setTimeout(() => setBursts((list) => list.filter((burst) => burst.id !== id)), 900);
    onLaunch();
  };

  const startHold = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0 || disabled) return;

    const button = event.currentTarget;
    const pressedAt = performance.now();
    const tick = (now: number) => {
      // A full charge takes 650 ms.
      const charged = Math.min(1, (now - pressedAt) / 650);
      setCharge(charged);
      if (charged < 1) chargeFrame.current = requestAnimationFrame(tick);
      else {
        setCharge(0);
        launch(button);
      }
    };
    chargeFrame.current = requestAnimationFrame(tick);
  };

  const cancelHold = () => {
    cancelAnimationFrame(chargeFrame.current);
    setCharge(0);
  };

  const islandColour = (i: number) => ISLAND_COLORS[i % ISLAND_COLORS.length]!;

  let content: ReactNode;
  if (phase === 'done')
    content = (
      <>
        <svg className="start-check" width="15" height="15" viewBox="0 0 24 24" aria-hidden="true">
          <path d="m5 12 5 5L20 7" pathLength={1} />
        </svg>
        Run started
      </>
    );
  else if (phase === 'failed')
    content = (
      <>
        <Icon name="alert" size={15} />
        Couldn’t start
      </>
    );
  else if (phase === 'busy')
    content = (
      <>
        <span className="start-spin" aria-hidden="true" />
        Starting…
      </>
    );
  else
    content = (
      <>
        <span className="hold-dots" aria-hidden="true">
          {Array.from({ length: islands }, (_, i) => (
            <i key={i} className={charge > i / islands ? 'lit' : ''} style={vars({ '--c': islandColour(i) })} />
          ))}
        </span>
        {charge > 0 ? 'Keep holding…' : 'Hold to Start Run'}
      </>
    );

  return (
    // The burst sits beside the button, not in it, so the button's dimming and scaling while it starts do not touch it.
    <div className="start-wrap">
      <button
        className={`btn btn-primary start phase-${phase}${charge > 0 ? ' holding' : ''}`}
        disabled={disabled}
        style={vars({ '--hold': charge })}
        onPointerDown={startHold}
        onPointerUp={cancelHold}
        onPointerLeave={cancelHold}
        onPointerCancel={cancelHold}
        // Keyboard presses arrive as clicks with no pointer, so they launch straight away.
        onClick={(event) => event.detail === 0 && launch(event.currentTarget)}
      >
        {phase === 'idle' && (
          <span className="hold-clip" aria-hidden="true">
            <span className="hold-fill" />
          </span>
        )}
        <span className="start-content" key={phase}>
          {content}
        </span>
      </button>
      {bursts.map((burst) => (
        <span key={burst.id} className="burst" style={{ left: burst.x, top: burst.y }} aria-hidden="true">
          <span className="burst-ring" />
          {[...Array(14).keys()].map((i, _, all) => {
            const angle = (i / all.length) * 2 * Math.PI + (i % 2) * 0.2;
            const reach = 46 + (i % 3) * 18;
            return (
              <i
                key={i}
                style={vars({
                  '--dx': `${(Math.cos(angle) * reach).toFixed(1)}px`,
                  '--dy': `${(Math.sin(angle) * reach * 0.7).toFixed(1)}px`,
                  '--c': islandColour(i),
                })}
              />
            );
          })}
        </span>
      ))}
    </div>
  );
}
