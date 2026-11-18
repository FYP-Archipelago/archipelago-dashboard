import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import './theme.css';
import './ui.css';
import { api as defaultApi, type Api } from './api.ts';
import { BASE, runsHref, useRoute } from './route.ts';
import Sidebar from './Sidebar.tsx';

if (window.location.pathname.replace(/\/+$/, '') === BASE) window.history.replaceState(null, '', runsHref);

export default function RedesignApp({ api = defaultApi }: { api?: Api }) {
  const route = useRoute();
  return (
    <div className="app">
      <Sidebar api={api} route={route} />
      <main className="main" />
    </div>
  );
}
