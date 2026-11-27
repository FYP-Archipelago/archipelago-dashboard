import { useEffect, useState } from 'react';

import Icon from '@/components/Icon.tsx';
import { fitness, numberFormat } from '@/format.ts';
import { IslandSwatch } from '@/pages/run-workspace/shared.tsx';
import type { Graph } from '@/types.ts';

import MorphIcon, { PAUSE, PLAY } from './MorphIcon.tsx';
import type { TourState } from './renderer.ts';
import type { Scene } from './scene.ts';

import './inspector.css';

function CopyHash({ hash }: { hash: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1400);
    return () => clearTimeout(timer);
  }, [copied]);
  return (
    <button
      className="network-hash monospace"
      title="Copy genome hash"
      onClick={() => navigator.clipboard?.writeText(hash).then(() => setCopied(true))}
    >
      <span>{hash}</span>
      <Icon name={copied ? 'check' : 'copy'} size={13} />
    </button>
  );
}

function BestList({
  scene,
  hiddenIslands,
  tour,
  onTour,
  onPauseTour,
  onPick,
}: {
  scene: Scene;
  hiddenIslands: number[];
  tour: TourState | null;
  onTour: () => void;
  onPauseTour: () => void;
  onPick: (node: number) => void;
}) {
  const runBest = scene.runBest;
  const touringClass = (node: number) => (node === tour?.node ? ' network-best-touring' : '');
  return (
    <section className="network-inspector-section">
      <h3>Best solutions</h3>
      <div className="network-best-list">
        {runBest >= 0 && (
          <button className={`network-best network-best-run${touringClass(runBest)}`} onClick={() => onPick(runBest)}>
            <span className="network-best-mark network-best-mark-run" />
            <span className="network-best-text">
              Run best
              <small>
                Island {scene.islands[scene.slot[runBest]!]} · cluster #{scene.ids[runBest]}
                {scene.faded[runBest] ? <span className="network-best-faded"> · Faded</span> : null}
              </small>
            </span>
            <b>{fitness(scene.bestFitness[runBest] ?? null)}</b>
          </button>
        )}
        {scene.islandBest.map((node, k) => {
          const island = scene.islands[k]!;
          if (node < 0) return null;
          const hidden = hiddenIslands.includes(island);
          return (
            <button
              key={island}
              className={`network-best${hidden ? ' network-best-hidden' : ''}${node === runBest ? '' : touringClass(node)}`}
              onClick={() => onPick(node)}
              title={hidden ? 'Shows the island again' : undefined}
            >
              <IslandSwatch island={island} />
              <span className="network-best-text">
                Island {island}
                <small>
                  {numberFormat.format(scene.clusters[k]!)} clusters
                  {scene.faded[node] ? <span className="network-best-faded"> · Faded</span> : null}
                </small>
              </span>
              <b>{fitness(scene.bestFitness[node] ?? null)}</b>
            </button>
          );
        })}
      </div>
      <div className="network-tour-controls">
        <button
          className={`button network-tour${tour ? ' network-tour-on' : ''}`}
          onClick={tour ? onPauseTour : onTour}
          title={tour ? (tour.paused ? 'Continue the tour' : 'Pause the tour') : 'Visit each best in turn'}
        >
          {/* Fills across the button as the tour moves from stop to stop. */}
          <span className="network-tour-progress" style={{ transform: `scaleX(${tour?.progress ?? 0})` }} />
          <MorphIcon from={PLAY} to={PAUSE} on={!!tour && !tour.paused} />
          <span key={tour ? (tour.paused ? 'resume' : 'pause') : 'tour'} className="network-tour-label">
            {tour ? (tour.paused ? 'Resume tour' : 'Pause tour') : 'Tour the best solutions'}
          </span>
        </button>
        {tour && (
          <button className="button network-tour-stop" onClick={onTour} aria-label="Stop tour" title="Stop tour">
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
              <rect x="4" y="4" width="6" height="6" fill="currentColor" />
            </svg>
          </button>
        )}
      </div>
    </section>
  );
}

const percent = (share: number) => `${Math.round(share * 100)}%`;

function ClusterDetails({
  scene,
  graph,
  node,
  onPick,
  onFly,
  onClose,
}: {
  scene: Scene;
  graph: Graph;
  node: number;
  onPick: (node: number) => void;
  onFly: () => void;
  onClose: () => void;
}) {
  const nodes = graph.nodes;
  const island = nodes.island[node]!;
  const sharing = nodes.islands_sharing[node]!;
  const id = nodes.id[node]!;
  const migrations = graph.migrations.id.flatMap((_, k) => {
    const out = graph.migrations.source[k] === id;
    const into = graph.migrations.target[k] === id;
    if (!out && !into) return [];
    const other = scene.index.get(out ? graph.migrations.target[k]! : graph.migrations.source[k]!);
    return other === undefined ? [] : [{ out, other, count: graph.migrations.count[k]! }];
  });
  const weight = nodes.weight?.[node];
  return (
    <section className="network-inspector-section network-cluster" key={id}>
      <div className="network-cluster-head">
        <h3>
          <IslandSwatch island={island} />
          Cluster #{id}
        </h3>
        <button className="network-icon-button" aria-label="Clear the selection" title="Clear the selection (Esc)" onClick={onClose}>
          <Icon name="x" size={15} />
        </button>
      </div>
      <div className="network-badges">
        <span className="tag">Island {island}</span>
        {nodes.overall_best[node] && (
          <span className="tag network-badge-best">
            <span className="network-best-mark network-best-mark-run" />
            Run best
          </span>
        )}
        {nodes.island_best[node] && !nodes.overall_best[node] && (
          <span className="tag network-badge-best">
            <span className="network-best-mark" />
            Island best
          </span>
        )}
        {sharing > 1 && <span className="tag">Shared by {sharing} islands</span>}
        {nodes.faded[node] && <span className="tag">Faded</span>}
      </div>
      <dl className="key-value-list">
        <div>
          <dt>Best fitness</dt>
          <dd>{fitness(nodes.best_fitness[node] ?? null)}</dd>
        </div>
        <div>
          <dt>Mean fitness</dt>
          <dd>{fitness(nodes.mean_fitness[node] ?? null)}</dd>
        </div>
        <div title="The share of the run's evaluations that were better than this cluster's mean">
          <dt>Evaluations beating its mean</dt>
          <dd>{percent(nodes.fitness_percentile[node]!)}</dd>
        </div>
        <div>
          <dt>Evaluations</dt>
          <dd>{numberFormat.format(nodes.visits[node]!)}</dd>
        </div>
        <div>
          <dt>Distinct genomes</dt>
          <dd>{numberFormat.format(nodes.members[node]!)}</dd>
        </div>
        <div title="Evaluation indexes on its island">
          <dt>Evaluated from</dt>
          <dd>
            {numberFormat.format(nodes.first_eval[node]!)} → {numberFormat.format(nodes.last_eval[node]!)}
          </dd>
        </div>
        <div title="The cluster's mean evaluation as a share of its island's budget">
          <dt>Search progress</dt>
          <dd>{percent(nodes.progress[node]!)}</dd>
        </div>
        <div>
          <dt>Search steps in / out</dt>
          <dd>
            {nodes.in_degree[node]} / {nodes.out_degree[node]}
          </dd>
        </div>
        <div>
          <dt>Islands here</dt>
          <dd>
            {sharing} <span className="muted">of {scene.islands.length}</span>
          </dd>
        </div>
        {weight !== undefined && weight !== null && (
          <div title="DenStream's decaying weight for the cluster">
            <dt>DenStream weight</dt>
            <dd>{weight.toFixed(2)}</dd>
          </div>
        )}
      </dl>
      <div className="network-hash-row">
        <span className="muted">Genome hash</span>
        <CopyHash hash={nodes.genome_hash[node]!} />
      </div>
      {migrations.length > 0 && (
        <div className="network-cluster-migrations">
          <span className="muted">Migrations</span>
          {migrations.map(({ out, other, count }, k) => (
            <button key={k} className="network-cluster-link" onClick={() => onPick(other)}>
              <span className="network-cluster-link-direction">{out ? 'To' : 'From'}</span>
              <IslandSwatch island={nodes.island[other]!} />
              Cluster #{nodes.id[other]}
              <span className="muted">· island {nodes.island[other]}</span>
              <b>
                {count} {count === 1 ? 'migrant' : 'migrants'}
              </b>
            </button>
          ))}
        </div>
      )}
      <button className="button network-fly" onClick={onFly}>
        <Icon name="target" size={14} />
        Centre on cluster
      </button>
    </section>
  );
}

export default function Inspector({
  scene,
  graph,
  selected,
  hiddenIslands,
  tour,
  onTour,
  onPauseTour,
  onPick,
  onFly,
  onClose,
}: {
  scene: Scene;
  graph: Graph;
  selected: number;
  hiddenIslands: number[];
  tour: TourState | null;
  onTour: () => void;
  onPauseTour: () => void;
  onPick: (node: number) => void;
  onFly: (node: number) => void;
  onClose: () => void;
}) {
  return (
    <aside className="network-inspector">
      {selected >= 0 ? (
        <ClusterDetails scene={scene} graph={graph} node={selected} onPick={onPick} onFly={() => onFly(selected)} onClose={onClose} />
      ) : (
        <BestList scene={scene} hiddenIslands={hiddenIslands} tour={tour} onTour={onTour} onPauseTour={onPauseTour} onPick={onPick} />
      )}
    </aside>
  );
}
