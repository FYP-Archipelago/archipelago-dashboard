import { useEffect, useEffectEvent, useState } from 'react';

import type { LiveGraphState } from '@/api/events.ts';
import { useNow } from '@/clock.ts';
import { numberFormat } from '@/format.ts';
import { vars } from '@/style.ts';

import MorphIcon, { PAUSE, PLAY } from './MorphIcon.tsx';
import type { Scene } from './scene.ts';

import './timeline.css';

// A full replay takes 20 seconds at 1×.
const REPLAY_SECONDS = 20;
const SPEEDS = [0.5, 1, 2, 4];

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
        <MorphIcon from={PLAY} to={PAUSE} on={playing} />
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
