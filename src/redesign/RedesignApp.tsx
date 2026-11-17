import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import './theme.css';

export default function RedesignApp() {
  return (
    <header className="rd-topbar">
      <img src="/favicon.svg" alt="" width="36" height="36" />
      <span className="rd-brand">Archipelago</span>
    </header>
  );
}
