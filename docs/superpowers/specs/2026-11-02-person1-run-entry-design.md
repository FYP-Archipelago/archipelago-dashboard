# Person 1: dashboard run entry

## Intent and scope

Connect the existing React dashboard to the current Archipelago backend. Person 1 owns API setup and run entry (screenshot tasks 1, 2, 6, 7, 9). Person 2 owns SSE lifecycle, completed/live graph adapters, diagnostics, and analysis pages (3, 4, 5, 8, 10). Preserve the dark dashboard and local-file analysis.

## Verified baseline

- Dashboard `feat/frontend-javascript-rewrite` and `feat/backend-integration` both point at `f46fd41`; use the latter as the merge target.
- Backend main `91d41a8` is the only remote branch. It provides `/health`, `/presets`, `POST /runs`, `/runs/{run_id}/events`, `/runs/{run_id}/result`, and cancellation.
- No upload endpoint exists, including in other backend branches. Task 6 is blocked on a backend contract, and task 7 can only be partially complete. Do not invent a multipart request or fall back to `/cluster/run`.
- The old local backend checkout is dirty and behind remote main. Read remote source without modifying that checkout.
- The dashboard currently imports local files into Node's data directory and calls the obsolete clustering service. Current backend results are columnar graphs, not per-genome label assignments.

## Approach

Use a separate shared browser API client, schema-driven runner form, current clustering controls, and browser history. Keep backend calls under `/backend` for local development, separate from the existing local-file `/api` namespace. Vite strips the prefix and proxies directly to the Python backend, including streaming. Existing Node production serving receives the same fixed-target proxy so local `npm start` also works. No deployment work is required.

Alternatives considered: replacing every local `/api` route would break local-file analysis and overlap Person 2's work; continuing the label-based `/cluster/run` API cannot represent current backend runs. Direct browser URLs remain an optional client setting for Person 2 and local configurations, but the local same-origin proxy is the default.

## Contracts and ownership

- `src/backend/api.js`: `createBackendClient`, `backendApi`, `BackendError`; URL building and consistent HTTP/network/non-JSON errors. Read-only methods accept abort signals; POST is never automatically retried.
- `src/runs/run-form.js`: preset payload validation, published `int`/`bool`/`choice` rules, defaults, request construction. Dotted override keys stay flat. Only keys published by `/presets` are sent. Runner cross-field errors remain readable from backend 422 responses.
- `src/runs/ClusteringControls.jsx`: LSH/BIRCH/DenStream flags, detail 0.5–2, nullable positive auto thresholds/half-life, positive mu, beta (0,1], positive integer hash count, integer clustering seed. Require a stage. Developer constants are never exposed.
- `src/runs/RunsPage.jsx`: backend connection health, preset fetch/retry, start form, upload unavailable state, remembered run selector, local library slot. Preserve forms while switching tabs and after errors. One in-flight submit at a time.
- `src/runs/recent-runs.js`: browser storage, deduplicated by backend URL + run ID, bounded to 30 entries; storage failure is reported without losing the created run.
- `src/runs/navigation.js`: `#archipelago?run_id=<id>` is the shared handoff. Refresh and browser navigation retain selection. No backend run-list endpoint is assumed.
- `src/backend/RunWorkspace.jsx`: minimal selected-run boundary; Person 2 replaces this component with their status/result/viewer implementation. It consumes `{runId, api, onBack}`. No fake status, local payload adapter, or SSE implementation in Person 1's work.
- `src/main.jsx`: thin shell wiring only; backend selection takes precedence over local runs. No changes to `src/viewer*`, graph rendering, migration or convergence implementations.
- Existing local imports remain explicitly local and do not claim to upload to the backend or rerun the EA. Hide obsolete clustering controls from the Runs page.

## Failure handling

Network and non-JSON failures provide actionable messages; FastAPI `detail` strings and validation arrays are readable. Aborted stale requests cannot update state. An ambiguous create-run failure instructs the user to check before retrying because POST has no idempotency key. Reject malformed successful responses without remembering bogus IDs. Health shows unavailable for either an HTTP failure or an unhealthy body.

The history is explicitly remembered by this browser, not global server history. Users can reopen an ID manually or remove any entry. Remember and navigate after an accepted run even when localStorage is unavailable. Switching local files clears backend selection.

## Validation and acceptance

Node tests cover real request/response shapes, error responses, override bounds/types/choices, clustering validation, malformed storage, deduplication and navigation. Add DOM interaction tests if the available runtime supports them without changing product dependencies. Exercise the API proxy against a local HTTP fixture, including flushed SSE and error status forwarding. Build the dashboard and inspect it in a browser with controlled backend responses. A real runner/Postgres/Redis end-to-end run requires those services; report whether available.

Task 1 and 2 can be complete independently of Person 2. Task 9 completes storage/selection, while status/result display belongs to Person 2. Do not close task 6, task 7, or full task 9 as end-to-end complete until their dependencies are merged and exercised. Do not merge the shared integration branch automatically.
