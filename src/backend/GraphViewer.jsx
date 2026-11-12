import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { mountStnViewer } from '../viewer/stn-viewer.js';
import { graphAtReplayProgress, replayOrder } from './graph-replay.js';
import '../viewer/stn-viewer.css';

export default function GraphViewer({ graph, runId, canReplay = false, maximising, mountViewer = mountStnViewer }) {
  const host = useRef(null),
    viewer = useRef(null);
  const [replaySlot] = useState(() => Object.assign(document.createElement('div'), { className: 'run-replay-slot' }));
  const [replay, setReplay] = useState(false),
    [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(1),
    [speed, setSpeed] = useState(1);
  const order = useMemo(() => replayOrder(graph), [graph]);
  const shown = useMemo(() => (replay ? graphAtReplayProgress(graph, order, progress) : graph), [graph, order, progress, replay]);
  const hasNodes = shown.nodes.size > 0;
  const [seen, setSeen] = useState({ runId, hasNodes, mountViewer, canReplay });
  if (seen.runId !== runId || seen.hasNodes !== hasNodes || seen.mountViewer !== mountViewer || seen.canReplay !== canReplay) {
    const remounted = seen.runId !== runId || seen.hasNodes !== hasNodes || seen.mountViewer !== mountViewer;
    setSeen({ runId, hasNodes, mountViewer, canReplay });
    if (remounted || !canReplay) {
      setReplay(false);
      setPlaying(false);
      setProgress(1);
    }
  }
  useEffect(() => {
    if (!host.current || !hasNodes) return;
    viewer.current = mountViewer(host.current);
    const foot = host.current.querySelector('.rail-foot');
    foot?.insertBefore(replaySlot, foot.querySelector('.hint'));
    return () => {
      viewer.current?.destroy();
      viewer.current = null;
    };
  }, [runId, hasNodes, mountViewer, replaySlot]);
  useEffect(() => {
    viewer.current?.setBackendGraph(shown, { maximising });
  }, [shown, runId, maximising]);
  useEffect(() => {
    if (!playing || !replay) return;
    const timer = setTimeout(() => {
      const next = Math.min(1, progress + speed / 150);
      setProgress(next);
      if (next >= 1) setPlaying(false);
    }, 200);
    return () => clearTimeout(timer);
  }, [playing, replay, speed, progress]);
  const startReplay = () => {
    setReplay(true);
    setPlaying(false);
    setProgress(0);
    const root = host.current;
    const set = (id, on) => {
      const button = root?.querySelector(`#${id}`);
      if (button && (button.getAttribute('aria-pressed') === 'true') !== on) button.click();
    };
    set('b-group', true);
    set('t-edges', true);
    set('mig-all', true);
    set('include-hidden-migrations', true);
  };
  return (
    <div className="backend-viz-wrap">
      {canReplay &&
        createPortal(
          <div className={`run-replay${replay ? ' active' : ' idle'}`} aria-label="Run replay controls">
            {!replay ? (
              <button className="secondary" type="button" onClick={startReplay} disabled={!graph.nodes.size}>
                Replay run
              </button>
            ) : (
              <>
                <button
                  className="secondary"
                  type="button"
                  onClick={() => {
                    if (progress >= 1) setProgress(0);
                    setPlaying(!playing);
                  }}
                >
                  {playing ? 'Pause' : 'Play'}
                </button>
                <button
                  className="secondary"
                  type="button"
                  onClick={() => {
                    setProgress(0);
                    setPlaying(false);
                  }}
                >
                  Restart
                </button>
                <label className="replay-position">
                  Progress{' '}
                  <input
                    name="replay-progress"
                    aria-label="Replay progress"
                    type="range"
                    min="0"
                    max="100"
                    value={Math.round(progress * 100)}
                    onChange={(event) => {
                      setPlaying(false);
                      setProgress(Number(event.target.value) / 100);
                    }}
                  />{' '}
                  <output>{Math.round(progress * 100)}%</output>
                </label>
                <label>
                  Speed{' '}
                  <select name="replay-speed" aria-label="Replay speed" value={speed} onChange={(event) => setSpeed(Number(event.target.value))}>
                    <option value="0.25">0.25×</option>
                    <option value="0.5">0.5×</option>
                    <option value="1">1×</option>
                    <option value="2">2×</option>
                    <option value="4">4×</option>
                  </select>
                </label>
                <button
                  className="secondary replay-full"
                  type="button"
                  onClick={() => {
                    setPlaying(false);
                    setReplay(false);
                    setProgress(1);
                  }}
                >
                  Show full graph
                </button>
                <span className="replay-note">Illustrative order by first evaluation; migration timing is unavailable.</span>
              </>
            )}
          </div>,
          replaySlot
        )}
      <div className="backend-viz-stage">
        <div className="viewer-host backend-stn-host" ref={host} aria-label="Archipelago backend graph" />
        {!hasNodes && (
          <p className="notice" role="status">
            No graph nodes available yet.
          </p>
        )}
      </div>
    </div>
  );
}
