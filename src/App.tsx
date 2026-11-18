import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import './theme.css';
import './ui.css';
import { useEffect, useState } from 'react';
import { api, type Preset } from './api.ts';
import { runsHref, useRoute } from './route.ts';
import RunsPage from './RunsPage.tsx';
import Sidebar from './Sidebar.tsx';
import { POLL_MS } from './usePoll.ts';

if (window.location.pathname === '/') window.history.replaceState(null, '', runsHref);

export default function App() {
  const route = useRoute();
  const [presets, setPresets] = useState<Preset[]>([]);
  // /presets goes through the runner, so it fails while the runner is down; retry until it answers.
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = () =>
      api.presets(controller.signal).then(setPresets, () => {
        if (!controller.signal.aborted) timer = setTimeout(load, POLL_MS);
      });
    load();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, []);
  return (
    <div className="app">
      <Sidebar route={route} />
      <main className="main">{route.name === 'runs' && <RunsPage presets={presets} />}</main>
    </div>
  );
}
