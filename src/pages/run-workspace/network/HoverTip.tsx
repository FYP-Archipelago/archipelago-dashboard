import { useSyncExternalStore } from 'react';

import { fitness, numberFormat } from '@/format.ts';
import { IslandSwatch } from '@/pages/run-workspace/shared.tsx';

import type { Scene } from './scene.ts';

type Hover = { node: number; x: number; y: number };

// The hovered cluster changes with every pointer move, so only the tooltip listens to it, not the whole tab.
export function hoverStore() {
  let hover: Hover | null = null;
  const listeners = new Set<() => void>();
  return {
    set(next: Hover | null) {
      hover = next;
      listeners.forEach((listener) => listener());
    },
    get: () => hover,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export default function HoverTip({ scene, store }: { scene: Scene; store: ReturnType<typeof hoverStore> }) {
  const hover = useSyncExternalStore(store.subscribe, store.get);
  if (!hover || hover.node >= scene.count) return null;
  const i = hover.node;
  const island = scene.islands[scene.slot[i]!]!;
  const sharing = Math.round(scene.shared[i]! * (scene.islands.length - 1)) + 1;
  return (
    <div className="hover-tip network-hover" style={{ left: hover.x + 16, top: hover.y + 16 }}>
      <div className="hover-tip-title">Cluster #{scene.ids[i]}</div>
      <div className="hover-tip-row">
        <IslandSwatch island={island} />
        Island {island}
        {sharing > 1 && <span className="muted">+{sharing - 1} more</span>}
      </div>
      <div className="hover-tip-row">
        Best fitness<b>{fitness(scene.bestFitness[i] ?? null)}</b>
      </div>
      <div className="hover-tip-row">
        Evaluations<b>{numberFormat.format(scene.visits[i]!)}</b>
      </div>
    </div>
  );
}
