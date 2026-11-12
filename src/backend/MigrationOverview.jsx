import React from 'react';
import { migrationSummary } from './migration-summary.js';
import './migration.css';

const format = (value) => value.toLocaleString();

const OLDER_RESULT = 'This result was computed before the clustering module counted migrants per route.';

// The summary to show, or the notice explaining why there is none.
function summaryFor(result) {
  if (!result) return { summary: null, notice: 'Waiting for the final migration summary…' };
  const summary = migrationSummary(result);
  return summary ? { summary, notice: '' } : { summary: null, notice: OLDER_RESULT };
}

export default function MigrationOverview({ session }) {
  const links = [...session.graph.migrations.values()];
  const nodes = session.graph.nodes;
  const { summary, notice } = summaryFor(session.result);
  return (
    <div className="migration-overview">
      {summary && (
        <>
          <dl className="migration-metrics" aria-label="Migration totals">
            <div>
              <dt>Arrivals</dt>
              <dd>{format(summary.total)}</dd>
            </div>
            <div>
              <dt>Routes</dt>
              <dd>{format(summary.routes)}</dd>
            </div>
            <div>
              <dt>Islands</dt>
              <dd>{summary.islands.length}</dd>
            </div>
          </dl>
          <div className="migration-panels">
            <section className="migration-panel">
              <h2>Arrivals by route</h2>
              <div className="run-table-wrap">
                <table className="migration-matrix">
                  <caption className="migration-sr-only">Arrivals by source and destination island</caption>
                  <thead>
                    <tr>
                      <th scope="col">Source ↓ / Destination →</th>
                      {summary.islands.map((id) => (
                        <th scope="col" key={id}>
                          Island {id}
                        </th>
                      ))}
                      <th scope="col">Sent</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.rows.map((row, index) => (
                      <tr key={row.island}>
                        <th scope="row">Island {row.island}</th>
                        {row.cells.map((cell) => (
                          <td
                            key={cell.island}
                            className={cell.count ? 'migration-positive' : 'migration-zero'}
                            style={cell.count ? { '--intensity': cell.intensity } : undefined}
                            title={`Island ${row.island} → Island ${cell.island}: ${format(cell.count)} arrivals`}
                          >
                            {row.island === cell.island && cell.count === 0 ? '—' : format(cell.count)}
                          </td>
                        ))}
                        <td className="migration-total">{format(summary.totals[index].sent)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th scope="row">Received</th>
                      {summary.totals.map((row) => (
                        <td key={row.island}>{format(row.received)}</td>
                      ))}
                      <td>{format(summary.total)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <div className="migration-scale" aria-label={`0 to ${summary.maximum} arrivals`}>
                <span>0</span>
                <span className="migration-gradient" />
                <span>{format(summary.maximum)} arrivals</span>
              </div>
            </section>
            <section className="migration-panel">
              <h2>Island traffic</h2>
              {summary.totals.map((row) => (
                <div className="migration-bar-group" key={row.island}>
                  <h3>Island {row.island}</h3>
                  <div className="migration-bar-row">
                    <span>Sent</span>
                    <div className="migration-bar-track">
                      <i className="migration-sent" style={{ width: `${row.sent_percent}%` }} />
                    </div>
                    <strong>{format(row.sent)}</strong>
                  </div>
                  <div className="migration-bar-row">
                    <span>Received</span>
                    <div className="migration-bar-track">
                      <i className="migration-received" style={{ width: `${row.received_percent}%` }} />
                    </div>
                    <strong>{format(row.received)}</strong>
                  </div>
                </div>
              ))}
            </section>
          </div>
        </>
      )}
      {!summary && <p className="notice">{notice}</p>}
      <details className="migration-details">
        <summary>
          <span>All routes</span>
          <span className="migration-route-count">{format(links.length)} cluster links</span>
        </summary>
        {links.length ? (
          <div className="run-table-wrap">
            <table>
              <caption>Migration routes</caption>
              <thead>
                <tr>
                  <th>Source node</th>
                  <th>Source island</th>
                  <th>Arrival node</th>
                  <th>Arrival island</th>
                  <th>Migrants</th>
                </tr>
              </thead>
              <tbody>
                {links.map((link) => (
                  <tr key={link.id}>
                    <td>{link.source}</td>
                    <td>{nodes.get(link.source)?.island ?? 'Unavailable'}</td>
                    <td>{link.target}</td>
                    <td>{nodes.get(link.target)?.island ?? 'Unavailable'}</td>
                    <td>{format(link.count)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>No migration links are available yet.</p>
        )}
      </details>
    </div>
  );
}
