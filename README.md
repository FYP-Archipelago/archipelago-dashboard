# Archipelago dashboard

React dashboard for Archipelago's distributed evolutionary searches. The Runs page starts searches through the current Python backend; the local file library opens finished schema 2.0 logs for local analysis.

## Local development

```sh
npm ci
cp .env.example .env
npm run dev
```

Open <http://127.0.0.1:5173>. Start `archipelago-backend` and its runner, Postgres and Redis separately, following the backend repository's README. The default backend address is `http://127.0.0.1:8000`; change `ARCHIPELAGO_BACKEND_URL` in `.env` and restart Vite if needed.

- `/backend/*` goes to the current Python backend; Vite removes the prefix and streams SSE without buffering.
- `/api/*` goes to this dashboard's local Node service on port 4174 for local-file analysis.
- Alternatively, set `VITE_BACKEND_URL` to a direct backend URL and allow this dashboard origin in the backend's CORS configuration. This value is read at frontend build/start time.
- For local `npm start` after `npm run build`, export `ARCHIPELAGO_BACKEND_URL` in the shell; Node does not automatically read `.env`. The Node service serves the UI and the same `/backend` proxy.

## Run entry

**Start a new run:** preset descriptions, algorithm, benchmark, default values, override types, choices and limits come from `GET /presets`. Choose at least one clustering stage, optionally tune supported settings, then submit `{preset, overrides, stream, clustering}` to `POST /runs`. An accepted run is remembered and opens `#archipelago?run_id=<id>`. Creation requests are never automatically retried: a lost response may mean the run was accepted.

**Upload an existing run:** currently unavailable. Backend main has no upload endpoint, and no other backend branch existed when checked on 2026-11-02. No upload request format is assumed and the page does not fall back to the retired clustering API. This requires backend work before screenshot task 6 and the upload half of task 7 can be completed.

**Reopen a run:** paste its ID or select a run remembered by this browser. History is scoped to the configured backend, deduplicated, and limited to 30 IDs per backend. It is not a global server run list. Removing a remembered ID only changes browser storage. A shareable page URL also retains the ID through refresh and browser navigation.

**Local files:** the expandable local file library accepts a zip, loose files, or a directory readable by the Node process. It requires `evaluations.csv`; `run.jsonl` and `summary.json` enable additional analysis pages. This imports files into local `data/`, not into the current backend. Existing local-file visualization remains available. The old clustering submission form has been removed from the Runs page.

## Person 2 handoff

The integration base and frontend rewrite branch were identical at `f46fd41`. Person 1's branch is `feat/person1-run-entry`, intended to merge into `feat/backend-integration` after both tracks are ready.

`src/backend/RunWorkspace.jsx` is deliberately a small selected-run boundary. **Live status and backend graph rendering are not implemented on Person 1's branch.** Person 2 replaces this component with the SSE/status/result/viewer work, consuming:

```jsx
<RunWorkspace runId={backendRunId} api={backendApi} onBack={...} warning={...} />
```

The shared client lives in `src/backend/api.js`:

```js
api.url(`/runs/${encodeURIComponent(runId)}/events`); // EventSource URL
api.result(runId, {signal});                       // GET persisted final result
api.cancelRun(runId);                            // POST cancel
api.request(path, {method, body, signal});
```

Use `api.baseUrl` to identify the backend. Creation returns the backend's `RunStatus` with `run_id`, not the old `job_id`. Status values include `cancelled`. There is no backend `GET /runs` or `GET /runs/{id}` status route; consume SSE status events. Handle a persisted result after event-stream expiry. Person 2 owns cleanup/reconnect/delta semantics and graph adaptation. The existing graph, migration and convergence files were not changed in this branch.

Person 1 owns `src/runs/**`, `src/backend/api*`, local proxy/config, and the small Runs/navigation wiring in `src/main.jsx`. Person 2 should concentrate on `src/backend/RunWorkspace.jsx` and graph modules; analysis-page wiring in `src/main.jsx` should be merged deliberately rather than replacing the entire shell.

See the [design](docs/superpowers/specs/2026-11-02-person1-run-entry-design.md) and [action plan](docs/superpowers/plans/2026-11-02-person1-run-entry.md) for task acceptance and remaining dependencies.

## Checks

```sh
npm test
npm run build
```

Tests use Node's test runner, local HTTP fixture servers for JSON/SSE proxy behavior, and jsdom for React form interactions. The browser test bundle is generated under ignored `.superpowers/ui-tests/`. No real EA execution is performed by tests.

Colour tokens and the workspace layout live in `src/designs.css`. Island hues, migration cyan and best-solution pink remain data encodings.
