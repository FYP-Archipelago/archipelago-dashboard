import { useEffect, useRef, useState, type ReactNode } from 'react';

import Icon from '@/components/Icon.tsx';

import { ISLAND_COLORS, vars } from './shared.ts';

import './start.css';

export type StartPhase = 'idle' | 'busy' | 'done' | 'failed';

type StartProps = { phase: StartPhase; disabled: boolean; onLaunch: () => void };

type Burst = { id: number; x: number; y: number };

export default function StartButton({ phase, disabled, onLaunch }: StartProps) {
  const [bursts, setBursts] = useState<Burst[]>([]);
  const [launching, setLaunching] = useState(false);
  const timers = useRef<number[]>([]);

  useEffect(() => () => timers.current.forEach((timer) => window.clearTimeout(timer)), []);

  const later = (ms: number, run: () => void) => timers.current.push(window.setTimeout(run, ms));

  const launch = (button: HTMLElement) => {
    if (launching) return;
    setLaunching(true);
    const id = performance.now() + Math.random();
    later(150, () => setBursts((list) => [...list, { id, x: button.clientWidth / 2, y: button.clientHeight / 2 }]));
    later(1050, () => setBursts((list) => list.filter((burst) => burst.id !== id)));
    later(400, () => {
      setLaunching(false);
      onLaunch();
    });
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
        <span className="start-arrow">
          <Icon name="arrowR" size={14} stroke={2} />
        </span>
        Start Run
      </>
    );

  return (
    // The burst sits beside the button, not in it, so the button's dimming and scaling while it starts do not touch it.
    <div className="start-wrap">
      <button
        className={`btn btn-primary start phase-${phase}${launching ? ' launching' : ''}`}
        disabled={disabled}
        onClick={(event) => launch(event.currentTarget)}
      >
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
