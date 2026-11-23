import { useEffect, useEffectEvent, useRef, useState } from 'react';

import type { LiveGraphState } from '@/api/events.ts';
import { useNow } from '@/clock.ts';
import { numberFormat } from '@/format.ts';
import { reducedMotion, vars } from '@/style.ts';

import type { Scene } from './scene.ts';

import './timeline.css';

// A full replay takes 20 seconds at 1×.
const REPLAY_SECONDS = 20;
const SPEEDS = [0.5, 1, 2, 4];

// The play triangle cut in two halves whose corners line up with the two pause bars', corner by corner (top left,
// top right, bottom right, bottom left), so one shape can slide into the other. On a 14px grid, so edges stay sharp.
const PLAY = [
  [
    [4, 2],
    [8.25, 4.5],
    [8.25, 9.5],
    [4, 12],
  ],
  [
    [8.25, 4.5],
    [12.5, 7],
    [12.5, 7],
    [8.25, 9.5],
  ],
];
const PAUSE = [
  [
    [3.4, 2],
    [5.6, 2],
    [5.6, 12],
    [3.4, 12],
  ],
  [
    [8.4, 2],
    [10.6, 2],
    [10.6, 12],
    [8.4, 12],
  ],
];

// Play morphs into pause and back, as YouTube's button does.
function PlayPauseIcon({ playing }: { playing: boolean }) {
  // 0 is play, 1 is pause.
  const [shown, setShown] = useState(playing ? 1 : 0);
  const at = useRef(shown);
  useEffect(() => {
    const from = at.current;
    const goal = playing ? 1 : 0;
    const start = performance.now();
    const duration = reducedMotion() ? 0 : 220;
    let frame = requestAnimationFrame(function step(now) {
      const t = duration ? Math.min(1, (now - start) / duration) : 1;
      at.current = from + (goal - from) * (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
      setShown(at.current);
      if (t < 1) frame = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(frame);
  }, [playing]);
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      {PLAY.map((half, h) => (
        <polygon
          key={h}
          points={half.map(([x, y], k) => `${x! + (PAUSE[h]![k]![0]! - x!) * shown},${y! + (PAUSE[h]![k]![1]! - y!) * shown}`).join(' ')}
          fill="currentColor"
          stroke="currentColor"
          strokeWidth="0.8"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}

// What the replay has reached so far; all of it once the replay is at the end or the run is live.
function Counts({ scene, progress, evaluations }: { scene: Scene; progress: number; evaluations: number | null }) {
  let clusters = 0;
  for (const reveal of scene.reveal) if (reveal <= progress) clusters++;
  let paths = 0;
  for (const reveal of scene.edges.reveal) if (reveal <= progress) paths++;
  let migrants = 0;
  scene.migrations.count.forEach((count, k) => {
    if (Math.max(scene.reveal[scene.migrations.a[k]!]!, scene.reveal[scene.migrations.b[k]!]!) <= progress) migrants += count;
  });
  return (
    <span className="network-counts">
      <span title={evaluations === null ? undefined : `Clustered from ${numberFormat.format(evaluations)} evaluations`}>
        <b>{numberFormat.format(clusters)}</b> clusters
      </span>
      <span title="Search steps between clusters">
        <b>{numberFormat.format(paths)}</b> paths
      </span>
      <span title={`Along ${numberFormat.format(scene.migrations.a.length)} links between clusters`}>
        <b>{numberFormat.format(migrants)}</b> migrants
      </span>
    </span>
  );
}

const CONNECTION: Record<LiveGraphState['connection'], { label: string; dot: 'open' | 'waiting' | 'lost' }> = {
  connecting: { label: 'Connecting…', dot: 'waiting' },
  open: { label: 'Live', dot: 'open' },
  reconnecting: { label: 'Reconnecting…', dot: 'waiting' },
  lost: { label: 'Connection lost', dot: 'lost' },
  closed: { label: 'Stream ended', dot: 'waiting' },
};

// When the next automatic retry is, with a button to retry straight away.
export function RetryCountdown({ live }: { live: LiveGraphState }) {
  const now = useNow(true);
  const seconds = live.retryAt === null ? 0 : Math.max(0, Math.ceil((live.retryAt - now) / 1000));
  return (
    <span className="network-retry">
      {seconds > 0 ? `Retrying in ${seconds}s` : 'Retrying…'}
      <button className="network-text-button" onClick={live.retry}>
        Retry now
      </button>
    </span>
  );
}

// Under the stage: the replay of a finished run, or the live status while the run streams.
export default function Timeline({
  scene,
  progress,
  onProgress,
  live,
  evaluations,
}: {
  scene: Scene;
  progress: number;
  onProgress: (progress: number) => void;
  live: LiveGraphState | null;
  evaluations: number | null;
}) {
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const now = useNow(Boolean(live));

  const advance = useEffectEvent((seconds: number) => {
    const next = Math.min(1, progress + (seconds / REPLAY_SECONDS) * speed);
    onProgress(next);
    if (next >= 1) setPlaying(false);
    return next < 1;
  });
  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    let last = performance.now();
    const step = (time: number) => {
      const going = advance((time - last) / 1000);
      last = time;
      if (going) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [playing]);

  if (live) {
    const updated = live.updatedAt ? ` · updated ${Math.max(0, Math.round((now - live.updatedAt) / 1000))}s ago` : '';
    return (
      <div key="live" className="network-timeline">
        <span className="network-live">
          <span className={`network-live-dot network-live-dot-${CONNECTION[live.connection].dot}`} />
          {CONNECTION[live.connection].label}
        </span>
        <span className="network-timeline-status muted">
          {live.connection === 'lost' ? (
            <RetryCountdown live={live} />
          ) : live.connection === 'reconnecting' ? (
            `Trying to reach the run again${updated}`
          ) : live.connection === 'open' ? (
            `Growing as evaluations are clustered${updated}`
          ) : (
            'Connecting to the run'
          )}
        </span>
        <Counts scene={scene} progress={1} evaluations={null} />
      </div>
    );
  }

  const toggle = () => {
    if (!playing && progress >= 1) onProgress(0);
    setPlaying(!playing);
  };
  return (
    <div key="replay" className="network-timeline">
      <button
        className="network-play"
        aria-label={playing ? 'Pause the replay' : 'Replay the run'}
        title={playing ? 'Pause' : 'Replay the run: clusters appear in the order the search found them'}
        onClick={toggle}
      >
        <PlayPauseIcon playing={playing} />
      </button>
      <span className="network-timeline-caption">{playing ? 'Replaying' : progress < 1 ? 'Paused' : 'Replay'}</span>
      <input
        type="range"
        aria-label="Replay position"
        min={0}
        max={1000}
        value={Math.round(progress * 1000)}
        style={vars({ '--fill': `${progress * 100}%` })}
        onChange={(event) => {
          setPlaying(false);
          onProgress(Number(event.target.value) / 1000);
        }}
      />
      <Counts scene={scene} progress={progress} evaluations={evaluations} />
      <button
        className="network-speed"
        aria-label={`Replay speed ${speed}×, click to change`}
        title="Replay speed"
        onClick={() => setSpeed(SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length]!)}
      >
        {speed}×
      </button>
    </div>
  );
}
