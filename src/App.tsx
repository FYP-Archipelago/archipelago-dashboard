import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import './theme.css';
import './ui.css';
import { useEffect, useMemo, useState } from 'react';
import { api as defaultApi, type Api, type Preset } from './api.ts';
import { runsHref, useRoute } from './route.ts';
import RunsPage from './RunsPage.tsx';
import Sidebar from './Sidebar.tsx';
import { POLL_MS } from './usePoll.ts';

if (window.location.pathname === '/') window.history.replaceState(null, '', runsHref);

export default function App({ api = defaultApi }: { api?: Api }) {
  const route = useRoute();
  const [presetList, setPresetList] = useState<Preset[]>([]);
  // /presets goes through the runner, so it fails while the runner is down; retry until it answers.
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = () =>
      api.presets(controller.signal).then(setPresetList, () => {
        if (!controller.signal.aborted) timer = setTimeout(load, POLL_MS);
      });
    load();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [api]);
  const presets = useMemo(() => new Map(presetList.map((preset) => [preset.preset, preset])), [presetList]);
  return (
    <div className="app">
      <Sidebar api={api} route={route} />
      <main className="main">{route.name === 'runs' && <RunsPage api={api} presets={presets} />}</main>
    </div>
  );
}
