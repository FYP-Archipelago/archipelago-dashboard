# Archipelago dashboard

Backend-driven run configuration and run browsing for Archipelago. Search execution, clustering, layout, graph statistics and island-separation calculations belong to the Python backend/module.

## Local development

```sh
npm ci
cp .env.example .env
npm run dev
```

Open <http://127.0.0.1:5173>. Run `archipelago-backend` and its runner/Postgres/Redis separately. The default backend address is `http://127.0.0.1:8000`; edit `ARCHIPELAGO_BACKEND_URL` in `.env` and restart Vite when changing it.

Vite serves the UI, uncached `/api/backend-config` metadata and the fixed-target `/backend/*` proxy directly. The old second development server is no longer needed. For local static serving, run `npm run build` then `npm start`; export `ARCHIPELAGO_BACKEND_URL` in the shell for that Node process, which does not automatically load `.env`. An optional `VITE_BACKEND_URL` bypasses the proxy and requires backend CORS to allow the dashboard origin.

## Current workflow

- The persistent **Run browser** sidebar remembers up to 30 IDs per actual backend target. It offers manual ID entry, selection, and Forget (browser storage only). This is not a global backend run list.
- **New run** loads the backend's presets, defaults and override constraints. Choose runner overrides, supported clustering settings and either **Live updates** (`stream: true`) or **Final result only** (`stream: false`). Creation posts `{preset, overrides, stream, clustering}` to `/runs` and passes the accepted `run_id` to the shared workspace.
- **Run configuration** shows the accepted request settings remembered in this browser, including after refresh. It does not infer run status or resolve automatic clustering values. A pasted ID with no remembered settings shows an explicit unavailable state.
- Top tabs stay attached to the selected run: Archipelago, Migration, Convergence, Clustering, Run details, Run configuration. Analysis tabs remain explicit placeholders for Person 2; no fake charts, metrics or progress are displayed.
- Form drafts survive run/tab navigation. Requests are never automatically retried after creation failures because a lost response may mean the search was accepted. Storage failures still preserve the run ID handoff and display a keep-the-ID warning.

**Status/SSE, live graph deltas, completed backend graph rendering, diagnostics and analysis are still Person 2's work in [#8](https://github.com/FYP-Archipelago/archipelago-dashboard/issues/8).** The full live/batched visualization flow is not complete on this branch.

## Removed legacy paths

Scale and its synthetic dataset are removed. Local file imports, CSV decoding, PCA/projection, per-evaluation aggregation, local metrics and the retired clustering API are removed from the application and Node server. The unused archive, matrix and plotting dependencies are removed. Ignored local `data/` files are preserved on disk and no longer loaded, exposed or bundled.

There is no upload endpoint in backend main, so no unsupported upload form is shown. Upload is tracked separately in [dashboard #9](https://github.com/FYP-Archipelago/archipelago-dashboard/issues/9), blocked by [backend #2](https://github.com/FYP-Archipelago/archipelago-backend/issues/2). No multipart contract is guessed and no old clustering route is used as a fallback.

The Node server only serves static files, `/api/status`, `/api/backend-config`, and the fixed-target backend HTTP/SSE proxy. Retired `/api/runs`, upload/import, local health/config and clustering routes return 404. It performs no run-data processing.

## Person 2 handoff

`src/backend/RunWorkspace.jsx` remains unchanged as the graph/status entry point, consuming `{runId, api, onBack, warning}`. `src/app/AnalysisPlaceholder.jsx` preserves the other tabs. Replace those boundaries as needed, keeping the current-run URL and sidebar. The shell and run form do not consume SSE or fetch results.

The shared API client (`src/backend/api.js`) provides:

```js
api.url(`/runs/${encodeURIComponent(runId)}/events`); // EventSource URL
api.result(runId, {signal});
api.cancelRun(runId);
await api.identity({signal}); // actual backend target for storage
```

There is no backend GET run-list or run-status route. Status comes from events, final graphs from `/runs/{id}/result`. Use the backend's node IDs, coordinates, percentiles, island assignments, best markers and links directly; do not rebuild clusters or recompute their metrics.

The old WebGL source (`src/viewer/stn-viewer.js`) is retained as an **unbundled rendering reference**, not imported by the application. Its legacy evaluation-aggregation path must not be used by the backend adapter. A narrow display-only change hides migration edges connected to hidden islands or filtered paths by default; **Include migrations for hidden paths** explicitly opts in. Reuse `src/viewer/visibility.js` in the backend renderer to retain that preference. No status, delta or graph adapter was added here.

| View | Backend contract / remaining data |
|---|---|
| Graph and inspection | Columnar `graph.nodes`, `graph.edges`, `graph.migrations`, best flags and coordinates already supplied |
| Clustering statistics | `clustering.counts`, `resolved`, `diagnostics`, `elapsed_seconds`, `malformed_rows`, `warnings` already supplied |
| Island separation | Backend `separation` pairs, windows and window pairs already supplied |
| Run details | Backend result `run` and `layout`; request settings may be remembered by this browser |
| Convergence time series | Generation histories are absent from the current result; backend/module must expose them if required |
| Detailed migration timings | Graph route counts exist; delivery latency and event timing are absent and require backend/module support if needed |

Missing analytical data must be added to the module/backend or shown as unavailable. Do not calculate substitute results in the frontend.

## Checks and branch

```sh
npm test
npm run build
```

Node tests cover API/proxy behavior, retired endpoints, preset/cluster validation, sidebar/history/configuration, modes, navigation, storage failures and migration display filtering. jsdom/esbuild are development-only. Fixtures live under `test-support/` and are not imported into the application. Browser verification uses a controlled API fixture, not real EA execution.

Working branch: `feat/backend-run-workflow`, intended for review against `feat/backend-integration`. **Do not merge into main.** See the [current design](docs/superpowers/specs/2026-11-02-backend-run-workflow-design.md) and [plan](docs/superpowers/plans/2026-11-02-backend-run-workflow.md). No Claude attribution is added to commits.
