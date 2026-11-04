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

### Hosted recorded demonstration

The Vercel demonstration is built from `feat/backend-integration` with `VITE_RECORDED_DEMO=true`. It preloads two published recordings and exposes the original graph controls, aggregate migrations, clustering/separation diagnostics, recorded settings and Shapley analysis without a backend. It is labelled as a recorded-data demonstration. Run creation and live execution require normal backend mode; the demo never submits or simulates an execution request. Convergence histories and detailed migration timing remain explicitly unavailable.

`public/recorded-runs` contains final Results computed offline by the current Python module; `public/sample-explanations` contains recorded-lineage attribution. Raw CSV, genomes, local host diagnostics and private logs are not served or uploaded. To regenerate graph artifacts, run `tools/demo/export.py` with the backend's Python environment and installed module from this dashboard directory, then run the exporter tests:

```powershell
../archipelago-shapley-backend/.venv/Scripts/python.exe tools/demo/export.py
../archipelago-shapley-backend/.venv/Scripts/python.exe -m unittest discover -s tools/demo -p 'test_*.py'
```

For a local demo build, set `VITE_RECORDED_DEMO=true` before `npm run build`, then run `npm start`. Leave the flag unset for real backend integration. The hosted project currently uses explicit CLI production deployments from the integration branch; Vercel Git connection requires repository access in Vercel and is not configured. Production deployment does not change main.

### Connected backend

1. Start the backend, Postgres, Redis, clustering workers and runner using [the backend setup instructions](https://github.com/FYP-Archipelago/archipelago-backend#readme). Start this dashboard with `npm run dev` and open <http://127.0.0.1:5173>.
2. On **Runs**, choose a backend preset and adjust the runner and clustering settings. Choose **Live updates** to see graph updates while the runner works, or **Final result only** to view the graph after clustering finishes. Click **Start run**.
3. The accepted `run_id` opens the **Archipelago** view. Status and connection text show queued, running, clustering, done or failed. The original WebGL viewer uses the backend's clustered nodes, lineage edges, migrations, positions and best flags. The view buttons **Overview**, **By island**, **Migration only**, **Shared ground** and **Best solution** control the original viewer. Its right rail contains island, path, height, migration, best marker and appearance controls. Drag to orbit, shift/right-drag to pan, scroll to zoom and click a node for backend details.
4. The top tabs provide aggregate **Migration** routes, **Clustering** diagnostics and MMD island separation, **Run details**, and accepted **Run configuration**. **Explainability** reads Python-computed island and migration-route Shapley attribution from the backend, with explicitly labelled sample recordings available independently. The Shapley backend extension must be installed for automatic analysis of new runs; see [the analysis guide](docs/local-explainability.md). **About** describes the analysis views. The backend does not currently provide a fitness-over-generation series or per-migration timing, so **Convergence** and detailed timing remain unavailable.
5. Refresh to reopen a saved result. The **Run** selector and the **Runs** page remember up to 30 IDs in this browser for the selected backend. You can also paste a known ID into the run browser. This is not a server-wide run list.

Run creation is not automatically retried if its response is lost, because the backend may already have accepted the run. Save the returned `run_id` when testing.

Active runs expose **Cancel run**. Cancellation uses the backend's acknowledged status, including completion races, and remains available if the event stream disconnects. **Run details** includes live/final layout method and retained-variance diagnostics. See [the integration status report](docs/integration-status-2026-11-04.md) for verified scope, real-stack acceptance checks and remaining backend capabilities.

## Removed legacy paths

Local file imports, CSV decoding, PCA/projection, per-evaluation aggregation for backend runs, local metrics and the retired clustering API are removed from the backend-run workflow and Node server. The browser performs no scientific analysis. The optional Python explainability adapter reads ignored local `data/` records and exports attribution artifacts without genomes; raw run files are not exposed by the dashboard.

Existing-run upload is excluded from the current product scope. The dashboard has no upload tab or import workflow.

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
| Shapley attribution | `GET /runs/{id}/explanation`: pending, ready or unavailable; requires the Shapley backend extension |
| Convergence time series | Generation histories are absent from the current result; backend/module must expose them if required |
| Detailed migration timings | Graph route counts exist; delivery latency and event timing are absent and require backend/module support if needed |

Missing analytical data must be added to the module/backend or shown as unavailable. Do not calculate substitute results in the frontend.

## Checks and branch

```sh
npm test
npm run build
```

Node tests cover API/proxy behavior, presets, navigation, SSE/result state, graph deltas and the backend-to-WebGL adapter. Browser verification should include both live and final-only runs from the local integration guide.
