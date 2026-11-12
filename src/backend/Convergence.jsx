import { useMemo, useState } from 'react';
import './convergence.css';
import { convergenceHistory } from './convergence-history.js';

const COLORS = ['#7ec8ff', '#f2615c', '#18a37a', '#f4d64f', '#c07ae8', '#e79039'];
const LABELS = {
  best_so_far_fitness: 'Best so far',
  best_fitness: 'Generation best',
  mean_fitness: 'Mean fitness',
  diversity: 'Diversity',
};
const number = new Intl.NumberFormat('en', { maximumSignificantDigits: 21, notation: 'standard' });
const show = (value) => (value == null ? '—' : number.format(value));

export default function Convergence({ result }) {
  const [selected, setSelected] = useState('all');
  const [metric, setMetric] = useState('');
  const [inspection, setInspection] = useState(null);

  const data = useMemo(() => result && convergenceHistory(result), [result]);
  if (!result) return <p role="status">Generation history is available when clustering finishes.</p>;
  if (data === null) return <p className="notice">No generation history was returned for this run.</p>;
  if (!data.chart) return <p className="notice">No fitness or diversity values were returned for these generations.</p>;

  const charts = data.charts;
  const chart = charts[metric] || data.chart;
  const visible = (island) => selected === 'all' || String(island.island_id) === selected;
  const inspectedIsland = data.islands.find((island) => island.island_id === inspection?.island) || data.islands[0];
  const inspectedIndex = Math.min(inspection?.index ?? inspectedIsland.series.length - 1, inspectedIsland.series.length - 1);
  const sample = inspectedIsland.series[inspectedIndex];
  const inspectedLine = chart.lines.find((line) => line.island_id === inspectedIsland.island_id);
  const marker = inspectedLine.points[inspectedIndex];
  const inspect = (island, index) => setInspection({ island, index });
  const selectIsland = (id) => {
    setSelected(id);
    const island = data.islands.find((item) => String(item.island_id) === id) || data.islands[0];
    inspect(island.island_id, island.series.length - 1);
  };

  return (
    <section className="convergence">
      <div className="history-toolbar">
        <h2>Fitness history</h2>
        <label>
          Metric{' '}
          <select aria-label="Chart metric" value={chart.metric} onChange={(event) => setMetric(event.target.value)}>
            {Object.keys(charts).map((key) => (
              <option key={key} value={key}>
                {LABELS[key]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="history-islands" role="group" aria-label="Visible islands">
        <button type="button" aria-pressed={selected === 'all'} onClick={() => selectIsland('all')}>
          All islands
        </button>
        {data.islands.map((island, index) => (
          <button
            type="button"
            key={island.island_id}
            aria-pressed={selected === String(island.island_id)}
            onClick={() => selectIsland(String(island.island_id))}
          >
            <span style={{ background: COLORS[index % COLORS.length] }} />
            Island {island.island_id}
          </button>
        ))}
      </div>
      <figure className="convergence-chart">
        <div className="history-axis-label">{chart.metric === 'diversity' ? 'Diversity' : 'Fitness'}</div>
        <svg viewBox={`0 0 ${chart.width} ${chart.height}`} role="img" aria-label={`${LABELS[chart.metric]} by generation`}>
          <title>{LABELS[chart.metric]} by island and generation</title>
          {chart.y_ticks.map((tick) => (
            <g key={tick.y}>
              <line x1={chart.x_ticks[0].x} x2={chart.x_ticks.at(-1).x} y1={tick.y} y2={tick.y} />
              <text x={chart.x_ticks[0].x - 14} y={tick.y} textAnchor="end" dominantBaseline="middle">
                {show(Number(tick.label))}
              </text>
            </g>
          ))}
          {chart.x_ticks.map((tick) => (
            <text key={tick.x} x={tick.x} y={chart.height - 22} textAnchor="middle">
              {tick.label}
            </text>
          ))}
          {chart.lines.map((line) => {
            const index = data.islands.findIndex((island) => island.island_id === line.island_id);
            const island = data.islands[index];
            return (
              visible(line) && (
                <g key={line.island_id}>
                  {line.points
                    .reduce(
                      (segments, point) => {
                        if (point) segments.at(-1).push(point);
                        else segments.push([]);
                        return segments;
                      },
                      [[]]
                    )
                    .filter((segment) => segment.length)
                    .map((segment, i) => (
                      <polyline
                        key={i}
                        fill="none"
                        stroke={COLORS[index % COLORS.length]}
                        strokeWidth="2"
                        vectorEffect="non-scaling-stroke"
                        points={segment.map((point) => `${point.x},${point.y}`).join(' ')}
                      />
                    ))}
                  {line.points.map(
                    (point, sampleIndex) =>
                      point && (
                        <circle
                          className="history-hit-point"
                          key={sampleIndex}
                          cx={point.x}
                          cy={point.y}
                          r="7"
                          onMouseEnter={() => inspect(line.island_id, sampleIndex)}
                          onClick={() => inspect(line.island_id, sampleIndex)}
                        >
                          <title>{`Island ${line.island_id} · Generation ${island.series[sampleIndex].generation} · ${show(island.series[sampleIndex][chart.metric])}`}</title>
                        </circle>
                      )
                  )}
                </g>
              )
            );
          })}
          {marker && <circle className="history-marker" cx={marker.x} cy={marker.y} r="4" />}
        </svg>
        <figcaption>Generation</figcaption>
      </figure>
      <div className="history-inspector">
        <label>
          Inspect island{' '}
          <select
            aria-label="Inspect island"
            value={inspectedIsland.island_id}
            onChange={(event) => {
              const island = data.islands.find((item) => String(item.island_id) === event.target.value);
              if (selected !== 'all') setSelected(String(island.island_id));
              inspect(island.island_id, island.series.length - 1);
            }}
          >
            {data.islands.map((island) => (
              <option key={island.island_id} value={island.island_id}>
                Island {island.island_id}
              </option>
            ))}
          </select>
        </label>
        <label className="history-scrubber">
          Generation{' '}
          <input
            aria-label="Inspect generation"
            aria-valuetext={`Generation ${sample.generation}`}
            type="range"
            min="0"
            max={inspectedIsland.series.length - 1}
            value={inspectedIndex}
            onChange={(event) => inspect(inspectedIsland.island_id, Number(event.target.value))}
          />
          <output>{sample.generation}</output>
        </label>
        <div className="history-point-value" aria-live="polite">
          <span>{LABELS[chart.metric]}</span>
          <strong>{show(sample[chart.metric])}</strong>
        </div>
      </div>
      <p className="history-context">Generations are local to each island.</p>
      <details className="history-data">
        <summary>Generation data</summary>
        <div className="run-table-wrap">
          <table>
            <caption>Generation summaries</caption>
            <thead>
              <tr>
                <th>Island</th>
                <th>Generation</th>
                <th>Evaluations</th>
                <th>Best</th>
                <th>Best so far</th>
                <th>Mean</th>
                <th>Fitness SD</th>
                <th>Diversity</th>
              </tr>
            </thead>
            <tbody>
              {data.islands.filter(visible).flatMap((island) =>
                island.series.map((row) => (
                  <tr key={`${island.island_id}-${row.generation}`}>
                    <td>{island.island_id}</td>
                    <td>{row.generation}</td>
                    <td>{show(row.evaluations)}</td>
                    <td>{show(row.best_fitness)}</td>
                    <td>{show(row.best_so_far_fitness)}</td>
                    <td>{show(row.mean_fitness)}</td>
                    <td>{show(row.fitness_std)}</td>
                    <td>{show(row.diversity)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
