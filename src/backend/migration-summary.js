const isCount = value => Number.isSafeInteger(value) && value >= 0;

const isRoute = route => route !== null && typeof route === 'object' && isCount(route.source) && isCount(route.destination) && isCount(route.migrants);

const percentOf = (value, total) => (total > 0 ? (100 * value) / total : 0);

// The island-by-island summary the Migration view shows, built from the module's per-route migrant counts.
// Returns null for results computed before the module counted migrants per route.
export function migrationSummary(result) {
  const routes = result?.migration_routes;
  if (routes === undefined) return null;

  const runIslands = result.run?.islands;
  if (!Array.isArray(routes) || !routes.every(isRoute) || !Array.isArray(runIslands) || !runIslands.every(isCount)) {
    throw new Error('The run result has malformed migration routes.');
  }

  const islands = [...new Set([...runIslands, ...routes.flatMap(route => [route.source, route.destination])])].sort((a, b) => a - b);
  const migrants = new Map(routes.map(route => [`${route.source}-${route.destination}`, route.migrants]));
  const between = (source, destination) => migrants.get(`${source}-${destination}`) ?? 0;

  const maximum = Math.max(0, ...routes.map(route => route.migrants));
  const totals = islands.map(island => ({
    island,
    sent: islands.reduce((sum, other) => sum + between(island, other), 0),
    received: islands.reduce((sum, other) => sum + between(other, island), 0),
  }));
  const busiest = Math.max(0, ...totals.map(total => Math.max(total.sent, total.received)));

  return {
    islands,
    total: routes.reduce((sum, route) => sum + route.migrants, 0),
    routes: routes.filter(route => route.migrants > 0).length,
    maximum,
    rows: islands.map(source => ({
      island: source,
      cells: islands.map(destination => ({
        island: destination,
        count: between(source, destination),
        intensity: maximum > 0 ? between(source, destination) / maximum : 0,
      })),
    })),
    totals: totals.map(total => ({
      ...total,
      sent_percent: percentOf(total.sent, busiest),
      received_percent: percentOf(total.received, busiest),
    })),
  };
}
