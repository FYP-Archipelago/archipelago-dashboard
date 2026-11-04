# Local Shapley explainability

Open the dashboard's **Explainability** tab and select a recorded run under **Analysis source**. Current local recordings include the four-island ring run and five-island fully connected run. These are real evaluation logs, not synthetic dashboard data. The existing clustered graph viewer is unchanged.

Prepare or refresh the artifacts from the dashboard directory before starting the server. On Windows, stop the dev server before refreshing: an actively served JSON file can remain locked against atomic replacement.

```powershell
npm run explainability:prepare
npm run dev
```

For another local raw-log directory:

```powershell
npm run explainability:prepare -- --data-root C:/path/to/runs
```

Each run directory must have a standard run ID, `evaluations.csv` and `run.jsonl` containing `run_start.datasets.maximising`. Evaluation records require globally unique `individual_id`, `island_id`, `fitness`, explicit `init` founders and semicolon-separated `parent_ids`. Migration arrivals require `origin_island` and `origin_individual_id`. Source logs are read only. The exporter writes JSON without genomes to `public/sample-explanations/`; it never runs the optimiser. The two already-public sample artifacts are versioned with the branch so a fresh checkout can demonstrate the page without raw logs. Review any additional artifacts before committing them. Rebuild after refreshing artifacts if using `npm start`.

## What the tab demonstrates

- **Islands / Migration routes:** independent coalition games, with bars sorted by allocated Shapley contribution. Bars scale to the largest contribution, and percentages share the game's allocated gain.
- **Coalition explorer:** enable players to read a Python-precomputed v(S). It is available for exact games of up to ten players.
- **Marginal contribution walk:** step through an illustrative order. Before/after values explain one allocation; the final bars average over all orders, or 1,024 deterministic sampled orders for larger games.
- **Evidence and completeness:** initial best, supported best, observed best, ancestry coverage and readable exclusions. Sampling standard errors concern numerical integration, not uncertainty between EA reruns.

The fixed baseline is the best recorded initial individual. Only evaluations whose **entire recorded ancestry** is supported count for a coalition. Fitness improvement reverses direction for minimisation/maximisation. In the migration game, all islands remain available: v(empty) measures local-only supported improvement. Route credit allocates only v(all) − v(empty). Island credit and route credit explain different games and must not be added together.

These are observational support scores. They do not predict the behaviour of an optimiser rerun with an island disabled. Recorded dependency does not imply numerical necessity or causal effect. Complete resolution of recorded IDs does not prove all parents or evaluations were logged.

## Current backend boundary

The current backend's persisted Result keeps aggregated cluster links and node statistics. It lacks individual ancestry, so a newly created backend run cannot automatically populate this prototype. The tab shows an unavailable state for such IDs instead of substituting a local recording.

The portable implementation is `tools/explainability/lineage.py`, with no web/React dependencies. To enable automatic support, call this logic from the Python clustering worker before raw lineage is discarded, persist its versioned artifact beside the final result, and expose a run-scoped endpoint. Define readiness/error state, source schema version and retention before wiring that endpoint to the UI. The existing `src/explainability/client.js` is the artifact transport adapter; replace that adapter when the backend endpoint exists. No scientific calculation belongs in the browser or the Node proxy.

The v1 artifact contains `run_id`, fitness direction/baselines, `coverage`, `warnings`, source metadata and two `games`. Each game carries players with value/share/bar percentage/standard error; method, seed and sample count; empty/full/allocated values and efficiency residual; precomputed exact coalitions; and illustrative permutation steps. `index.json` lists supported local run IDs and rejected source directories.

## Local trial

| Recorded run | Resolved evaluations | Island method | Route method | Total improvement | Local-only improvement | Route credit |
| --- | ---: | --- | --- | ---: | ---: | ---: |
| `run-20260903T230838Z-4891f68f` | 1,786 / 1,786 | Exact, 16 coalitions | Exact | 47.1454 | 23.8373 | 23.3081 |
| `run-20260903T230942Z-c7f38cc1` | 3,866 / 3,866 | Exact, 32 coalitions | 1,024 sampled orders | 65.5593 | 11.8034 | 53.7559 |

For the ring run, Island 1 receives about 41.2% of island credit; Island 2 receives 33.8%, Island 0 17.5%, and Island 3 7.5%. This describes the defined ancestry game for that one run, not a general ranking of islands or algorithms.

Run validation with `npm test`, `npm run test:explainability`, and `npm run build`. No Docker is required. The implementation plan and mathematical definition are in `docs/superpowers/plans/2026-11-03-lineage-explainability.md`.
