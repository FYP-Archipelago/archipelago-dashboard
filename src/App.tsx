import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import './theme.css';
import './ui.css';
import NewRunPage from './pages/new-run/NewRunPage.tsx';
import { runsHref, useRoute } from './route.ts';
import RunsPage from './pages/runs/RunsPage.tsx';
import Sidebar from './components/Sidebar.tsx';

if (window.location.pathname === '/') window.history.replaceState(null, '', runsHref);

export default function App() {
  const route = useRoute();
  return (
    <div className="app">
      <Sidebar route={route} />
      <main className="main">
        {route.name === 'runs' && <RunsPage />}
        {route.name === 'new' && <NewRunPage />}
      </main>
    </div>
  );
}
