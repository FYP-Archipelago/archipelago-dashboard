import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from 'react';

import { useLiveGraph, type LiveGraphState } from '@/api/events.ts';
import { EmptyState, NoResult, type ResultQuery } from '@/pages/run-workspace/shared.tsx';
import type { Graph, Run, RunResult } from '@/types.ts';

import './network.css';

import type { Camera } from './camera.ts';
import HoverTip, { hoverStore } from './HoverTip.tsx';
import { saveNetworkImage } from './image.ts';
import Inspector from './Inspector.tsx';
import Legend from './Legend.tsx';
import type { Menu } from './MenuButton.tsx';
import { createRenderer, type Renderer, type TourState, type ViewSettings } from './renderer.ts';
import { buildScene, HEIGHTS } from './scene.ts';
import type { Settings } from './settings.ts';
import Timeline, { RetryCountdown } from './Timeline.tsx';
import Toolbar, { HeightScale } from './Toolbar.tsx';

type ViewProps = {
  settings: Settings;
  onSettingsChange: Dispatch<SetStateAction<Settings>>;
  cameraRef: RefObject<Camera | null>;
};

function Network({
  run,
  graph,
  result,
  live,
  settings,
  onSettingsChange,
  cameraRef,
}: { run: Run; graph: Graph; result: RunResult | null; live: LiveGraphState | null } & ViewProps) {
  const islands = useMemo(() => result?.run.islands ?? Array.from({ length: run.run_settings.num_islands }, (_, i) => i), [result, run]);
  // A live graph is only shown once updates are live, and those always say which way fitness points.
  const maximising = result?.run.maximising ?? live?.maximising ?? false;
  const routes = result?.migration_routes ?? live?.routes;
  const scene = useMemo(() => buildScene(graph, islands, maximising, routes ?? []), [graph, islands, maximising, routes]);
  const change = useCallback((patch: Partial<Settings>) => onSettingsChange((current) => ({ ...current, ...patch })), [onSettingsChange]);
  const [selectedId, setSelectedId] = useState<number | null>(() => {
    const asked = new URLSearchParams(window.location.search).get('cluster');
    return asked !== null && graph.nodes.id.includes(Number(asked)) ? Number(asked) : null;
  });
  const [focusIsland, setFocusIsland] = useState<number | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [progress, setProgress] = useState(1);
  const [fullScreen, setFullScreen] = useState(false);
  const [supported, setSupported] = useState(true);
  const [tour, setTour] = useState<TourState | null>(null);

  const workspace = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const overlay = useRef<HTMLCanvasElement>(null);
  const renderer = useRef<Renderer | null>(null);
  const [hover] = useState(hoverStore);
  const selected = selectedId === null ? -1 : (scene.index.get(selectedId) ?? -1);

  const selectNode = useEffectEvent((node: number) => setSelectedId(node >= 0 ? scene.ids[node]! : null));
  useEffect(() => {
    const created = createRenderer(
      canvas.current!,
      overlay.current!,
      {
        onHover: (node, x, y) => hover.set(node >= 0 ? { node, x, y } : null),
        onSelect: (node) => selectNode(node),
        onTour: setTour,
      },
      cameraRef.current ?? undefined
    );
    if (!created) {
      setSupported(false);
      return;
    }
    renderer.current = created;
    return () => {
      cameraRef.current = created.camera();
      created.destroy();
      renderer.current = null;
    };
  }, [hover, cameraRef]);

  const view = useMemo<ViewSettings>(() => ({ ...settings, focusIsland, reveal: progress, selected }), [settings, focusIsland, progress, selected]);
  useEffect(() => renderer.current?.setSettings(view), [view]);
  useEffect(() => renderer.current?.setScene(scene), [scene]);
  // A streamed run's final layout can differ from the live one, so when it finishes the view starts over on it.
  const wasLive = useRef(live !== null);
  useEffect(() => {
    if (wasLive.current && !live) renderer.current?.resetView();
    wasLive.current = live !== null;
  }, [live]);

  // A cluster asked for in the address (from the Migration tab's links) is flown to once the network is drawn.
  const askedFor = useRef(selectedId);
  useEffect(() => {
    if (askedFor.current === null) return;
    const node = scene.index.get(askedFor.current);
    askedFor.current = null;
    if (node !== undefined) setTimeout(() => renderer.current?.flyTo(node), 300);
  }, [scene]);

  useEffect(() => {
    const onChange = () => setFullScreen(document.fullscreenElement === workspace.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);
  const toggleFullScreen = () => (document.fullscreenElement ? document.exitFullscreen() : workspace.current?.requestFullscreen())?.catch(() => {});

  const pick = (node: number) => {
    const island = scene.islands[scene.slot[node]!]!;
    if (settings.hiddenIslands.includes(island)) change({ hiddenIslands: settings.hiddenIslands.filter((other) => other !== island) });
    if (scene.reveal[node]! > progress) setProgress(1);
    setSelectedId(scene.ids[node]!);
    renderer.current?.flyTo(node);
  };
  const toggleTour = () => {
    if (!tour) {
      setProgress(1);
      setSelectedId(null);
    }
    renderer.current?.toggleTour();
  };
  const save = () => {
    const snapshot = renderer.current?.snapshot();
    if (snapshot) void saveNetworkImage(snapshot, run, HEIGHTS[settings.height].label);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.metaKey || event.ctrlKey || event.altKey || (event.target as HTMLElement).closest('input, .network-panel')) return;
    const key = event.key.toLowerCase();
    if (key === 'escape') {
      setSelectedId(null);
      if (tour) renderer.current?.toggleTour();
    } else if (key === 'r') renderer.current?.resetView();
    else if (key === 'f') void toggleFullScreen();
    else return;
    event.preventDefault();
  };

  return (
    <div ref={workspace} className={`card network-workspace${fullScreen ? ' network-workspace-full' : ''}`}>
      <div
        ref={stage}
        className="network-stage"
        tabIndex={0}
        onKeyDown={onKeyDown}
        onPointerDown={() => stage.current?.focus({ preventScroll: true })}
      >
        <canvas ref={canvas} className="network-canvas" aria-label="Search network: drag to rotate, scroll to zoom, click a cluster to inspect it" />
        <canvas ref={overlay} className="network-overlay" />
        {!supported && <EmptyState icon="alert" title="This browser can't draw the network (WebGL2 is unavailable)" />}
        {supported && (
          <>
            <Toolbar
              settings={settings}
              change={change}
              menu={menu}
              setMenu={setMenu}
              fullScreen={fullScreen}
              onReset={() => renderer.current?.resetView()}
              onSave={save}
              onFullScreen={() => void toggleFullScreen()}
            />
            <HeightScale height={settings.height} />
            <Legend scene={scene} settings={settings} change={change} onFocusIsland={setFocusIsland} menu={menu} setMenu={setMenu} />
            <HoverTip scene={scene} store={hover} />
          </>
        )}
      </div>
      <Inspector
        scene={scene}
        graph={graph}
        selected={selected}
        hiddenIslands={settings.hiddenIslands}
        tour={tour}
        onTour={toggleTour}
        onPauseTour={() => renderer.current?.pauseTour()}
        onPick={pick}
        onFly={(node) => renderer.current?.flyTo(node)}
        onClose={() => setSelectedId(null)}
      />
      <Timeline
        scene={scene}
        progress={progress}
        onProgress={setProgress}
        live={live}
        evaluations={result ? result.clustering.counts.evaluations : null}
      />
    </div>
  );
}

const STREAMING: Run['status'][] = ['queued', 'running', 'clustering'];

export default function NetworkTab({ run, result, ...view }: { run: Run; result: ResultQuery } & ViewProps) {
  const streaming = run.stream && STREAMING.includes(run.status) && !result.data;
  const live = useLiveGraph(run.run_id, streaming);
  if (result.data) return <Network run={run} graph={result.data.graph} result={result.data} live={null} {...view} />;
  if (live.graph?.nodes.id.length) return <Network run={run} graph={live.graph} result={null} live={live} {...view} />;
  if (streaming && live.connection === 'lost')
    return (
      <EmptyState icon="cloudOff" title="Connection to the run lost">
        <RetryCountdown live={live} />
      </EmptyState>
    );
  if (streaming)
    return <EmptyState icon="spinner" title={live.connection === 'reconnecting' ? 'Reconnecting to the run' : 'Waiting for the first clusters'} />;
  return <NoResult run={run} result={result} />;
}
