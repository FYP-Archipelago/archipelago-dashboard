import { Fragment, memo, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { api } from '@/api.ts';
import { adjectives, animals, colors, uniqueNamesGenerator } from 'unique-names-generator';
import Icon from '@/components/Icon.tsx';
import { navigate, runHref } from '@/route.ts';
import type { Clustering, NewRun, OverrideSpec, Preset, Presets, RunSettings } from '@/types.ts';
import Unavailable from '@/components/Unavailable.tsx';
import './newrun.css';

const ALGORITHMS: Record<string, string> = {
  ga: 'Genetic Algorithm',
  de: 'Differential Evolution',
  es: 'Evolution Strategy',
  gp: 'Genetic Programming',
  pso: 'Particle Swarm',
};

const TOPOLOGIES: Record<string, string> = {
  ring: 'Ring',
  bidirectional_ring: 'Bidirectional Ring',
  fully_connected: 'Fully Connected',
  lattice: 'Lattice',
  random: 'Random',
  star: 'Star',
  torus: 'Torus',
};

// Clustering stages in pipeline order.
const STAGES = [
  { key: 'lsh', label: 'LSH', text: 'Hashes genomes into buckets of near-duplicates. Fast first pass.' },
  { key: 'birch', label: 'BIRCH', text: 'Builds compact sub-clusters inside each bucket.' },
  { key: 'denstream', label: 'DenStream', text: 'Tracks density over time and fades stale regions.' },
] as const;

type Stage = (typeof STAGES)[number]['key'];

// The runner rejects a torus that collapses into a ring, which for 4 to 6 islands is anything but 6.
const TORUS_ISLANDS = 6;

// archipelago's clustering Config allows detail in this range.
const DETAIL_MIN = 0.5;
const DETAIL_MAX = 2;

const ISLAND_COLORS = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300'];
const NAME_MAX = 100;

const randomName = () => uniqueNamesGenerator({ dictionaries: [adjectives, colors, animals], separator: '-', length: 3 });

const number = new Intl.NumberFormat('en');

type Rule = { int?: boolean; min?: number; max?: number; above?: number; optional?: boolean };

function numberError(text: string, rule: Rule): string {
  const value = text.trim();
  if (!value) return rule.optional ? '' : 'Required';
  const n = Number(value);
  if (!Number.isFinite(n)) return 'Must be a number';
  if (rule.int && !Number.isInteger(n)) return 'Must be a whole number';
  if (rule.min !== undefined && n < rule.min) return `At least ${number.format(rule.min)}`;
  if (rule.max !== undefined && n > rule.max) return `At most ${number.format(rule.max)}`;
  if (rule.above !== undefined && n <= rule.above) return `Must be above ${rule.above}`;
  return '';
}

const intRule = (spec: OverrideSpec | undefined): Rule =>
  spec?.type === 'int' ? { int: true, min: spec.min, max: spec.max, optional: spec.optional } : { int: true };

type SettingKey = 'evaluation_budget' | 'target_generations' | 'migration.interval' | 'migration.num_migrants' | 'seed';

type AdvancedKey = 'lsh_hashes' | 'birch_threshold' | 'denstream_epsilon' | 'denstream_half_life' | 'denstream_mu' | 'denstream_beta' | 'seed';

const AUTO_HINT = 'Blank measures it from the run';

// Advanced clustering settings; `stage` hides a field while its stage is off.
const ADVANCED: { key: AdvancedKey; label: string; stage: Stage | null; rule: Rule; hint: string }[] = [
  { key: 'lsh_hashes', label: 'LSH hashes', stage: 'lsh', rule: { int: true, min: 1 }, hint: 'More hashes, finer blocks' },
  { key: 'birch_threshold', label: 'BIRCH threshold', stage: 'birch', rule: { above: 0, optional: true }, hint: AUTO_HINT },
  { key: 'denstream_epsilon', label: 'DenStream epsilon', stage: 'denstream', rule: { above: 0, optional: true }, hint: AUTO_HINT },
  { key: 'denstream_half_life', label: 'DenStream half-life (s)', stage: 'denstream', rule: { above: 0, optional: true }, hint: AUTO_HINT },
  { key: 'denstream_mu', label: 'DenStream μ', stage: 'denstream', rule: { above: 0 }, hint: 'Higher prunes more' },
  { key: 'denstream_beta', label: 'DenStream β', stage: 'denstream', rule: { above: 0, max: 1 }, hint: 'Higher prunes more, up to 1' },
  { key: 'seed', label: 'Clustering seed', stage: null, rule: { int: true, min: 0, max: 2 ** 32 - 1 }, hint: 'Same seed, same result' },
];

type ClusterForm = Record<Stage, boolean> & { detail: number; text: Record<AdvancedKey, string> };

type Form = {
  preset: Preset;
  islands: number;
  migration: boolean;
  topology: string;
  text: Record<SettingKey, string>;
  clustering: ClusterForm;
  stream: boolean;
  name: string;
};

// archipelago's clustering Config defaults, with every stage on.
const DEFAULT_CLUSTERING: ClusterForm = {
  lsh: true,
  birch: true,
  denstream: true,
  detail: 1,
  text: {
    lsh_hashes: '6',
    birch_threshold: '',
    denstream_epsilon: '',
    denstream_half_life: '',
    denstream_mu: '10',
    denstream_beta: '0.5',
    seed: '0',
  },
};

function presetSettings(preset: Preset): Pick<Form, 'preset' | 'islands' | 'migration' | 'topology' | 'text'> {
  const d = preset.defaults;
  return {
    preset,
    islands: d.num_islands,
    migration: d['migration.enabled'],
    topology: d['migration.topology'],
    text: {
      evaluation_budget: String(d.evaluation_budget),
      target_generations: String(d.target_generations),
      'migration.interval': String(d['migration.interval']),
      'migration.num_migrants': String(d['migration.num_migrants']),
      seed: d.seed === undefined ? '' : String(d.seed),
    },
  };
}

function validate(form: Form, overrides: Presets['overrides']): Record<string, string> {
  const errors: Record<string, string> = {};
  const set = (key: string, message: string) => {
    if (message) errors[key] = message;
  };
  const name = form.name.trim();
  set('name', !name ? 'Give the run a name.' : name.length > NAME_MAX ? `At most ${NAME_MAX} characters.` : '');
  for (const key of ['evaluation_budget', 'target_generations', 'seed'] as const) set(key, numberError(form.text[key], intRule(overrides[key])));
  if (form.migration) {
    for (const key of ['migration.interval', 'migration.num_migrants'] as const) set(key, numberError(form.text[key], intRule(overrides[key])));
    if (!errors['migration.interval'] && !errors.target_generations && Number(form.text['migration.interval']) > Number(form.text.target_generations))
      set('migration.interval', 'Must not exceed target generations');
    if (form.topology === 'torus' && form.islands !== TORUS_ISLANDS) set('topology', `A torus needs ${TORUS_ISLANDS} islands.`);
  }
  const cl = form.clustering;
  if (!STAGES.some((stage) => cl[stage.key])) set('stages', 'Enable at least one stage.');
  for (const field of ADVANCED) if (!field.stage || cl[field.stage]) set(`clustering.${field.key}`, numberError(cl.text[field.key], field.rule));
  return errors;
}

function toNewRun(form: Form): NewRun {
  const num = (key: SettingKey) => Number(form.text[key]);
  const d = form.preset.defaults;
  const cl = form.clustering;
  const run_settings: RunSettings = {
    num_islands: form.islands,
    evaluation_budget: num('evaluation_budget'),
    target_generations: num('target_generations'),
    'migration.enabled': form.migration,
    // With migration off the runner ignores these, so send the preset's and drop any half-edited values.
    'migration.topology': form.migration ? form.topology : d['migration.topology'],
    'migration.interval': form.migration ? num('migration.interval') : d['migration.interval'],
    'migration.num_migrants': form.migration ? num('migration.num_migrants') : d['migration.num_migrants'],
  };
  if (form.text.seed.trim()) run_settings.seed = num('seed');
  const params: Partial<Clustering> = Object.fromEntries(
    ADVANCED.filter((field) => !field.stage || cl[field.stage]).map((field) => [
      field.key,
      cl.text[field.key].trim() ? Number(cl.text[field.key]) : null,
    ])
  );
  return {
    run_name: form.name.trim(),
    preset: form.preset.preset,
    run_settings,
    stream: form.stream,
    clustering: { lsh: cl.lsh, birch: cl.birch, denstream: cl.denstream, detail: cl.detail, ...params },
  };
}

const GW = 112;
const GH = 52;

type Pt = [number, number];

const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const toPath = (pts: Pt[], close = false) => `M${pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' L')}${close ? ' Z' : ''}`;

// Samples f over [-1, 1] into glyph space, lowest value at the bottom.
function sampleCurve(f: (x: number) => number, n = 120): Pt[] {
  const ys = Array.from({ length: n + 1 }, (_, i) => f(-1 + (2 * i) / n));
  const lo = Math.min(...ys);
  const hi = Math.max(...ys);
  return ys.map((y, i) => [(i / n) * GW, 8 + (1 - (y - lo) / (hi - lo || 1)) * (GH - 14)]);
}

// Indices of a sampled curve's local minima, which sit lowest on screen (largest y).
const minimaOf = (pts: Pt[]) => pts.flatMap((p, i) => (i > 0 && i < pts.length - 1 && p[1] >= pts[i - 1]![1] && p[1] > pts[i + 1]![1] ? [i] : []));

const deepest = (pts: Pt[], indices: number[]) => indices.reduce((best, i) => (pts[i]![1] > pts[best]![1] ? i : best), indices[0]!);

function seeded(text: string) {
  let state = [...text].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7) % 2147483647 || 1;
  return () => (state = (state * 16807) % 2147483647) / 2147483647;
}

// Cities seeded by the instance name, more for bigger instances, in a 2-opt tour order.
function tspTour(instance: string): Pt[] {
  const rand = seeded(instance);
  const size = Number(instance.match(/\d+/)?.[0] ?? 50);
  const count = Math.min(18, Math.max(8, Math.round(size / 6)));
  const cities: Pt[] = [];
  for (let tries = 0; cities.length < count && tries < 4000; tries++) {
    const p: Pt = [8 + rand() * 96, 6 + rand() * 40];
    if (cities.every((c) => dist(c, p) > 11)) cities.push(p);
  }
  const tour = [...cities];
  for (let improved = true; improved;) {
    improved = false;
    for (let i = 1; i < tour.length - 1; i++)
      for (let j = i + 1; j < tour.length; j++) {
        const [a, b, c, d] = [tour[i - 1]!, tour[i]!, tour[j]!, tour[(j + 1) % tour.length]!];
        if (dist(a, c) + dist(b, d) < dist(a, b) + dist(c, d) - 1e-6) {
          tour.splice(i, j - i + 1, ...tour.slice(i, j + 1).reverse());
          improved = true;
        }
      }
  }
  return tour;
}

const vars = (values: Record<string, string | number>) => values as CSSProperties;

// A small drawing of each benchmark, animated on hover and selection to show what makes it hard.
// `variant` tells apart several presets on the same benchmark.
const BenchGlyph = memo(function BenchGlyph({ benchmark, instance, variant }: { benchmark: string; instance: string; variant: number }) {
  let body: ReactNode = null;
  if (benchmark === 'tsp') {
    const tour = tspTour(instance);
    const path = toPath(tour, true);
    const cities = tour.map((p, i) => <circle key={i} className="g-dot" cx={p[0]} cy={p[1]} r={2.2} />);
    if (variant % 2 === 0)
      // Berlin52
      body = (
        <>
          <path className="g-line g-draw" pathLength={1} d={path} style={vars({ '--t': '1.8s', '--e': 'linear' })} />
          {cities}
          <circle className="g-ball g-travel" r={3} style={vars({ offsetPath: `path("${path}")`, '--t': '1.8s', '--e': 'linear' })} />
        </>
      );
    else {
      // KroA100
      body = (
        <>
          <path className="g-line g-fade" d={path} style={vars({ '--d': `${tour.length * 0.04 + 0.1}s` })} />
          <path className="g-glint" pathLength={1} d={path} style={vars({ '--d': `${tour.length * 0.04 + 0.35}s` })} />
          {tour.map((p, i) => (
            <circle key={i} className="g-dot g-pop" cx={p[0]} cy={p[1]} r={2.2} style={vars({ '--d': `${i * 0.04}s` })} />
          ))}
        </>
      );
    }
  } else if (benchmark === 'shifted_rotated') {
    // Rastrigin
    const pts = sampleCurve((x) => 6 * x * x - Math.cos(2 * Math.PI * 4 * x));
    const mins = minimaOf(pts);
    const best = deepest(pts, mins);
    body = (
      <>
        <path className="g-line" d={toPath(pts)} />
        {mins.map((i, k) => (
          <circle
            key={i}
            className={`g-pop ${i === best ? 'g-dot' : 'g-hollow'}`}
            cx={pts[i]![0]}
            cy={pts[i]![1]}
            r={2.2}
            style={vars({ '--d': `${0.1 + k * 0.09}s` })}
          />
        ))}
        <circle className="g-ring" cx={pts[best]![0]} cy={pts[best]![1]} r={6} style={vars({ '--d': `${0.2 + mins.length * 0.09}s` })} />
      </>
    );
  } else if (benchmark === 'ackley') {
    const pts = sampleCurve((x) => -Math.exp(-2.4 * Math.abs(x)) * 2.2 - 0.25 * Math.cos(2 * Math.PI * 3 * x));
    const centre = Math.floor(pts.length / 2);
    const roll = toPath(pts.slice(0, centre + 1).map(([x, y]) => [x, y - 3] as Pt));
    const [cx, cy] = pts[centre]!;
    body = (
      <>
        <path className="g-line" d={toPath(pts)} />
        <circle className="g-ripple" cx={cx} cy={cy - 3} r={9} style={vars({ '--d': '1.15s' })} />
        <circle
          className="g-ball g-travel"
          r={2.8}
          style={vars({ offsetPath: `path("${roll}")`, '--t': '1.2s', '--e': 'cubic-bezier(0.55, 0, 0.9, 0.6)' })}
        />
      </>
    );
  } else if (benchmark === 'schwefel') {
    const pts = sampleCurve((x) => -(x * 500) * Math.sin(Math.sqrt(Math.abs(x * 500))));
    const mins = minimaOf(pts);
    const best = deepest(pts, mins);
    const trap = deepest(
      pts,
      mins.filter((i) => Math.abs(pts[i]![0] - pts[best]![0]) > 45)
    );
    const [tx, ty] = pts[trap]!;
    const [bx, by] = pts[best]!;
    const leap = `M${tx.toFixed(1)},${(ty - 3).toFixed(1)} Q${((tx + bx) / 2).toFixed(1)},${(Math.min(ty, by) - 34).toFixed(1)} ${bx.toFixed(1)},${(by - 3).toFixed(1)}`;
    body = (
      <>
        <path className="g-line" d={toPath(pts)} />
        <path className="g-leap" pathLength={1} d={leap} />
        <circle className="g-hollow g-lure" cx={tx} cy={ty - 3} r={3.4} />
        <circle className="g-ball g-jump" r={2.8} style={vars({ offsetPath: `path("${leap}")` })} />
      </>
    );
  } else if (benchmark === 'sphere') {
    const [cx, cy] = [GW / 2, GH / 2];
    const steps = [0, 0.42, 0.66, 0.81, 0.9];
    body = (
      <>
        {[22, 15, 8].map((r, i) => (
          <ellipse key={r} className="g-line g-contract" cx={cx} cy={cy} rx={r * 2} ry={r} style={vars({ '--d': `${i * 0.12}s` })} />
        ))}
        {steps.map((t, i) => (
          <circle
            key={t}
            className="g-dot g-step"
            cx={cx - 44 + 44 * t}
            cy={cy - 17 + 17 * t}
            r={1.9}
            style={vars({ '--d': `${0.35 + i * 0.16}s` })}
          />
        ))}
        <circle className="g-dot g-pop" cx={cx} cy={cy} r={2.8} style={vars({ '--d': '1.15s' })} />
      </>
    );
  } else if (benchmark === 'knapsack') {
    const items = [
      [24, 34, 22, 11],
      [48, 28, 18, 17],
      [68, 37, 20, 8],
      [24, 22, 14, 11],
      [68, 26, 20, 10],
    ];
    body = (
      <>
        <path className="g-line" d="M20,10 L20,46 L92,46 L92,10" />
        {items.map(([x, y, w, h], i) => (
          <rect key={i} className="g-box g-drop" x={x} y={y} width={w} height={h} rx={1.5} style={vars({ '--d': `${i * 0.14}s` })} />
        ))}
        <rect className="g-box g-reject" x={40} y={2} width={30} height={9} rx={1.5} style={vars({ '--d': `${items.length * 0.14 + 0.1}s` })} />
      </>
    );
  } else if (benchmark === 'nguyen7') {
    const nodes: Pt[] = [
      [56, 8],
      [32, 26],
      [80, 26],
      [20, 44],
      [44, 44],
      [70, 44],
      [92, 44],
    ];
    const level = [0, 1, 1, 2, 2, 2, 2];
    const links = [
      [0, 1],
      [0, 2],
      [1, 3],
      [1, 4],
      [2, 5],
      [2, 6],
    ] as const;
    body = (
      <>
        {links.map(([a, b]) => (
          <path
            key={b}
            className="g-line g-draw"
            pathLength={1}
            d={toPath([nodes[a]!, nodes[b]!])}
            style={vars({ '--t': '0.3s', '--d': `${level[b]! * 0.32 - 0.22}s` })}
          />
        ))}
        {nodes.map(([x, y], i) => (
          <circle key={i} className="g-dot g-pop" cx={x} cy={y} r={3} style={vars({ '--d': `${level[i]! * 0.32}s` })} />
        ))}
      </>
    );
  } else if (benchmark === 'yacht') {
    const xs = [8, 18, 26, 36, 44, 54, 62, 72, 80, 90, 100];
    const f = (x: number) => 44 - (x / GW) ** 3.2 * 36;
    const fitX = [4, ...xs, 108];
    const fit = toPath(fitX.map((x) => [x, f(x)]));
    const flat = toPath(fitX.map((x) => [x, 38]));
    body = (
      <>
        {xs.map((x, i) => (
          <circle key={x} className="g-dot g-pop" cx={x} cy={f(x) + (i % 3) * 3 - 3} r={2.2} style={vars({ '--d': `${i * 0.05}s` })} />
        ))}
        <path className="g-line g-morph" d={fit} style={vars({ '--from': `path("${flat}")`, '--d': '0.6s', '--t': '1s' })} />
      </>
    );
  }
  return (
    <svg viewBox={`0 0 ${GW} ${GH}`} width={GW} height={GH} aria-hidden="true">
      {body}
    </svg>
  );
});

function TopologyGlyph({ kind, count }: { kind: string; count: number }) {
  const S = 44;
  const c = S / 2;
  const R = 15;
  let pts: Pt[] = Array.from({ length: count }, (_, i) => [c + R * Math.sin((2 * Math.PI * i) / count), c - R * Math.cos((2 * Math.PI * i) / count)]);
  let edges: [number, number][] = [];
  if (kind === 'ring' || kind === 'bidirectional_ring') edges = pts.map((_, i) => [i, (i + 1) % count]);
  if (kind === 'fully_connected') for (let i = 0; i < count; i++) for (let j = i + 1; j < count; j++) edges.push([i, j]);
  if (kind === 'lattice') {
    pts = Array.from({ length: count }, (_, i) => [6 + (i * (S - 12)) / (count - 1), c + (i % 2 ? -6 : 6)]);
    edges = pts.slice(1).map((_, i) => [i, i + 1]);
  }
  if (kind === 'star') {
    pts = [[c, c], ...pts.slice(0, count - 1)];
    edges = pts.slice(1).map((_, i) => [0, i + 1]);
  }
  if (kind === 'torus') {
    pts = [0, 1, 2].flatMap((x) => [0, 1].map((y) => [9 + x * 13, 14 + y * 16] as Pt));
    edges = [
      [0, 2],
      [2, 4],
      [1, 3],
      [3, 5],
      [0, 1],
      [2, 3],
      [4, 5],
    ];
  }
  if (kind === 'random') {
    const links: [number, number][] = [
      [0, 2],
      [1, 3],
      [2, 4],
      [0, 3],
      [4, 1],
      [5, 2],
    ];
    edges = links.filter(([a, b]) => a < pts.length && b < pts.length);
  }
  const oneWay = kind === 'ring';
  return (
    <svg width={44} height={44} viewBox="0 0 44 44" aria-hidden="true">
      {edges.map(([a, b], i) => (
        <line
          key={i}
          x1={pts[a]![0]}
          y1={pts[a]![1]}
          x2={pts[b]![0]}
          y2={pts[b]![1]}
          stroke="currentColor"
          strokeOpacity={oneWay ? 0.7 : 0.45}
          strokeWidth={1.2}
          strokeDasharray={oneWay ? '3 2' : undefined}
        />
      ))}
      {pts.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={3.2} fill={ISLAND_COLORS[i % ISLAND_COLORS.length]} />
      ))}
    </svg>
  );
}

type FieldProps = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
  placeholder?: string;
  decimal?: boolean;
  disabled?: boolean;
};

function NumberField({ id, label, value, onChange, error, hint, placeholder, decimal, disabled }: FieldProps) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        className={`input num${error ? ' invalid' : ''}`}
        inputMode={decimal ? 'decimal' : 'numeric'}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        aria-invalid={Boolean(error)}
        spellCheck={false}
        onChange={(event) => onChange(event.target.value)}
      />
      {error ? <span className="field-error">{error}</span> : hint && <small>{hint}</small>}
    </div>
  );
}

function Switch({ on }: { on: boolean }) {
  return <span className={`switch${on ? ' on' : ''}`} aria-hidden="true" />;
}

// Fixed sample points for the detail preview: three loose blobs.
const PREVIEW_POINTS: [number, number][] = (() => {
  let state = 7;
  const rand = () => (state = (state * 16807) % 2147483647) / 2147483647;
  const centers = [
    [56, 40],
    [140, 30],
    [222, 48],
  ];
  return centers.flatMap(([cx, cy]) => Array.from({ length: 14 }, () => [cx! + (rand() - 0.5) * 78, cy! + (rand() - 0.5) * 46] as [number, number]));
})();

// Preview grouping radius at detail 1; detail divides it, as it divides the auto BIRCH threshold.
const PREVIEW_RADIUS = 30;

// Groups the preview points the way BIRCH does: join the first cluster within the radius, else start one.
function previewClusters(detail: number) {
  const radius = PREVIEW_RADIUS / detail;
  const clusters: { x: number; y: number; points: [number, number][] }[] = [];
  for (const point of PREVIEW_POINTS) {
    const near = clusters.find((c) => Math.hypot(c.x - point[0], c.y - point[1]) <= radius);
    if (!near) {
      clusters.push({ x: point[0], y: point[1], points: [point] });
      continue;
    }
    near.points.push(point);
    near.x = near.points.reduce((sum, p) => sum + p[0], 0) / near.points.length;
    near.y = near.points.reduce((sum, p) => sum + p[1], 0) / near.points.length;
  }
  return clusters.map((c) => ({ ...c, r: Math.max(...c.points.map((p) => Math.hypot(p[0] - c.x, p[1] - c.y))) + 5 }));
}

function DetailPreview({ detail, active }: { detail: number; active: boolean }) {
  const clusters = previewClusters(detail);
  return (
    <div className={`detail-preview${active ? '' : ' unused'}`}>
      <svg viewBox="0 0 280 84" aria-hidden="true">
        {clusters.map((c, i) => (
          <circle key={`c${i}`} className="dp-cluster" cx={c.x} cy={c.y} r={c.r} />
        ))}
        {PREVIEW_POINTS.map(([x, y], i) => (
          <circle key={i} className="dp-point" cx={x} cy={y} r={1.8} />
        ))}
      </svg>
      <span className="dp-count">{active ? `${clusters.length} clusters in this sample` : 'Only applies to BIRCH and DenStream'}</span>
    </div>
  );
}

// Tick values under the detail slider.
const DETAIL_TICKS = [0.5, 1, 1.5, 2];

function DetailSlider({ cl, patchCluster }: Pick<AdvancedProps, 'cl' | 'patchCluster'>) {
  const used = cl.birch || cl.denstream;
  const fill = ((cl.detail - DETAIL_MIN) / (DETAIL_MAX - DETAIL_MIN)) * 100;
  return (
    <div className={`detail-slider${used ? '' : ' unused'}`}>
      <div className="ds-head">
        <label htmlFor="f-detail">Detail</label>
        <span className="ds-value num">
          {cl.detail.toFixed(1)}
          {cl.detail === 1 && <em>default</em>}
        </span>
      </div>
      <input
        id="f-detail"
        type="range"
        min={DETAIL_MIN}
        max={DETAIL_MAX}
        step={0.1}
        value={cl.detail}
        disabled={!used}
        style={{ '--fill': `${fill}%` } as CSSProperties}
        onChange={(event) => patchCluster({ detail: Number(event.target.value) })}
      />
      <div className="ds-ticks">
        {DETAIL_TICKS.map((tick) => (
          <button
            key={tick}
            className={`num${cl.detail === tick ? ' on' : ''}`}
            style={{ left: `${((tick - DETAIL_MIN) / (DETAIL_MAX - DETAIL_MIN)) * 100}%` }}
            disabled={!used}
            onClick={() => patchCluster({ detail: tick })}
          >
            {tick.toFixed(1)}
          </button>
        ))}
      </div>
      <div className="ds-ends">
        <small>Coarse · fewer, bigger clusters</small>
        <small>Fine · more, smaller clusters</small>
      </div>
    </div>
  );
}

type AdvancedProps = {
  cl: ClusterForm;
  errors: Record<string, string>;
  patchCluster: (change: Partial<ClusterForm>) => void;
  setClusterText: (key: AdvancedKey) => (value: string) => void;
};

// Advanced fields grouped by stage, with the stage-less ones under General.
const GROUPS = [...STAGES.map((stage) => ({ key: stage.key as Stage | null, label: stage.label })), { key: null, label: 'General' }];

// Detail beside its preview, then one card per stage.
function AdvancedPanel(props: AdvancedProps) {
  const { cl } = props;
  return (
    <details className="advanced">
      <summary>
        <Icon name="chevR" size={14} />
        <span className="adv-title">Advanced Clustering Settings</span>
        <span className="adv-meta">
          {ADVANCED.filter((field) => !field.stage || cl[field.stage]).length + 1} settings · detail {cl.detail.toFixed(1)}
        </span>
      </summary>
      <div className="adv-body">
        <div className="adv-detail">
          <DetailSlider cl={cl} patchCluster={props.patchCluster} />
          <DetailPreview detail={cl.detail} active={cl.birch || cl.denstream} />
        </div>
        <div className="adv-groups">
          {GROUPS.map((group) => {
            const on = !group.key || cl[group.key];
            return (
              <div key={group.label} className={`adv-group${on ? '' : ' off'}`}>
                <div className="adv-group-h">
                  <strong>{group.label}</strong>
                  {group.key && <span className={`pill${on ? ' on' : ''}`}>{on ? 'On' : 'Off'}</span>}
                </div>
                {ADVANCED.filter((field) => field.stage === group.key).map((field) => (
                  <NumberField
                    key={field.key}
                    id={`f-cl-${field.key}`}
                    label={field.label}
                    value={cl.text[field.key]}
                    onChange={props.setClusterText(field.key)}
                    error={on ? props.errors[`clustering.${field.key}`] : undefined}
                    hint={field.hint}
                    placeholder={field.rule.optional ? 'Auto' : undefined}
                    decimal={!field.rule.int}
                    disabled={!on}
                  />
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </details>
  );
}

type SearchProps = {
  form: Form;
  errors: Record<string, string>;
  islandCounts: number[];
  budgetSpec: OverrideSpec | undefined;
  patch: (change: Partial<Form>) => void;
  setText: (key: SettingKey) => (value: string) => void;
};

const compactNumber = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });

// Quick picks shown under the budget and generations tiles.
const BUDGET_PICKS = [10000, 25000, 50000, 100000, 250000];
const GENERATION_PICKS = [50, 100, 200, 500];

type TileProps = Omit<FieldProps, 'decimal' | 'disabled'> & { hint: string; children?: ReactNode };

// A large, directly editable number with a note under it.
function NumberTile({ id, label, value, onChange, error, hint, placeholder, children }: TileProps) {
  return (
    <div className="sd-tile">
      <label className="sd-l" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className={`sd-input num${error ? ' invalid' : ''}`}
        inputMode="numeric"
        placeholder={placeholder}
        value={value}
        spellCheck={false}
        onChange={(event) => onChange(event.target.value)}
      />
      {children}
      {error ? <span className="field-error">{error}</span> : <small>{hint}</small>}
    </div>
  );
}

type IslandControlProps = Pick<SearchProps, 'form' | 'islandCounts' | 'patch'>;

const stepIslands = ({ form, islandCounts, patch }: IslandControlProps, delta: number) => {
  const next = islandCounts[islandCounts.indexOf(form.islands) + delta];
  if (next !== undefined) patch({ islands: next });
};

// The island count rolls like an odometer between − and +; the islands pop in and out under it.
function IslandStepper(props: IslandControlProps) {
  const { form, islandCounts } = props;
  const index = islandCounts.indexOf(form.islands);
  return (
    <>
      <div className="roll">
        <button className="btn btn-icon" aria-label="Fewer islands" disabled={index <= 0} onClick={() => stepIslands(props, -1)}>
          −
        </button>
        <span className="roll-window" aria-live="polite">
          <span className="roll-strip" style={{ transform: `translateY(${(-Math.max(0, index) / islandCounts.length) * 100}%)` }}>
            {islandCounts.map((count) => (
              <b key={count} className="sd-big num">
                {count}
              </b>
            ))}
          </span>
        </span>
        <button className="btn btn-icon" aria-label="More islands" disabled={index >= islandCounts.length - 1} onClick={() => stepIslands(props, 1)}>
          +
        </button>
      </div>
      <div className="roll-dots">
        {Array.from({ length: form.islands }, (_, i) => (
          <span key={i} style={vars({ '--c': ISLAND_COLORS[i % ISLAND_COLORS.length]! })} />
        ))}
      </div>
    </>
  );
}

// Big number tiles with quick picks.
function SearchTiles({ form, errors, islandCounts, budgetSpec, patch, setText }: SearchProps) {
  const { min, max } = budgetSpec?.type === 'int' ? budgetSpec : {};
  const chips = (key: SettingKey, picks: number[]) => (
    <div className="sd-chips">
      {picks.map((pick) => (
        <button key={pick} className={Number(form.text[key]) === pick ? 'on' : ''} onClick={() => setText(key)(String(pick))}>
          {compactNumber.format(pick)}
        </button>
      ))}
    </div>
  );
  return (
    <div className="sd">
      <div className="sd-tile">
        <span className="sd-l">Islands</span>
        <IslandStepper form={form} islandCounts={islandCounts} patch={patch} />
        <small>Each evolves its own population</small>
      </div>
      <NumberTile
        id="f-budget"
        label="Evaluation budget"
        value={form.text.evaluation_budget}
        onChange={setText('evaluation_budget')}
        error={errors.evaluation_budget}
        hint={`Shared across all islands${min !== undefined && max !== undefined ? ` · ${number.format(min)} to ${number.format(max)}` : ''}`}
      >
        {chips(
          'evaluation_budget',
          BUDGET_PICKS.filter((pick) => (min === undefined || pick >= min) && (max === undefined || pick <= max))
        )}
      </NumberTile>
      <NumberTile
        id="f-generations"
        label="Target generations"
        value={form.text.target_generations}
        onChange={setText('target_generations')}
        error={errors.target_generations}
        hint="Guides population size, not a hard limit"
      >
        {chips('target_generations', GENERATION_PICKS)}
      </NumberTile>
      <NumberTile
        id="f-seed"
        label="Runner seed"
        value={form.text.seed}
        onChange={setText('seed')}
        error={errors.seed}
        placeholder="Random"
        hint="Random picks a fresh seed for every run"
      >
        <div className="sd-chips">
          <button className={form.text.seed.trim() ? '' : 'on'} onClick={() => setText('seed')('')}>
            Random
          </button>
          <button onClick={() => setText('seed')(String(Math.floor(Math.random() * 2 ** 32)))}>Roll one</button>
        </div>
      </NumberTile>
    </div>
  );
}

type ScheduleKey = 'migration.interval' | 'migration.num_migrants';

type MigrationProps = Pick<SearchProps, 'form' | 'errors' | 'setText'> & { step: (key: ScheduleKey, delta: number) => void };

// Arrow keys step the calendar and population pickers, which act as sliders.
const sliderKeys = (key: ScheduleKey, step: MigrationProps['step']) => (event: KeyboardEvent<Element>) => {
  const delta = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[event.key];
  if (!delta) return;
  event.preventDefault();
  step(key, delta * (event.shiftKey ? 10 : 1));
};

// Roughly the per-island population the runner will use: the island's budget over (generations + 1),
// divided again by the 7 offspring per parent that evolution strategies spend by default, at least 4.
function populationOf(form: Form, errors: Record<string, string>): number | null {
  if (errors.evaluation_budget || errors.target_generations) return null;
  const perIsland = Math.floor(Number(form.text.evaluation_budget) / form.islands);
  const offspring = form.preset.algorithm === 'es' ? 7 : 1;
  return Math.max(4, Math.round(perIsland / ((Number(form.text.target_generations) + 1) * offspring)));
}

// Calendar cells at most; longer runs give each cell several generations.
const CALENDAR_CELLS = 250;

// The run as a calendar of generations: click the day of the first migration.
function IntervalCalendar(props: MigrationProps) {
  const { form, errors, setText, step } = props;
  const target = Number(form.text.target_generations);
  const generations = errors.target_generations || !(target > 0) ? null : target;
  const interval = Number(form.text['migration.interval']);
  const valid = generations !== null && !errors['migration.interval'] && interval >= 1;
  const [hover, setHover] = useState(0);
  const gens = generations ?? 0;
  const per = Math.max(1, Math.ceil(gens / CALENDAR_CELLS));
  const cells = Math.ceil(gens / per);
  const shown = hover || (valid ? interval : 0);
  const events = shown ? Math.floor(gens / shown) : 0;
  return (
    <div className="cal">
      <div className="q-head">
        <span className="ms-label">
          <Icon name="clock" size={14} />
          Interval
        </span>
        <span className="mg-readout">
          {errors['migration.interval'] ??
            (shown ? (
              <>
                {hover ? 'click to migrate ' : ''}every <b className="num">{shown}</b> generations · <b className="num">{events}</b> migrations
              </>
            ) : (
              'Set target generations first'
            ))}
        </span>
      </div>
      <div
        className="cal-grid"
        role="slider"
        tabIndex={form.migration ? 0 : -1}
        aria-label="Interval"
        aria-valuemin={1}
        aria-valuemax={generations ?? undefined}
        aria-valuenow={valid ? interval : undefined}
        onKeyDown={form.migration ? sliderKeys('migration.interval', step) : undefined}
        onPointerLeave={() => setHover(0)}
      >
        {Array.from({ length: cells }, (_, i) => {
          const last = Math.min(gens, (i + 1) * per);
          const migrates = shown > 0 && Math.floor(last / shown) > Math.floor((i * per) / shown);
          const alone = shown > 0 && last < shown;
          return (
            <button
              key={i}
              type="button"
              tabIndex={-1}
              aria-label={`Generation ${last}`}
              title={`Generation ${last}`}
              className={`cal-day${migrates ? ' migrates' : ''}${alone ? ' alone' : ''}${migrates && Math.floor(last / shown) === 1 ? ' first' : ''}`}
              onPointerEnter={() => setHover(last)}
              onClick={() => setText('migration.interval')(String(last))}
            />
          );
        })}
      </div>
      <div className="cal-legend">
        <span>
          <i className="alone" /> evolving alone
        </span>
        <span>
          <i className="migrates" /> migration
        </span>
        <span className="num">
          {per > 1 ? `each square is ${per} generations · ` : 'each square is a generation · '}
          {generations ?? '—'} in all
        </span>
      </div>
    </div>
  );
}

// Individuals drawn at most in the population grid.
const POPULATION_CELLS = 160;

// One island's population, best first: click how many of the best to send.
function MigrantPopulation(props: MigrationProps) {
  const { form, errors, setText, step } = props;
  const population = populationOf(form, errors);
  const migrants = errors['migration.num_migrants'] ? 0 : Number(form.text['migration.num_migrants']);
  const [hover, setHover] = useState(0);
  const size = population ?? 40;
  const cells = Math.min(size, POPULATION_CELLS);
  const shown = hover || migrants;
  return (
    <div className="pop">
      <div className="q-head">
        <span className="ms-label">
          <Icon name="arrowR" size={14} />
          Migrants per route
        </span>
        <span className="mg-readout">
          {errors['migration.num_migrants'] ?? (
            <>
              {hover ? 'click to send ' : 'sends '}its best <b className="num">{shown}</b>
              {population !== null && (
                <>
                  {' '}
                  of about <b className="num">{population}</b> ({Math.round((shown / population) * 100)}%)
                </>
              )}{' '}
              along each route
            </>
          )}
        </span>
      </div>
      <div
        className="pop-grid"
        role="slider"
        tabIndex={form.migration ? 0 : -1}
        aria-label="Migrants per route"
        aria-valuemin={1}
        aria-valuemax={population ? population - 1 : undefined}
        aria-valuenow={migrants || undefined}
        onKeyDown={form.migration ? sliderKeys('migration.num_migrants', step) : undefined}
        onPointerLeave={() => setHover(0)}
      >
        {Array.from({ length: cells }, (_, i) => {
          // Sending the whole population is not allowed, so the last individual always stays.
          const locked = population !== null && i >= population - 1;
          return (
            <button
              key={i}
              type="button"
              tabIndex={-1}
              disabled={locked}
              aria-label={`Send the best ${i + 1}`}
              className={`pop-one${i < shown ? ' sent' : ''}${hover && i < hover ? ' preview' : ''}`}
              style={vars({ '--i': i })}
              onPointerEnter={() => !locked && setHover(i + 1)}
              onClick={() => setText('migration.num_migrants')(String(i + 1))}
            />
          );
        })}
      </div>
      <div className="cal-legend">
        <span>best</span>
        <span className="pop-arrow">
          <Icon name="arrowR" size={11} />
        </span>
        <span>worst</span>
        <span className="num">
          {population === null
            ? 'population size depends on budget and generations'
            : population > POPULATION_CELLS
              ? `showing the best ${POPULATION_CELLS} of about ${population}`
              : `about ${population} per island, from budget and generations`}
        </span>
      </div>
    </div>
  );
}

// The migration schedule: a calendar for the interval, the island's population for migrants.
function MigrationCalendar(props: MigrationProps) {
  return (
    <div className="mq">
      <IntervalCalendar {...props} />
      <MigrantPopulation {...props} />
    </div>
  );
}

type ModeProps = { stream: boolean; setStream: (stream: boolean) => void };

const MODE_OPTIONS = [
  { stream: true, title: 'Live updates', text: 'Cluster as the run progresses and stream the network.' },
  { stream: false, title: 'Final result only', text: 'Cluster once after execution. See final built network.' },
];

// Timing of the simulated run in the mode previews, in milliseconds:
// the run, the clustering that final-only adds after it, and the pause on the finished state before replaying.
const PREVIEW_RUN_MS = 3800;
const PREVIEW_CLUSTER_MS = 900;
const PREVIEW_HOLD_MS = 2500;
const PREVIEW_CYCLE_MS = PREVIEW_RUN_MS + PREVIEW_CLUSTER_MS + PREVIEW_HOLD_MS;
// Where the run ends and where final-only clustering ends, as shares of the cycle.
const RUN_END = PREVIEW_RUN_MS / PREVIEW_CYCLE_MS;
const CLUSTER_END = (PREVIEW_RUN_MS + PREVIEW_CLUSTER_MS) / PREVIEW_CYCLE_MS;

// A small search network that the previews reveal; `at` is when each node is found, as a share of the run.
const PREVIEW_NODES = (() => {
  const rand = seeded('updates-preview');
  return Array.from({ length: 15 }, (_, i) => ({ x: 14 + rand() * 142, y: 10 + rand() * 50, r: 2 + rand() * 2.6, at: 0.04 + (i / 14) * 0.9 }));
})();
const PREVIEW_EDGES = PREVIEW_NODES.slice(1).map((node, k) => {
  const i = k + 1;
  let best = 0;
  for (let j = 1; j < i; j++)
    if (
      Math.hypot(PREVIEW_NODES[j]!.x - node.x, PREVIEW_NODES[j]!.y - node.y) <
      Math.hypot(PREVIEW_NODES[best]!.x - node.x, PREVIEW_NODES[best]!.y - node.y)
    )
      best = j;
  return [best, i] as const;
});

function previewState(stream: boolean, progress: number) {
  const run = Math.min(1, progress / RUN_END);
  const shown = stream ? (i: number) => PREVIEW_NODES[i]!.at <= run : () => progress >= CLUSTER_END;
  const status = stream
    ? progress < RUN_END
      ? 'Running · network updating'
      : 'Done · network complete'
    : progress < RUN_END
      ? 'Running · nothing to show yet'
      : progress < CLUSTER_END
        ? 'Clustering the whole run'
        : 'Done · network ready';
  return { shown, status };
}

// A run in miniature: the network you would see, over a bar of the run's progress.
function RunPreview({ stream, progress }: { stream: boolean; progress: number }) {
  const { shown, status } = previewState(stream, progress);
  const [x0, width] = [10, 150];
  // The bar is the whole job: the run alone when live, the run then clustering when final-only, so both fill it.
  const scale = width / (stream ? RUN_END : CLUSTER_END);
  return (
    <div className="rp">
      <svg viewBox="0 0 170 96" aria-hidden="true">
        {PREVIEW_EDGES.map(([a, b]) => (
          <line
            key={b}
            className={`rp-edge${shown(a) && shown(b) ? ' on' : ''}`}
            x1={PREVIEW_NODES[a]!.x}
            y1={PREVIEW_NODES[a]!.y}
            x2={PREVIEW_NODES[b]!.x}
            y2={PREVIEW_NODES[b]!.y}
          />
        ))}
        {PREVIEW_NODES.map((node, i) => (
          <circle key={i} className={`rp-node${shown(i) ? ' on' : ''}`} cx={node.x} cy={node.y} r={node.r} />
        ))}
        <rect className="rp-track" x={x0} y={80} width={width} height={5} rx={2.5} />
        <rect className="rp-run" x={x0} y={80} width={Math.min(progress, RUN_END) * scale} height={5} rx={2.5} />
        {!stream && progress > RUN_END && (
          <rect
            className="rp-cluster"
            x={x0 + RUN_END * scale}
            y={80}
            width={(Math.min(progress, CLUSTER_END) - RUN_END) * scale}
            height={5}
            rx={2.5}
          />
        )}
        {stream &&
          PREVIEW_NODES.map((node, i) => (
            <circle
              key={`t${i}`}
              className={`rp-tick${node.at * RUN_END <= progress ? ' on' : ''}`}
              cx={x0 + node.at * RUN_END * scale}
              cy={82.5}
              r={1.3}
            />
          ))}
      </svg>
      <span className="rp-status">{status}</span>
    </div>
  );
}

// Each option card plays what you would see with it, in step with the other.
function ModeCards({ stream, setStream }: ModeProps) {
  // Progress through the simulated run, looping; it stays at the end when motion is reduced.
  const [progress, setProgress] = useState(1);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const start = performance.now();
    const timer = window.setInterval(() => setProgress(((performance.now() - start) % PREVIEW_CYCLE_MS) / PREVIEW_CYCLE_MS), 70);
    return () => window.clearInterval(timer);
  }, []);
  return (
    <div className="radio-cards" role="radiogroup" aria-label="Mode">
      {MODE_OPTIONS.map((option) => (
        <button
          key={option.title}
          className={`radio-card mode-card${stream === option.stream ? ' on' : ''}`}
          role="radio"
          aria-checked={stream === option.stream}
          onClick={() => setStream(option.stream)}
        >
          <RunPreview stream={option.stream} progress={progress} />
          <span className="mode-text">
            <span className="rd" />
            <span>
              <strong>{option.title}</strong>
              <span>{option.text}</span>
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}

type StartPhase = 'idle' | 'busy' | 'done' | 'failed';

type StartProps = { phase: StartPhase; disabled: boolean; islands: number; onLaunch: () => void };

// How long the button must be held to launch.
const HOLD_MS = 650;
// Particles in one launch burst.
const BURST_PARTICLES = 14;

type Burst = { id: number; x: number; y: number };

// Hold to launch: a fill charges across the button while the islands light up, then the run starts with a burst.
function StartButton({ phase, disabled, islands, onLaunch }: StartProps) {
  const [bursts, setBursts] = useState<Burst[]>([]);
  const [hold, setHold] = useState(0);
  const frame = useRef(0);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  const launch = (el: HTMLElement) => {
    const id = performance.now() + Math.random();
    setBursts((list) => [...list, { id, x: el.clientWidth / 2, y: el.clientHeight / 2 }]);
    window.setTimeout(() => setBursts((list) => list.filter((b) => b.id !== id)), 900);
    onLaunch();
  };
  const startHold = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0 || disabled) return;
    const el = event.currentTarget;
    const begin = performance.now();
    const tick = (now: number) => {
      const share = Math.min(1, (now - begin) / HOLD_MS);
      setHold(share);
      if (share < 1) frame.current = requestAnimationFrame(tick);
      else {
        setHold(0);
        launch(el);
      }
    };
    frame.current = requestAnimationFrame(tick);
  };
  const cancelHold = () => {
    cancelAnimationFrame(frame.current);
    setHold(0);
  };

  const colour = (i: number) => ISLAND_COLORS[i % ISLAND_COLORS.length]!;
  let content: ReactNode;
  if (phase === 'done')
    content = (
      <>
        <svg className="start-check" width="15" height="15" viewBox="0 0 24 24" aria-hidden="true">
          <path d="m5 12 5 5L20 7" pathLength={1} />
        </svg>
        Run started
      </>
    );
  else if (phase === 'failed')
    content = (
      <>
        <Icon name="alert" size={15} />
        Couldn’t start
      </>
    );
  else if (phase === 'busy')
    content = (
      <>
        <span className="start-spin" aria-hidden="true" />
        Starting…
      </>
    );
  else
    content = (
      <>
        <span className="hold-dots" aria-hidden="true">
          {Array.from({ length: islands }, (_, i) => (
            <i key={i} className={hold > i / islands ? 'lit' : ''} style={vars({ '--c': colour(i) })} />
          ))}
        </span>
        {hold > 0 ? 'Keep holding…' : 'Hold to Start Run'}
      </>
    );

  return (
    <div className="start-wrap">
      <button
        className={`btn btn-primary start phase-${phase}${hold > 0 ? ' holding' : ''}`}
        disabled={disabled}
        style={vars({ '--hold': hold })}
        onPointerDown={startHold}
        onPointerUp={cancelHold}
        onPointerLeave={cancelHold}
        onPointerCancel={cancelHold}
        // Keyboard presses arrive as clicks with no pointer, so they launch straight away.
        onClick={(event) => event.detail === 0 && launch(event.currentTarget)}
      >
        {phase === 'idle' && (
          <span className="hold-clip" aria-hidden="true">
            <span className="hold-fill" />
          </span>
        )}
        <span className="start-content" key={phase}>
          {content}
        </span>
      </button>
      {bursts.map((b) => (
        <span key={b.id} className="burst" style={{ left: b.x, top: b.y }} aria-hidden="true">
          <span className="burst-ring" />
          {Array.from({ length: BURST_PARTICLES }, (_, i) => {
            const angle = (i / BURST_PARTICLES) * 2 * Math.PI + (i % 2) * 0.2;
            const reach = 46 + (i % 3) * 18;
            return (
              <i
                key={i}
                style={vars({
                  '--dx': `${(Math.cos(angle) * reach).toFixed(1)}px`,
                  '--dy': `${(Math.sin(angle) * reach * 0.7).toFixed(1)}px`,
                  '--c': colour(i),
                })}
              />
            );
          })}
        </span>
      ))}
    </div>
  );
}

// How long the button shows "Run started" before going to the new run's page, and "Couldn't start" before it can be tried again.
const SUCCESS_HOLD_MS = 1100;
const FAILED_HOLD_MS = 1600;

function NewRunForm({ presets }: { presets: Presets }) {
  const [form, setForm] = useState<Form>(() => ({
    ...presetSettings(presets.presets[0]!),
    clustering: DEFAULT_CLUSTERING,
    stream: true,
    name: randomName(),
  }));
  const [submit, setSubmit] = useState<{ phase: StartPhase; error: string; runId: string }>({ phase: 'idle', error: '', runId: '' });
  const [spins, setSpins] = useState(0);

  const patch = (change: Partial<Form>) => setForm((prev) => ({ ...prev, ...change }));
  const setText = (key: SettingKey) => (value: string) => setForm((prev) => ({ ...prev, text: { ...prev.text, [key]: value } }));
  // Both schedule values stay at least 1, and the interval may not pass the target generations.
  const step = (key: ScheduleKey, delta: number) =>
    setForm((prev) => {
      const generations = Number(prev.text.target_generations);
      const max = key === 'migration.interval' && Number.isInteger(generations) && generations > 0 ? generations : Infinity;
      const current = Number(prev.text[key]);
      const next = Math.min(max, Math.max(1, (Number.isFinite(current) ? Math.round(current) : 1) + delta));
      return { ...prev, text: { ...prev.text, [key]: String(next) } };
    });
  const patchCluster = (change: Partial<ClusterForm>) => setForm((prev) => ({ ...prev, clustering: { ...prev.clustering, ...change } }));
  const setClusterText = (key: AdvancedKey) => (value: string) =>
    setForm((prev) => ({ ...prev, clustering: { ...prev.clustering, text: { ...prev.clustering.text, [key]: value } } }));

  const errors = validate(form, presets.overrides);
  const errorCount = Object.keys(errors).length;
  const cl = form.clustering;
  const islandSpec = presets.overrides.num_islands;
  const islandCounts =
    islandSpec?.type === 'int' && islandSpec.min !== undefined && islandSpec.max !== undefined
      ? Array.from({ length: islandSpec.max - islandSpec.min + 1 }, (_, i) => islandSpec.min! + i)
      : [form.islands];
  const topologySpec = presets.overrides['migration.topology'];
  const topologies = topologySpec?.type === 'choice' ? topologySpec.choices : [form.topology];
  const budgetSpec = presets.overrides.evaluation_budget;
  const stages = STAGES.filter((stage) => cl[stage.key]).map((stage) => stage.label);

  const start = async () => {
    setSubmit({ phase: 'busy', error: '', runId: '' });
    try {
      const run = await api.createRun(toNewRun(form));
      setSubmit({ phase: 'done', error: '', runId: run.run_id });
    } catch (reason) {
      setSubmit({ phase: 'failed', error: (reason as Error).message, runId: '' });
    }
  };
  // "Run started" only shows once the backend has accepted the run; it then moves on to that run's page.
  // "Couldn't start" shows for a moment, then the button can be held again; the error note stays until the next try.
  useEffect(() => {
    if (submit.phase === 'done') {
      const timer = window.setTimeout(() => navigate(runHref(submit.runId)), SUCCESS_HOLD_MS);
      return () => window.clearTimeout(timer);
    }
    if (submit.phase === 'failed') {
      const timer = window.setTimeout(() => setSubmit((prev) => ({ ...prev, phase: 'idle' })), FAILED_HOLD_MS);
      return () => window.clearTimeout(timer);
    }
  }, [submit.phase, submit.runId]);

  return (
    <div className="nr">
      <div className="nr-steps">
        <section className="nr-step">
          <h2>Problem</h2>
          <p className="desc">What to optimise, and with which algorithm. Optimal defaults come with each.</p>
          <div className="presets" role="radiogroup" aria-label="Problem">
            {presets.presets.map((preset, index) => {
              // Preset names are <ALGORITHM>_<Problem>.
              const problem = preset.preset.slice(preset.preset.indexOf('_') + 1).replaceAll('_', ' ');
              const on = preset.preset === form.preset.preset;
              return (
                <button
                  key={preset.preset}
                  className={`preset${on ? ' on' : ''}`}
                  role="radio"
                  aria-checked={on}
                  title={preset.description}
                  onClick={() => !on && patch(presetSettings(preset))}
                >
                  <span className="glyph">
                    <BenchGlyph
                      benchmark={preset.benchmark}
                      instance={preset.preset}
                      variant={presets.presets.slice(0, index).filter((other) => other.benchmark === preset.benchmark).length}
                    />
                  </span>
                  <span className="pcheck">
                    <Icon name="check" size={13} stroke={2.4} />
                  </span>
                  <span className="ptext">
                    <strong>{problem}</strong>
                    <small>{ALGORITHMS[preset.algorithm] ?? preset.algorithm.toUpperCase()}</small>
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="nr-step">
          <h2>Search</h2>
          <p className="desc">Size and length of the run.</p>
          <SearchTiles form={form} errors={errors} islandCounts={islandCounts} budgetSpec={budgetSpec} patch={patch} setText={setText} />
        </section>

        <section className="nr-step">
          <div className="step-h">
            <h2>Migration</h2>
            <button className="title-switch" role="switch" aria-checked={form.migration} onClick={() => patch({ migration: !form.migration })}>
              {form.migration ? 'On' : 'Off'}
              <Switch on={form.migration} />
            </button>
          </div>
          <p className="desc">{form.migration ? 'How individuals move between islands.' : 'Islands evolve in isolation.'}</p>
          <fieldset className="mig-body" disabled={!form.migration}>
            <div className="topos" role="radiogroup" aria-label="Migration topology">
              {topologies.map((kind) => (
                <button
                  key={kind}
                  type="button"
                  className={`topo${form.topology === kind ? ' on' : ''}${kind === 'torus' && form.islands !== TORUS_ISLANDS ? ' invalid' : ''}`}
                  role="radio"
                  aria-checked={form.topology === kind}
                  title={kind === 'torus' ? `Needs ${TORUS_ISLANDS} islands` : undefined}
                  onClick={() => patch({ topology: kind })}
                >
                  <TopologyGlyph kind={kind} count={kind === 'torus' ? TORUS_ISLANDS : form.islands} />
                  {TOPOLOGIES[kind] ?? kind}
                </button>
              ))}
            </div>
            {errors.topology && <p className="field-error block">{errors.topology}</p>}
            <MigrationCalendar form={form} errors={errors} setText={setText} step={step} />
          </fieldset>
        </section>

        <section className="nr-step">
          <h2>Clustering</h2>
          <p className="desc">How evaluations are grouped in the network.</p>
          <div className="pipeline">
            {STAGES.map((stage, i) => (
              <Fragment key={stage.key}>
                {i > 0 && (
                  <span className="arrow">
                    <Icon name="arrowR" size={14} />
                  </span>
                )}
                <button
                  className={`cl-stage${cl[stage.key] ? ' on' : ''}`}
                  role="switch"
                  aria-checked={cl[stage.key]}
                  onClick={() => patchCluster({ [stage.key]: !cl[stage.key] })}
                >
                  <span className="top">
                    <strong>{stage.label}</strong>
                    <Switch on={cl[stage.key]} />
                  </span>
                  <p>{stage.text}</p>
                </button>
              </Fragment>
            ))}
          </div>
          {errors.stages && <p className="field-error block">{errors.stages}</p>}
          <AdvancedPanel cl={cl} errors={errors} patchCluster={patchCluster} setClusterText={setClusterText} />
        </section>

        <section className="nr-step">
          <h2>Mode</h2>
          <p className="desc">Watch the network grow, or wait for the final finished network.</p>
          <ModeCards stream={form.stream} setStream={(stream) => patch({ stream })} />
        </section>
      </div>

      <aside className="card summary">
        <h3>Summary</h3>
        <div className="field">
          <label htmlFor="run-name">Run name</label>
          <div className="name-row">
            <input
              id="run-name"
              className={`input mono${errors.name ? ' invalid' : ''}`}
              value={form.name}
              maxLength={NAME_MAX}
              spellCheck={false}
              onChange={(event) => patch({ name: event.target.value })}
            />
            <button
              className="btn btn-icon shuffle"
              title="Generate another name"
              aria-label="Generate another name"
              onClick={() => {
                patch({ name: randomName() });
                setSpins((n) => n + 1);
              }}
            >
              <span key={spins} className={spins ? 'spun' : undefined}>
                <Icon name="rerun" size={14} />
              </span>
            </button>
          </div>
          {errors.name && <span className="field-error">{errors.name}</span>}
        </div>
        <dl>
          <dt>Preset</dt>
          <dd>{form.preset.preset}</dd>
          <dt>Islands</dt>
          <dd>{form.islands}</dd>
          <dt>Budget</dt>
          <dd>{errors.evaluation_budget ? '—' : number.format(Number(form.text.evaluation_budget))}</dd>
          <dt>Generations</dt>
          <dd>{errors.target_generations ? '—' : form.text.target_generations.trim()}</dd>
          <dt>Migration</dt>
          <dd>{form.migration ? (TOPOLOGIES[form.topology] ?? form.topology) : 'Off'}</dd>
          {form.migration && (
            <>
              <dt>Schedule</dt>
              <dd>
                {errors['migration.interval'] || errors['migration.num_migrants']
                  ? '—'
                  : `${form.text['migration.num_migrants'].trim()} every ${form.text['migration.interval'].trim()} gens`}
              </dd>
            </>
          )}
          <dt>Clustering</dt>
          <dd>{stages.join(' → ') || '—'}</dd>
          <dt>Mode</dt>
          <dd>{form.stream ? 'Live' : 'Final only'}</dd>
        </dl>
        <hr />
        {errorCount > 0 && (
          <p className="start-note">
            <Icon name="alert" size={14} />
            {errorCount === 1 ? 'Fix the highlighted field to start.' : `Fix the ${errorCount} highlighted fields to start.`}
          </p>
        )}
        {submit.error && (
          <p className="start-note">
            <Icon name="alert" size={14} />
            {submit.error}
          </p>
        )}
        <StartButton phase={submit.phase} disabled={errorCount > 0 || submit.phase !== 'idle'} islands={form.islands} onLaunch={start} />
      </aside>
    </div>
  );
}

export default function NewRunPage() {
  const [presets, setPresets] = useState<{ data?: Presets; error: string }>({ error: '' });
  useEffect(() => {
    const controller = new AbortController();
    api.listPresets(controller.signal).then(
      (data) => setPresets({ data, error: '' }),
      (reason: Error) => !controller.signal.aborted && setPresets({ error: reason.message })
    );
    return () => controller.abort();
  }, []);

  let body: ReactNode;
  if (presets.data?.presets.length) body = <NewRunForm presets={presets.data} />;
  else if (presets.data) body = <div className="page-state">The runner has no presets to start from.</div>;
  else if (presets.error)
    body = (
      <div className="page-state">
        <Unavailable />
      </div>
    );
  else
    body = (
      <div className="page-state" role="status">
        <span className="page-spinner" aria-hidden="true" />
        Fetching Run Presets…
      </div>
    );

  return (
    <div className="page">
      <div className="page-h">
        <h1>New run</h1>
      </div>
      {body}
    </div>
  );
}
