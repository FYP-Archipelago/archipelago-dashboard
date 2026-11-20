import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';

import './theme.css';
import './ui.css';

import Sidebar from './components/Sidebar.tsx';
import NewRunPage from './pages/new-run/NewRunPage.tsx';
import RunWorkspace from './pages/run-workspace/RunWorkspace.tsx';
import RunsPage from './pages/runs/RunsPage.tsx';
import { runsHref, useRoute } from './route.ts';

if (window.location.pathname === '/') window.history.replaceState(null, '', runsHref);

export default function App() {
  const route = useRoute();
  return (
    <div className="app">
      <Sidebar route={route} />
      <main className="main">
        {route.name === 'runs' && <RunsPage />}
        {route.name === 'new' && <NewRunPage />}
        {/* Keyed by run, so moving to another run starts from fresh view state. */}
        {route.name === 'run' && <RunWorkspace key={route.id} id={route.id} tab={route.tab} />}
      </main>
    </div>
  );
}
