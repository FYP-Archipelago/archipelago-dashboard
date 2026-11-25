import Icon, { type IconName } from '@/components/Icon.tsx';
import { vars } from '@/style.ts';

import MenuButton, { type Menu } from './MenuButton.tsx';
import { HEIGHTS, type HeightMode } from './scene.ts';
import type { Change, Settings } from './settings.ts';

function HeightPanel({ settings, change }: { settings: Settings; change: Change }) {
  return (
    <>
      <div className="network-panel-title">Height shows</div>
      {(Object.keys(HEIGHTS) as HeightMode[]).map((mode) => (
        <button
          key={mode}
          className={`network-option${settings.height === mode ? ' network-option-on' : ''}`}
          onClick={() => change({ height: mode })}
        >
          <span className="network-option-check">{settings.height === mode && <Icon name="check" size={14} stroke={2} />}</span>
          <span className="network-row-text">
            {HEIGHTS[mode].label}
            <small>{HEIGHTS[mode].detail}</small>
          </span>
        </button>
      ))}
    </>
  );
}

function ToolButton({ icon, label, onClick }: { icon: IconName; label: string; onClick: () => void }) {
  return (
    <button className="network-tool" aria-label={label} title={label} onClick={onClick}>
      <Icon name={icon} size={16} />
    </button>
  );
}

const SHORTCUTS: [string, string][] = [
  ['Drag', 'Rotate'],
  ['Shift + Drag or Right-Drag', 'Pan'],
  ['Scroll', 'Zoom toward the pointer'],
  ['Click', 'Inspect a cluster'],
  ['Double-click', 'Fly to a cluster'],
  ['R', 'Reset the view'],
  ['F', 'Full screen'],
  ['Esc', 'Clear the selection'],
];

function HelpPanel() {
  return (
    <>
      <div className="network-panel-title">Moving around</div>
      <dl className="network-shortcuts">
        {SHORTCUTS.map(([keys, action]) => (
          <div key={keys}>
            <dt>{keys}</dt>
            <dd>{action}</dd>
          </div>
        ))}
      </dl>
      <hr />
      <p className="network-panel-hint">
        Each dot is a cluster of similar genomes, sized by how often the search evaluated it. Lines are search steps within an island; cyan arcs are
        migrants. Where islands overlap, their colours mix.
      </p>
    </>
  );
}

// Along the top of the stage: what height shows, grouping by island, node size, and the view tools.
export default function Toolbar({
  settings,
  change,
  menu,
  setMenu,
  fullScreen,
  onReset,
  onSave,
  onFullScreen,
}: {
  settings: Settings;
  change: Change;
  menu: Menu | null;
  setMenu: (menu: Menu | null) => void;
  fullScreen: boolean;
  onReset: () => void;
  onSave: () => void;
  onFullScreen: () => void;
}) {
  return (
    <div className="network-toolbar">
      <MenuButton
        open={menu === 'height'}
        onOpen={() => setMenu('height')}
        onClose={() => setMenu(null)}
        label="Height shows"
        className="network-glass network-height-menu"
        button={
          <>
            <span className="network-menu-caption">Height</span>
            {HEIGHTS[settings.height].label}
            <Icon name="chevD" size={13} />
          </>
        }
      >
        <HeightPanel settings={settings} change={change} />
      </MenuButton>
      <button
        className={`network-glass network-chip-button${settings.group ? ' network-chip-button-on' : ''}`}
        aria-pressed={settings.group}
        aria-label="Group by island"
        title="Lay each island out on its own patch, with migrations arching between them"
        onClick={() => change({ group: !settings.group })}
      >
        <Icon name="islands" size={16} />
        <span className="network-group-label">Group by island</span>
      </button>
      <label className="network-glass network-size" title="Node size">
        <Icon name="nodeSize" size={16} />
        <input
          type="range"
          aria-label="Node size"
          min={0.5}
          max={2}
          step={0.1}
          value={settings.nodeSize}
          style={vars({ '--fill': `${((settings.nodeSize - 0.5) / 1.5) * 100}%` })}
          onChange={(event) => change({ nodeSize: Number(event.target.value) })}
          onDoubleClick={() => change({ nodeSize: 1 })}
        />
        <b>{settings.nodeSize.toFixed(1)}×</b>
      </label>
      <div className="network-tools network-glass">
        <ToolButton icon="reset" label="Reset the view (R)" onClick={onReset} />
        <ToolButton icon="download" label="Save an image of this view" onClick={onSave} />
        <ToolButton icon={fullScreen ? 'shrink' : 'expand'} label={fullScreen ? 'Leave full screen (F)' : 'Full screen (F)'} onClick={onFullScreen} />
        <MenuButton
          open={menu === 'help'}
          onOpen={() => setMenu('help')}
          onClose={() => setMenu(null)}
          label="How to move around"
          className="network-help"
          align="end"
          button={<Icon name="help" size={16} />}
        >
          <HelpPanel />
        </MenuButton>
      </div>
    </div>
  );
}

// Which end of the height is which, on the right edge of the stage.
export function HeightScale({ height }: { height: HeightMode }) {
  const { top, bottom } = HEIGHTS[height];
  return (
    <div className={`network-scale${top ? '' : ' network-scale-off'}`} aria-hidden="true">
      <span>{top ?? ''}</span>
      <i />
      <span>{bottom ?? ''}</span>
    </div>
  );
}
