import { memo, type ReactNode } from 'react';

import Icon from '@/components/Icon.tsx';
import type { Preset } from '@/types.ts';

import { presetSettings, type Form, type Patch } from './form.ts';
import { seeded, vars, type Pt } from './shared.ts';

import './problem.css';

const ALGORITHMS: Record<string, string> = {
  ga: 'Genetic Algorithm',
  de: 'Differential Evolution',
  es: 'Evolution Strategy',
  gp: 'Genetic Programming',
  pso: 'Particle Swarm',
};

// Every benchmark is drawn in this box.
const GLYPH_WIDTH = 112;
const GLYPH_HEIGHT = 52;

const distance = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);

const toPath = (points: Pt[], close = false) => `M${points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' L')}${close ? ' Z' : ''}`;

// Samples f over [-1, 1] into glyph space, lowest value at the bottom.
function sampleCurve(f: (x: number) => number, samples = 120): Pt[] {
  const values = Array.from({ length: samples + 1 }, (_, i) => f(-1 + (2 * i) / samples));
  const lowest = Math.min(...values);
  const highest = Math.max(...values);
  return values.map((value, i) => [(i / samples) * GLYPH_WIDTH, 8 + (1 - (value - lowest) / (highest - lowest || 1)) * (GLYPH_HEIGHT - 14)]);
}

// Indices of a sampled curve's local minima, which sit lowest on screen (largest y).
const minimaOf = (points: Pt[]) =>
  points.flatMap((point, i) => (i > 0 && i < points.length - 1 && point[1] >= points[i - 1]![1] && point[1] > points[i + 1]![1] ? [i] : []));

const deepest = (points: Pt[], indices: number[]) => indices.reduce((best, i) => (points[i]![1] > points[best]![1] ? i : best), indices[0]!);

// Cities seeded by the instance name, more for bigger instances, in a 2-opt tour order.
function tspTour(instance: string): Pt[] {
  const random = seeded(instance);
  const instanceSize = Number(instance.match(/\d+/)?.[0] ?? 50);
  const cityCount = Math.min(18, Math.max(8, Math.round(instanceSize / 6)));

  const cities: Pt[] = [];
  for (let tries = 0; cities.length < cityCount && tries < 4000; tries++) {
    const city: Pt = [8 + random() * 96, 6 + random() * 40];
    if (cities.every((other) => distance(other, city) > 11)) cities.push(city);
  }

  // 2-opt: keep reversing a stretch of the tour wherever that makes it shorter.
  const tour = [...cities];
  for (let improved = true; improved;) {
    improved = false;
    for (let i = 1; i < tour.length - 1; i++)
      for (let j = i + 1; j < tour.length; j++) {
        const [a, b, c, d] = [tour[i - 1]!, tour[i]!, tour[j]!, tour[(j + 1) % tour.length]!];
        if (distance(a, c) + distance(b, d) < distance(a, b) + distance(c, d) - 1e-6) {
          tour.splice(i, j - i + 1, ...tour.slice(i, j + 1).reverse());
          improved = true;
        }
      }
  }
  return tour;
}

// A small drawing of each benchmark, animated on hover and selection to show what makes it hard.
// `variant` tells apart several presets on the same benchmark.
const BenchGlyph = memo(function BenchGlyph({ benchmark, instance, variant }: { benchmark: string; instance: string; variant: number }) {
  let body: ReactNode = null;
  if (benchmark === 'tsp') {
    const tour = tspTour(instance);
    const path = toPath(tour, true);
    const cities = tour.map((city, i) => <circle key={i} className="g-dot" cx={city[0]} cy={city[1]} r={2.2} />);
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
          {tour.map((city, i) => (
            <circle key={i} className="g-dot g-pop" cx={city[0]} cy={city[1]} r={2.2} style={vars({ '--d': `${i * 0.04}s` })} />
          ))}
        </>
      );
    }
  } else if (benchmark === 'shifted_rotated') {
    // Rastrigin
    const points = sampleCurve((x) => 6 * x * x - Math.cos(2 * Math.PI * 4 * x));
    const minima = minimaOf(points);
    const best = deepest(points, minima);
    body = (
      <>
        <path className="g-line" d={toPath(points)} />
        {minima.map((i, k) => (
          <circle
            key={i}
            className={`g-pop ${i === best ? 'g-dot' : 'g-hollow'}`}
            cx={points[i]![0]}
            cy={points[i]![1]}
            r={2.2}
            style={vars({ '--d': `${0.1 + k * 0.09}s` })}
          />
        ))}
        <circle className="g-ring" cx={points[best]![0]} cy={points[best]![1]} r={6} style={vars({ '--d': `${0.2 + minima.length * 0.09}s` })} />
      </>
    );
  } else if (benchmark === 'ackley') {
    const points = sampleCurve((x) => -Math.exp(-2.4 * Math.abs(x)) * 2.2 - 0.25 * Math.cos(2 * Math.PI * 3 * x));
    const centre = Math.floor(points.length / 2);
    const roll = toPath(points.slice(0, centre + 1).map(([x, y]) => [x, y - 3] as Pt));
    const [cx, cy] = points[centre]!;
    body = (
      <>
        <path className="g-line" d={toPath(points)} />
        <circle className="g-ripple" cx={cx} cy={cy - 3} r={9} style={vars({ '--d': '1.15s' })} />
        <circle
          className="g-ball g-travel"
          r={2.8}
          style={vars({ offsetPath: `path("${roll}")`, '--t': '1.2s', '--e': 'cubic-bezier(0.55, 0, 0.9, 0.6)' })}
        />
      </>
    );
  } else if (benchmark === 'schwefel') {
    const points = sampleCurve((x) => -(x * 500) * Math.sin(Math.sqrt(Math.abs(x * 500))));
    const minima = minimaOf(points);
    const best = deepest(points, minima);
    const trap = deepest(
      points,
      minima.filter((i) => Math.abs(points[i]![0] - points[best]![0]) > 45)
    );
    const [trapX, trapY] = points[trap]!;
    const [bestX, bestY] = points[best]!;
    const leap = `M${trapX.toFixed(1)},${(trapY - 3).toFixed(1)} Q${((trapX + bestX) / 2).toFixed(1)},${(Math.min(trapY, bestY) - 34).toFixed(1)} ${bestX.toFixed(1)},${(bestY - 3).toFixed(1)}`;
    body = (
      <>
        <path className="g-line" d={toPath(points)} />
        <path className="g-leap" pathLength={1} d={leap} />
        <circle className="g-hollow g-lure" cx={trapX} cy={trapY - 3} r={3.4} />
        <circle className="g-ball g-jump" r={2.8} style={vars({ offsetPath: `path("${leap}")` })} />
      </>
    );
  } else if (benchmark === 'sphere') {
    const [cx, cy] = [GLYPH_WIDTH / 2, GLYPH_HEIGHT / 2];
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
        {links.map(([parent, child]) => (
          <path
            key={child}
            className="g-line g-draw"
            pathLength={1}
            d={toPath([nodes[parent]!, nodes[child]!])}
            style={vars({ '--t': '0.3s', '--d': `${level[child]! * 0.32 - 0.22}s` })}
          />
        ))}
        {nodes.map(([x, y], i) => (
          <circle key={i} className="g-dot g-pop" cx={x} cy={y} r={3} style={vars({ '--d': `${level[i]! * 0.32}s` })} />
        ))}
      </>
    );
  } else if (benchmark === 'yacht') {
    const samples = [8, 18, 26, 36, 44, 54, 62, 72, 80, 90, 100];
    const model = (x: number) => 44 - (x / GLYPH_WIDTH) ** 3.2 * 36;
    const fitX = [4, ...samples, 108];
    const fit = toPath(fitX.map((x) => [x, model(x)]));
    const flat = toPath(fitX.map((x) => [x, 38]));
    body = (
      <>
        {samples.map((x, i) => (
          <circle key={x} className="g-dot g-pop" cx={x} cy={model(x) + (i % 3) * 3 - 3} r={2.2} style={vars({ '--d': `${i * 0.05}s` })} />
        ))}
        <path className="g-line g-morph" d={fit} style={vars({ '--from': `path("${flat}")`, '--d': '0.6s', '--t': '1s' })} />
      </>
    );
  }

  return (
    <svg viewBox={`0 0 ${GLYPH_WIDTH} ${GLYPH_HEIGHT}`} width={GLYPH_WIDTH} height={GLYPH_HEIGHT} aria-hidden="true">
      {body}
    </svg>
  );
});

export default function ProblemSection({ presets, form, patch }: { presets: Preset[]; form: Form; patch: Patch }) {
  return (
    <section className="nr-step">
      <h2>Problem</h2>
      <p className="desc">What to optimise, and with which algorithm. Optimal defaults come with each.</p>
      <div className="presets" role="radiogroup" aria-label="Problem">
        {presets.map((preset, index) => {
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
                  variant={presets.slice(0, index).filter((other) => other.benchmark === preset.benchmark).length}
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
  );
}
