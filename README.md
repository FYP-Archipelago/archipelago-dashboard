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

## Use the dashboard

1. Start the backend, Postgres, Redis, clustering workers and runner using [the local integration guide](../local-integration/README.md). Start this dashboard with `npm run dev` and open <http://127.0.0.1:5173>.
2. On **Runs**, choose a backend preset and adjust the runner and clustering settings. Choose **Live updates** to see graph updates while the runner works, or **Final result only** to view the graph after clustering finishes. Click **Start run**.
3. The accepted `run_id` opens the **Archipelago** view. Status and connection text show queued, running, clustering, done or failed. The original WebGL viewer uses the backend's clustered nodes, lineage edges, migrations, positions and best flags. The view buttons **Overview**, **By island**, **Migration only**, **Shared ground** and **Best solution** control the original viewer. Its right rail contains island, path, height, migration, best marker and appearance controls. Drag to orbit, shift/right-drag to pan, scroll to zoom and click a node for backend details.
4. The top tabs provide aggregate **Migration** routes, **Clustering** diagnostics and MMD island separation, **Run details**, and accepted **Run configuration**. **Explainability** presents lineage-based Shapley attribution for available local recordings; see [the analysis guide](docs/local-explainability.md) for its data requirements and current backend boundary. **About** describes the analysis views. The backend does not currently provide a fitness-over-generation series or per-migration timing, so **Convergence** and detailed timing remain unavailable.
5. Refresh to reopen a saved result. The **Run** selector and the **Runs** page remember up to 30 IDs in this browser for the selected backend. You can also paste a known ID into the run browser. This is not a server-wide run list.

Run creation is not automatically retried if its response is lost, because the backend may already have accepted the run. Save the returned `run_id` when testing.

## Removed legacy paths

Local file imports, CSV decoding, PCA/projection, per-evaluation aggregation for backend runs, local metrics and the retired clustering API are removed from the backend-run workflow and Node server. The browser performs no scientific analysis. The optional Python explainability adapter reads ignored local `data/` records and exports attribution artifacts without genomes; raw run files are not exposed by the dashboard.

There is no upload endpoint in backend main, so no unsupported upload form is shown. Upload is tracked separately in [dashboard #9](https://github.com/FYP-Archipelago/archipelago-dashboard/issues/9), blocked by [backend #2](https://github.com/FYP-Archipelago/archipelago-backend/issues/2). No multipart contract is guessed and no old clustering route is used as a fallback.

The Node server only serves static files, `/api/status`, `/api/backend-config`, and the fixed-target backend HTTP/SSE proxy. Retired `/api/runs`, upload/import, local health/config and clustering routes return 404. It performs no run-data processing.

## Backend graph integration

`src/backend/useRunSession.js` consumes backend SSE status/update/final/error events and loads the saved result. `src/backend/graph-model.js` applies deltas by stable backend IDs. `src/viewer/backend-graph.js` maps that graph into the original `src/viewer/stn-viewer.js` WebGL renderer without invoking its legacy per-evaluation aggregation. The viewer preserves its camera, island and route filters, and selected backend node across live updates.

There is no backend run-list or run-status route. Status comes from events, final graphs from `/runs/{id}/result`. The viewer uses backend node IDs, coordinates, percentiles, island assignments, best markers, links and migrations directly.

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

Node tests cover API/proxy behavior, presets, navigation, SSE/result state, graph deltas and the backend-to-WebGL adapter. Browser verification should include both live and final-only runs from the local integration guide.
