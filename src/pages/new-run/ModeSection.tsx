import { useEffect, useState } from 'react';

import { seeded } from './shared.ts';

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
    <div className="rp">
      <svg viewBox="0 0 170 96" aria-hidden="true">
        {PREVIEW_EDGES.map(([from, to]) => (
          <line
            key={to}
            className={`rp-edge${isShown(from) && isShown(to) ? ' on' : ''}`}
            x1={PREVIEW_NODES[from]!.x}
            y1={PREVIEW_NODES[from]!.y}
            x2={PREVIEW_NODES[to]!.x}
            y2={PREVIEW_NODES[to]!.y}
          />
        ))}
        {PREVIEW_NODES.map((node, i) => (
          <circle key={i} className={`rp-node${isShown(i) ? ' on' : ''}`} cx={node.x} cy={node.y} r={node.r} />
        ))}

        <rect className="rp-track" x={barX} y={80} width={barWidth} height={5} rx={2.5} />
        <rect className="rp-run" x={barX} y={80} width={Math.min(progress, RUN_END) * scale} height={5} rx={2.5} />
        {!stream && progress > RUN_END && (
          <rect
            className="rp-cluster"
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
              className={`rp-tick${node.at * RUN_END <= progress ? ' on' : ''}`}
              cx={barX + node.at * RUN_END * scale}
              cy={82.5}
              r={1.3}
            />
          ))}
      </svg>
      <span className="rp-status">{status}</span>
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
    <section className="nr-step">
      <h2>Mode</h2>
      <p className="desc">Watch the network grow, or wait for the final finished network.</p>
      <div className="radio-cards" role="radiogroup" aria-label="Mode">
        {[
          { stream: true, title: 'Live updates', text: 'Cluster as the run progresses and stream the network.' },
          { stream: false, title: 'Final result only', text: 'Cluster after complete run execution and see the final network.' },
        ].map((option) => (
          <button
            key={option.title}
            className={`radio-card mode-card${stream === option.stream ? ' on' : ''}`}
            role="radio"
            aria-checked={stream === option.stream}
            onClick={() => setStream(option.stream)}
          >
            <RunPreview stream={option.stream} progress={progress} />
            <span className="mode-text">
              <span className="rd" />
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
