# Person 1 Run Entry Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Start current backend runs from the dashboard and reopen their IDs without overlapping Person 2's viewer work.

**Architecture:** Separate backend API and local-file API namespaces. A preset-driven Runs page creates a run and hands its ID to a URL-backed workspace boundary. Browser storage remembers IDs for the same backend.

**Tech Stack:** Existing React 19, Vite 6, Node built-in test runner; no product dependencies added.

**Spec:** `docs/superpowers/specs/2026-11-02-person1-run-entry-design.md`

## Global Constraints

- Person 1 owns tasks 1, 2, 6, 7, 9. Person 2 owns SSE/graph/analysis.
- No backend changes. No deployment changes. No invented upload endpoint.
- `feat/person1-run-entry` branches from `origin/feat/backend-integration` at `f46fd41`.
- Never change existing dirty checkouts or merge the shared branch automatically.
- Current clustering requires at least one stage; developer constants are never exposed.

## Review Focus

- Non-JSON proxy errors, 422 arrays, and ambiguous create failures must remain readable.
- Blank optional overrides/auto thresholds must not become zero or NaN.
- Storage failures must not strand an accepted run or allow cross-backend history leakage.
- Refresh/back navigation must retain a backend ID and never fetch it from the local-file API.
- Unmount or rapid reload must not allow stale health/preset responses to overwrite state.

### Task 1: Shared API and local proxy (screenshot 1)

**Files:** create `src/backend/api.js`, `src/backend/api.test.js`, `server/backend-proxy.js`, `server/backend-proxy.test.js`; modify `vite.config.js`, `server/index.js`, `.env.example`, `server/run.test.js`.

**Interfaces:** `createBackendClient({baseUrl, fetchImpl, timeoutMs})` produces `health({signal})`, `presets({signal})`, `createRun(body)`, `result(runId,{signal})`, `url(path)`, `baseUrl`. Proxy consumes a fixed configured backend URL.

- [ ] Write tests for URL prefixes, run creation, health, FastAPI errors, non-JSON and network failures, abort/timeout, and malformed create success.
- [ ] Run `node --test src/backend/api.test.js` and observe missing implementation.
- [ ] Implement client; add streaming fixed-target proxy with path allowlist and no response buffering.
- [ ] Test proxy status/body forwarding, SSE flush/disconnect and invalid paths using local HTTP servers.
- [ ] Correct the existing Windows path assertion to use native path semantics.
- [ ] Run `npm test`; record results and commit this task.

### Task 2: Validated new-run model and history (screenshots 2, 9)

**Files:** create `src/runs/run-form.js`, `src/runs/run-form.test.js`, `src/runs/recent-runs.js`, `src/runs/recent-runs.test.js`, `src/runs/navigation.js`, `src/runs/navigation.test.js`.

**Interfaces:** `validatePresets(payload)`, `buildRunRequest({catalog,preset,values,clustering,stream})`; `readRecentRuns(storage,backend)`, `rememberRun(storage,backend,entry)`, `forgetRun(storage,backend,id)`; `readRoute(hash)`, `runHash(runId)`.

- [ ] Test actual runner catalog shape, bounds/choices/bools/unknown rules, optional seed, default omission, cross-field restrictions, stages and current clustering fields.
- [ ] Test corrupted/disabled storage, duplicate runs, per-backend filtering and 30-entry limit; route encoding, malformed hashes and refresh parsing.
- [ ] Observe tests fail, implement pure helpers, run `npm test`, commit.

### Task 3: Runs page and application handoff (screenshots 2, 7, 9; 6 blocked)

**Files:** create `src/runs/RunsPage.jsx`, `src/runs/ClusteringControls.jsx`, `src/runs/runs.css`, `src/backend/RunWorkspace.jsx`; modify `src/main.jsx`, `README.md`.

**Interfaces:** `RunsPage({api=backendApi,onOpenRun,localLibrary})`; `RunWorkspace({runId,api=backendApi,onBack})` is Person 2's replacement point. Shell routes are `#library` and `#archipelago?run_id=<id>`.

- [ ] Add interaction tests for catalog loading/retry, validation, stage selection, accepted submission/navigation, no duplicate POST, retained values on errors, browser history/removal and tab changes.
- [ ] Observe missing UI, implement page and controls using existing design tokens.
- [ ] Replace old Runs entry with new page; retain clearly labeled local-file import, remove obsolete clustering form and copy. Keep viewer/analysis files unchanged.
- [ ] Show upload as unavailable with the exact missing service capability; do not call a legacy endpoint.
- [ ] Wire backend ID route/refresh/back, local selection clearing, and minimal selected-run boundary.
- [ ] Run `npm test`, `npm run build`, controlled browser smoke check. Document local setup and Person 2's handoff.
- [ ] Review diff, verify branch and clean staging, commit; push only the personal branch and link actual issues if they exist. Leave integration merge for teammates.

## Progress

- Baseline: 3/4 tests pass. `run ids stay inside the data root` fails on Windows because the assertion assumes `/` separators. Product path guard itself is not failing.
- Backend upload remains blocked: GitHub branch API and `git ls-remote --heads` both show only `main`; no upload route exists. Frontend rewrite and integration branches are identical.
- Task 1: complete. API and proxy tests failed for absent implementations, then `npm test` passed 12/12. Loopback tests require sandbox escalation (a minimal HTTP probe confirmed `connect EACCES` under sandbox); no product fix was needed for that environment restriction.
- Pre-flight: task 2's request model feeds task 1's `createRun(body)`; task 3 consumes the same client, model, route, and storage interfaces. No conflicting interfaces found.
- Decision: retain existing local API/server routes for compatibility, while the new default Runs workflow stops calling the obsolete clustering service. Upload to the current backend remains unavailable rather than guessed.
