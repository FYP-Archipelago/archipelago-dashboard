import type { ViewSettings } from './renderer.ts';

// What the reader sets. The tab adds the hovered island, the replay position and the selection to make the view.
export type Settings = Omit<ViewSettings, 'focusIsland' | 'reveal' | 'selected'>;

export type Change = (patch: Partial<Settings>) => void;

export const DEFAULT_SETTINGS: Settings = {
  height: 'fitness',
  group: false,
  hiddenIslands: [],
  layers: { paths: true, migrations: true, islandBests: true, runBest: true, shared: false },
  hiddenRoutes: [],
  minTraversals: 1,
  animateMigrations: true,
};
