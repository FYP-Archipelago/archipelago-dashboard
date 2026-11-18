import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import './theme.css';
import './ui.css';
import { runsHref, useRoute } from './route.ts';
import RunsPage from './RunsPage.tsx';
import Sidebar from './Sidebar.tsx';

if (window.location.pathname === '/') window.history.replaceState(null, '', runsHref);

export default function App() {
  const route = useRoute();
  return (
    <div className="app">
      <Sidebar route={route} />
      <main className="main">{route.name === 'runs' && <RunsPage />}</main>
    </div>
  );
}
