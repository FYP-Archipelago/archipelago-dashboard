import type { ReactNode } from 'react';

import { islandColor } from '@/colors.ts';
import Icon from '@/components/Icon.tsx';
import { numberFormat } from '@/format.ts';

import { PathsPanel, RoutesPanel } from './LayerPanels.tsx';
import MenuButton, { type Menu } from './MenuButton.tsx';
import type { Layers } from './renderer.ts';
import type { Scene } from './scene.ts';
import type { Change, Settings } from './settings.ts';

import './legend.css';

const LAYERS: { key: keyof Layers; label: string; title: string }[] = [
  { key: 'paths', label: 'Search paths', title: 'Steps from parent to child within an island' },
  { key: 'migrations', label: 'Migrations', title: 'Migrants moving between clusters of different islands' },
  { key: 'islandBests', label: 'Island bests', title: 'Each island’s best cluster' },
  { key: 'runBest', label: 'Run best', title: 'The run’s best cluster' },
  { key: 'shared', label: 'Shared', title: 'Ring the clusters more than one island reached, and dim the rest' },
];

// A small drawing of how each layer looks on the stage, so the legend can double as the layer switches.
function LayerGlyph({ layer }: { layer: keyof Layers }) {
  // Lines need the full width; the single marks get a box as narrow as they are, so their labels sit as close.
  const line = layer === 'paths' || layer === 'migrations';
  return (
    <svg className="network-glyph" width={line ? 22 : 14} height="14" viewBox={line ? '0 0 22 14' : '4 0 14 14'} aria-hidden="true">
      {layer === 'paths' && (
        <>
          <path d="M3 10 L11 4 L19 9" stroke="#8fb7e8" strokeWidth="1.3" fill="none" opacity="0.8" />
          <circle cx="3" cy="10" r="2" fill="#3987e5" />
          <circle cx="11" cy="4" r="2.4" fill="#3987e5" />
          <circle cx="19" cy="9" r="1.8" fill="#3987e5" />
        </>
      )}
      {layer === 'migrations' && <path d="M2 11 Q11 -2 20 11" stroke="#00e5ff" strokeWidth="1.6" fill="none" />}
      {layer === 'islandBests' && <circle cx="11" cy="7" r="4.6" stroke="#fff" strokeWidth="1.8" fill="none" />}
      {layer === 'runBest' && <path d="M11 1.5 L16.5 7 L11 12.5 L5.5 7 Z" fill="#fff" />}
      {layer === 'shared' && (
        <>
          <circle cx="11" cy="7" r="5" stroke="#ededed" strokeWidth="1.3" fill="none" />
          <circle cx="11" cy="7" r="2.6" fill="#c98500" />
        </>
      )}
    </svg>
  );
}

// The islands as a row of coloured dots: click one to hide or show it, hover one to pick it out on the stage.
function IslandDots({
  scene,
  settings,
  change,
  onFocusIsland,
}: {
  scene: Scene;
  settings: Settings;
  change: Change;
  onFocusIsland: (island: number | null) => void;
}) {
  const hidden = new Set(settings.hiddenIslands);
  const toggle = (island: number) => {
    const next = hidden.has(island) ? settings.hiddenIslands.filter((other) => other !== island) : [...settings.hiddenIslands, island];
    // A hidden island cannot stay picked out; hiding the last one would leave an empty stage, so it shows them all.
    if (!hidden.has(island)) onFocusIsland(null);
    change({ hiddenIslands: next.length === scene.islands.length ? [] : next });
  };
  return (
    <span className="network-island-row" role="group" aria-label="Islands">
      {scene.islands.map((island, k) => {
        const off = hidden.has(island);
        return (
          <button
            key={island}
            className={`network-island-dot${off ? ' network-island-dot-hidden' : ''}`}
            aria-pressed={!off}
            aria-label={`Island ${island}`}
            title={`Island ${island} · ${numberFormat.format(scene.clusters[k]!)} clusters`}
            onPointerEnter={() => !off && onFocusIsland(island)}
            onPointerLeave={() => onFocusIsland(null)}
            onClick={() => toggle(island)}
          >
            <i style={{ background: off ? undefined : islandColor(island) }} />
            <span>{island}</span>
          </button>
        );
      })}
    </span>
  );
}

// Along the bottom of the stage: the island dots, then the layer switches with their filters.
export default function Legend({
  scene,
  settings,
  change,
  onFocusIsland,
  menu,
  setMenu,
}: {
  scene: Scene;
  settings: Settings;
  change: Change;
  onFocusIsland: (island: number | null) => void;
  menu: Menu | null;
  setMenu: (menu: Menu | null) => void;
}) {
  const hasRoutes = scene.routes.length > 0;
  const shownRoutes = scene.routes.length - settings.hiddenRoutes.length;
  // The layers with a filter get a caret beside their switch, and the filter's state on it while it hides anything.
  const filters: Partial<Record<keyof Layers, { menu: Menu; label: string; badge: string | null; panel: ReactNode }>> = {
    paths: {
      menu: 'paths',
      label: 'Search path filter',
      badge: settings.minTraversals > 1 ? `${settings.minTraversals}+` : null,
      panel: <PathsPanel scene={scene} settings={settings} change={change} />,
    },
    migrations: {
      menu: 'routes',
      label: 'Migration routes',
      badge: settings.hiddenRoutes.length > 0 ? String(shownRoutes) : null,
      panel: <RoutesPanel scene={scene} settings={settings} change={change} />,
    },
  };
  return (
    <div className="network-layers network-glass" role="group" aria-label="Islands and layers">
      <IslandDots scene={scene} settings={settings} change={change} onFocusIsland={onFocusIsland} />
      <span className="network-layers-divider" />
      {LAYERS.filter((layer) => layer.key !== 'migrations' || hasRoutes).map((layer) => {
        const on = settings.layers[layer.key];
        const toggle = (
          <button
            key={layer.key}
            className={`network-layer${on ? '' : ' network-layer-off'}`}
            aria-pressed={on}
            title={layer.title}
            onClick={() => change({ layers: { ...settings.layers, [layer.key]: !on } })}
          >
            <LayerGlyph layer={layer.key} />
            {layer.label}
          </button>
        );
        const filter = filters[layer.key];
        if (!filter) return toggle;
        return (
          <span key={layer.key} className="network-layer-group">
            {toggle}
            <MenuButton
              open={menu === filter.menu}
              onOpen={() => setMenu(filter.menu)}
              onClose={() => setMenu(null)}
              label={filter.label}
              className={`network-layer-filter network-layer-filter-${filter.menu}`}
              button={
                <>
                  {filter.badge && <span className="network-layer-count">{filter.badge}</span>}
                  <Icon name="chevD" size={13} />
                </>
              }
            >
              {filter.panel}
            </MenuButton>
          </span>
        );
      })}
    </div>
  );
}
