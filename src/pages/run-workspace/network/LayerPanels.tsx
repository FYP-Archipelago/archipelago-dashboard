import { islandColor } from '@/colors.ts';
import { numberFormat } from '@/format.ts';
import { IslandSwatch, routeKey } from '@/pages/run-workspace/shared.tsx';
import { vars } from '@/style.ts';

import type { Scene } from './scene.ts';
import type { Change, Settings } from './settings.ts';

export function PathsPanel({ scene, settings, change }: { scene: Scene; settings: Settings; change: Change }) {
  // Past a quarter of the busiest step the slider would hide nearly everything.
  const limit = Math.max(2, Math.min(24, Math.round(scene.maxTraversals * 0.25)));
  return (
    <>
      <div className="network-panel-title">Search paths</div>
      <label className="network-slider">
        <span className="network-slider-head">
          Keep paths used
          <b>{Math.min(settings.minTraversals, limit)}+ times</b>
        </span>
        <input
          type="range"
          min={1}
          max={limit}
          value={Math.min(settings.minTraversals, limit)}
          style={vars({ '--fill': `${((Math.min(settings.minTraversals, limit) - 1) / (limit - 1)) * 100}%` })}
          onChange={(event) => change({ minTraversals: Number(event.target.value) })}
        />
      </label>
      <p className="network-panel-hint">
        A path is used each time the search moves between its two clusters. Raise this to keep only the main routes.
      </p>
    </>
  );
}

// A mouse with its left button pressed, for the click hints.
function MouseClick() {
  return (
    <svg width="9" height="12" viewBox="0 0 9 12" aria-hidden="true">
      <rect x="0.75" y="0.75" width="7.5" height="10.5" rx="3.75" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path d="M4.5 0.75V5H0.75V4.5A3.75 3.75 0 0 1 4.5 0.75z" fill="currentColor" />
    </svg>
  );
}

// Island by island grid of routes; each cell turns its route on or off. Shift-click shows only that route.
export function RoutesPanel({ scene, settings, change }: { scene: Scene; settings: Settings; change: Change }) {
  const islands = scene.islands;
  const byKey = new Map(scene.routes.map((route) => [routeKey(route.source, route.destination), route]));
  const hidden = new Set(settings.hiddenRoutes);
  const toggle = (key: string, only: boolean) => {
    const all = scene.routes.map((route) => routeKey(route.source, route.destination));
    if (only) {
      const alreadyOnly = all.every((other) => (other === key) !== hidden.has(other));
      return change({ hiddenRoutes: alreadyOnly ? [] : all.filter((other) => other !== key) });
    }
    change({ hiddenRoutes: hidden.has(key) ? settings.hiddenRoutes.filter((other) => other !== key) : [...settings.hiddenRoutes, key] });
  };
  const most = Math.max(1, ...scene.routes.map((route) => route.migrants));
  return (
    <>
      <div className="network-panel-title network-panel-title-row">
        Migration routes
        <span>
          <button className="network-text-button" onClick={() => change({ hiddenRoutes: [] })}>
            All
          </button>
          <button
            className="network-text-button"
            onClick={() => change({ hiddenRoutes: scene.routes.map((route) => routeKey(route.source, route.destination)) })}
          >
            None
          </button>
        </span>
      </div>
      <div className="network-routes" style={{ gridTemplateColumns: `auto repeat(${islands.length}, 1fr)` }}>
        <span className="network-routes-corner">From ↓ To →</span>
        {islands.map((island) => (
          <span key={island} className="network-routes-axis">
            <IslandSwatch island={island} />
            {island}
          </span>
        ))}
        {islands.map((source) => (
          <div key={source} className="heat-row">
            <span className="network-routes-axis network-routes-axis-row">
              <IslandSwatch island={source} />
              {source}
            </span>
            {islands.map((destination) => {
              const key = routeKey(source, destination);
              const route = byKey.get(key);
              if (source === destination) return <span key={key} className="network-route network-route-same" />;
              if (!route) return <span key={key} className="network-route network-route-empty" />;
              const on = !hidden.has(key);
              return (
                <button
                  key={key}
                  className={`network-route${on ? ' network-route-on' : ''}`}
                  style={vars({ '--route': islandColor(source), '--strength': 0.35 + 0.65 * (route.migrants / most) })}
                  aria-pressed={on}
                  title={`Island ${source} → island ${destination}: ${numberFormat.format(route.migrants)} migrants`}
                  onClick={(event) => toggle(key, event.shiftKey)}
                >
                  {route.migrants}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <dl className="network-hints">
        <div>
          <dt>Hide or show a route</dt>
          <dd>
            <kbd>
              <MouseClick />
              Click
            </kbd>
          </dd>
        </div>
        <div>
          <dt>Show only that route</dt>
          <dd>
            <kbd>Shift</kbd>+
            <kbd>
              <MouseClick />
              Click
            </kbd>
          </dd>
        </div>
      </dl>
      <hr />
      <button
        className="network-switch-row"
        role="switch"
        aria-checked={settings.animateMigrations && !settings.group}
        disabled={settings.group}
        onClick={() => change({ animateMigrations: !settings.animateMigrations })}
      >
        <span className="network-row-text">
          Animate migrants
          <small>{settings.group ? 'Disabled while grouped by island' : 'Comets flow from source to destination'}</small>
        </span>
        <span className="network-switch" />
      </button>
    </>
  );
}
