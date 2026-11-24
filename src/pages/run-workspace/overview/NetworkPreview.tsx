import { useEffect, useMemo, useRef, useState } from 'react';

import Icon from '@/components/Icon.tsx';
import HoverTip, { hoverStore } from '@/pages/run-workspace/network/HoverTip.tsx';
import { createRenderer, type Renderer } from '@/pages/run-workspace/network/renderer.ts';
import { buildScene } from '@/pages/run-workspace/network/scene.ts';
import { DEFAULT_SETTINGS } from '@/pages/run-workspace/network/settings.ts';
import { HeightScale } from '@/pages/run-workspace/network/Toolbar.tsx';
import { navigate, runHref } from '@/route.ts';

import OverviewCard from './OverviewCard.tsx';
import { plural, type OverviewData } from './overview.ts';

import '@/pages/run-workspace/network/network.css';
import './network-preview.css';

// The wheel scrolls the page until the reader clicks in, then zooms until the pointer leaves.
// Capture phase, so the canvas never sees a blocked wheel.
function useWheelGate() {
  const ref = useRef<HTMLDivElement>(null);
  const [engaged, setEngaged] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      if (!engaged) event.stopPropagation();
    };
    element.addEventListener('wheel', onWheel, { capture: true });
    return () => element.removeEventListener('wheel', onWheel, { capture: true });
  }, [engaged]);
  return { ref, engaged, onPointerDown: () => setEngaged(true), onPointerLeave: () => setEngaged(false) };
}

// The Network tab's 3D view, heights set to best fitness.
function Orbit({ data }: { data: OverviewData }) {
  const { result, run } = data;
  const scene = useMemo(() => buildScene(result.graph, result.run.islands, result.run.maximising), [result]);
  const canvas = useRef<HTMLCanvasElement>(null);
  const overlay = useRef<HTMLCanvasElement>(null);
  const renderer = useRef<Renderer | null>(null);
  const [hover] = useState(hoverStore);
  const [supported, setSupported] = useState(true);
  const { ref: gateRef, engaged, onPointerDown: engage, onPointerLeave: disengage } = useWheelGate();

  useEffect(() => {
    const created = createRenderer(canvas.current!, overlay.current!, {
      onHover: (node, x, y) => hover.set(node >= 0 ? { node, x, y } : null),
      onSelect: (node) => node >= 0 && navigate(`${runHref(run.run_id, 'network')}?cluster=${scene.ids[node]!}`),
      onTour: () => {},
    });
    if (!created) {
      setSupported(false);
      return;
    }
    renderer.current = created;
    created.setScene(scene);
    created.setSettings({ ...DEFAULT_SETTINGS, height: 'fitness', focusIsland: null, reveal: 1, selected: -1 });
    return () => {
      created.destroy();
      renderer.current = null;
    };
  }, [hover, scene, run.run_id]);

  return (
    <div ref={gateRef} className="preview-stage network-stage" onPointerDown={engage} onPointerLeave={disengage}>
      <canvas ref={canvas} className="network-canvas" aria-label="Search network in 3D: drag to rotate" />
      <canvas ref={overlay} className="network-overlay" />
      {supported ? (
        <>
          <HeightScale height="fitness" />
          <HoverTip scene={scene} store={hover} />
          <button className="preview-reset" title="Reset view" onClick={() => renderer.current?.resetView()}>
            <Icon name="reset" size={15} />
          </button>
        </>
      ) : (
        <p className="preview-unsupported">This browser can&apos;t draw the network (WebGL2 is unavailable).</p>
      )}
      <span className="preview-hint">{engaged ? 'Scroll to zoom · click a cluster to open it' : 'Drag to rotate · click to enable zoom'}</span>
    </div>
  );
}

export default function NetworkPreview({ data }: { data: OverviewData }) {
  const { graph } = data.result;
  return (
    <OverviewCard
      title="Network"
      subtitle={
        <>
          {plural(graph.nodes.id.length, 'cluster')} · {plural(graph.edges.id.length, 'search path')}
        </>
      }
      runId={data.run.run_id}
      tab="network"
      className="preview-card"
    >
      <Orbit data={data} />
    </OverviewCard>
  );
}
