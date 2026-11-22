import { useEffect, useState } from 'react';

import { seeded } from '@/pages/new-run/shared.ts';

import './mode.css';

type ModeProps = { stream: boolean; setStream: (stream: boolean) => void };

// One loop of the preview: the run takes 3.8 s, final-only clustering 0.9 s more, then it rests on the result for 2.5 s.
const CYCLE_MS = 7200;
// Where the run ends and where final-only clustering ends, as shares of the loop.
const RUN_END = 3800 / CYCLE_MS;
const CLUSTER_END = 4700 / CYCLE_MS;

// A small search network that the previews reveal; `at` is when each node is found, as a share of the run.
const PREVIEW_NODES = (() => {
  const random = seeded('updates-preview');
  return Array.from({ length: 15 }, (_, i) => ({ x: 14 + random() * 142, y: 10 + random() * 50, r: 2 + random() * 2.6, at: 0.04 + (i / 14) * 0.9 }));
})();

// Each node links to the nearest node found before it, so the network grows as a tree.
const PREVIEW_EDGES = (() => {
  const distance = (a: number, b: number) => Math.hypot(PREVIEW_NODES[a]!.x - PREVIEW_NODES[b]!.x, PREVIEW_NODES[a]!.y - PREVIEW_NODES[b]!.y);
  const edges: (readonly [number, number])[] = [];
  for (let node = 1; node < PREVIEW_NODES.length; node++) {
    let nearest = 0;
    for (let earlier = 1; earlier < node; earlier++) if (distance(earlier, node) < distance(nearest, node)) nearest = earlier;
    edges.push([nearest, node]);
  }
  return edges;
})();

// A run in miniature: the network you would see, over a bar of the run's progress.
function RunPreview({ stream, progress }: { stream: boolean; progress: number }) {
  const runShare = Math.min(1, progress / RUN_END);
  const isShown = stream ? (node: number) => PREVIEW_NODES[node]!.at <= runShare : () => progress >= CLUSTER_END;

  let status: string;
  if (stream) status = progress < RUN_END ? 'Running · network updating' : 'Done · network complete';
  else if (progress < RUN_END) status = 'Running · nothing to show yet';
  else status = progress < CLUSTER_END ? 'Clustering the whole run' : 'Done · network ready';

  const [barX, barWidth] = [10, 150];
  // The bar is the whole job: the run alone when live, the run then clustering when final-only, so both fill it.
  const scale = barWidth / (stream ? RUN_END : CLUSTER_END);

  return (
    <div className="run-preview">
      <svg viewBox="0 0 170 96" aria-hidden="true">
        {PREVIEW_EDGES.map(([from, to]) => (
          <line
            key={to}
            className={`run-preview-edge${isShown(from) && isShown(to) ? ' run-preview-edge-visible' : ''}`}
            x1={PREVIEW_NODES[from]!.x}
            y1={PREVIEW_NODES[from]!.y}
            x2={PREVIEW_NODES[to]!.x}
            y2={PREVIEW_NODES[to]!.y}
          />
        ))}
        {PREVIEW_NODES.map((node, i) => (
          <circle key={i} className={`run-preview-node${isShown(i) ? ' run-preview-node-visible' : ''}`} cx={node.x} cy={node.y} r={node.r} />
        ))}

        <rect className="run-preview-progress-track" x={barX} y={80} width={barWidth} height={5} rx={2.5} />
        <rect className="run-preview-running-progress" x={barX} y={80} width={Math.min(progress, RUN_END) * scale} height={5} rx={2.5} />
        {!stream && progress > RUN_END && (
          <rect
            className="run-preview-clustering-progress"
            x={barX + RUN_END * scale}
            y={80}
            width={(Math.min(progress, CLUSTER_END) - RUN_END) * scale}
            height={5}
            rx={2.5}
          />
        )}
        {stream &&
          PREVIEW_NODES.map((node, i) => (
            <circle
              key={`t${i}`}
              className={`run-preview-event-tick${node.at * RUN_END <= progress ? ' run-preview-event-tick-visible' : ''}`}
              cx={barX + node.at * RUN_END * scale}
              cy={82.5}
              r={1.3}
            />
          ))}
      </svg>
      <span className="run-preview-status">{status}</span>
    </div>
  );
}

// Each mode card plays what you would see with it, in step with the other.
export default function ModeSection({ stream, setStream }: ModeProps) {
  // Progress through the simulated run, looping; it stays at the end when motion is reduced.
  const [progress, setProgress] = useState(1);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const start = performance.now();
    const timer = window.setInterval(() => setProgress(((performance.now() - start) % CYCLE_MS) / CYCLE_MS), 70);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <section className="new-run-step">
      <h2>Mode</h2>
      <p className="new-run-step-description">Watch the network grow, or wait for the final finished network.</p>
      <div className="radio-cards" role="radiogroup" aria-label="Mode">
        {[
          { stream: true, title: 'Live updates', text: 'Cluster as the run progresses and stream the network.' },
          { stream: false, title: 'Final result only', text: 'Cluster after complete run execution and see the final network.' },
        ].map((option) => (
          <button
            key={option.title}
            className={`radio-card mode-card${stream === option.stream ? ' mode-card-on' : ''}`}
            role="radio"
            aria-checked={stream === option.stream}
            onClick={() => setStream(option.stream)}
          >
            <RunPreview stream={option.stream} progress={progress} />
            <span className="mode-text">
              <span className="mode-radio-indicator" />
              <span>
                <strong>{option.title}</strong>
                <span>{option.text}</span>
              </span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
