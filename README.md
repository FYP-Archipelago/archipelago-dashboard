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

The Vercel demonstration uses an earlier dashboard build with `VITE_RECORDED_DEMO=true`. The integration work is now on `main`. It preloads two published recordings and exposes the original graph controls, aggregate migrations, clustering/separation diagnostics, recorded settings, convergence histories and Shapley analysis without a backend. It is labelled as a recorded-data demonstration. Run creation and live execution require normal backend mode; the demo never submits or simulates an execution request. Detailed migration timing remains explicitly unavailable.

`public/recorded-runs` contains final Results computed offline by the current Python module; `public/recorded-analytics` contains genuine saved generation summaries and Python-prepared chart geometry. Raw CSV, genomes, local host diagnostics and private logs are not served or uploaded. To regenerate graph/history artifacts, use the backend's Python environment from this dashboard directory:

```powershell
../archipelago-shapley-backend/.venv/Scripts/python.exe tools/demo/export.py
../archipelago-shapley-backend/.venv/Scripts/python.exe tools/demo/analytics.py
../archipelago-shapley-backend/.venv/Scripts/python.exe -m unittest discover -s tools/demo -p 'test_*.py'
```

For a local demo build, set `VITE_RECORDED_DEMO=true` before `npm run build`, then run `npm start`. Leave the flag unset for real backend integration. The hosted project has been published using explicit Vercel CLI deployments. Its deployed assets may differ from `main`.

See [the faculty demo guide](docs/faculty-demo-guide.md) for the walkthrough and validity/completeness review points.

### Connected backend

1. Start the backend, Postgres, Redis, clustering workers and runner using [the backend setup instructions](https://github.com/FYP-Archipelago/archipelago-backend#readme). Start this dashboard with `npm run dev` and open <http://127.0.0.1:5173>.
2. On **Runs**, choose a backend preset and adjust the runner and clustering settings. Choose **Live updates** to see graph updates while the runner works, or **Final result only** to view the graph after clustering finishes. Click **Start run**.
3. The accepted `run_id` opens the **Archipelago** view. Status and connection text show queued, running, clustering, done or failed. The original WebGL viewer uses the backend's clustered nodes, lineage edges, migrations, positions and best flags. The view buttons **Overview**, **By island**, **Migration only**, **Shared ground** and **Best solution** control the original viewer. Its right rail contains island, path, height, migration, best marker and appearance controls. Drag to orbit, shift/right-drag to pan, scroll to zoom and click a node for backend details.
4. The top tabs provide aggregate **Migration** routes, **Clustering** diagnostics and MMD island separation, **Run details**, and accepted **Run configuration**. **Explainability** reads Python-computed island and migration-route Shapley attribution from the backend. **About** describes the analysis views. **Convergence** displays the module's `generation_history` from the final result for both streaming and batched runs. It does not use a local log archive. Per-migration timing remains unavailable.
5. Refresh to reopen a saved result. The **Run** selector and the **Runs** page remember up to 30 IDs in this browser for the selected backend. You can also paste a known ID into the run browser. This is not a server-wide run list.

When a run is complete, **Replay run** starts from the earliest cluster on each island. Press **Play**, **Pause**, **Restart**, move the progress slider, or change speed to explore how the saved graph builds up. Migration routes appear once both endpoint clusters are visible. This is an illustrative replay ordered by node first-evaluation indices: the backend result contains aggregate route counts but no exact migration event times.

Run creation is not automatically retried if its response is lost, because the backend may already have accepted the run. Save the returned `run_id` when testing.

Active runs expose **Cancel run**. Cancellation uses the backend's acknowledged status, including completion races, and remains available if the event stream disconnects. **Run details** includes live/final layout method and retained-variance diagnostics. See [the faculty demo guide](docs/faculty-demo-guide.md) for the current walkthrough and research limitations.

## Removed legacy paths

Local file imports, CSV decoding, PCA/projection, per-evaluation aggregation for backend runs, local metrics and the retired clustering API are removed from the backend-run workflow and Node server. The Python module computes clustering, generation statistics, separation and Shapley attribution. The browser formats results, lays out the charts, and groups supplied route counts for display.

Existing-run upload is excluded from the current product scope. The dashboard has no upload tab or import workflow.

The Node server only serves static files, `/api/status`, `/api/backend-config`, and the fixed-target backend HTTP/SSE proxy. Retired `/api/runs`, upload/import, local health/config and clustering routes return 404. It performs no run-data processing.

## Backend graph integration

`src/backend/useRunSession.js` consumes backend SSE status/update/final/error events and loads the saved result. `src/backend/graph-model.js` applies deltas by stable backend IDs. `src/viewer/backend-graph.js` maps that graph into the original `src/viewer/stn-viewer.js` WebGL renderer without invoking its legacy per-evaluation aggregation. The viewer preserves its camera, island and route filters, and selected backend node across live updates.

The Python API exposes run history at `GET /runs` and run metadata at `GET /runs/{id}`. The dashboard still uses browser-local history, SSE for active status, and `/runs/{id}/result` for saved results. The Node proxy forwards the endpoints currently used by the dashboard. The viewer uses backend node IDs, coordinates, percentiles, island assignments, best markers, links and migrations directly.

| View | Backend contract / remaining data |
|---|---|
| Graph and inspection | Columnar `graph.nodes`, `graph.edges`, `graph.migrations`, best flags and coordinates already supplied |
| Clustering statistics | `clustering.counts`, `resolved`, `diagnostics`, `elapsed_seconds`, `malformed_rows`, `warnings` already supplied |
| Island separation | Backend `separation` pairs, windows and window pairs already supplied |
| Run details | Backend result `run` and `layout`; request settings may be remembered by this browser |
| Convergence time series | Uses final `generation_history` from the module; requires API `3749658` or later with module `e913411` or later. Update dependencies and restart API/workers, then start a new run; older results are not backfilled. |
| Detailed migration timings | Graph route counts exist; delivery latency and event timing are absent and require backend/module support if needed |

Missing analytical data must be added to the module/backend or shown as unavailable. Do not calculate substitute results in the frontend.

## Checks and branch

```sh
npm test
npm run build
```

Node tests cover API/proxy behavior, presets, navigation, SSE/result state, graph deltas and the backend-to-WebGL adapter. Browser verification should include both live and final-only runs from the local integration guide.
