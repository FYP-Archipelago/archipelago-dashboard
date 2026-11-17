import { createRoot } from 'react-dom/client';

// Each design loads its own chunk and CSS, so the old global styles never reach /new.
// The imports sit in separate functions: in one ternary, Vite's build attached the
// second import's CSS to both branches.
const loadNew = () => import('./redesign/RedesignApp.jsx');
const loadLegacy = () => import('./legacy-app.js');
const app = /^\/new(\/|$)/.test(window.location.pathname) ? loadNew() : loadLegacy();

const root = import.meta.hot?.data.root || createRoot(document.getElementById('root'));
if (import.meta.hot) import.meta.hot.data.root = root;
app.then(({ default: App }) => root.render(<App />));
