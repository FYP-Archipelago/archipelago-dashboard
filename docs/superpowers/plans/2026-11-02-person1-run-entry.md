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

**Interfaces:** `createBackendClient({baseUrl, fetchImpl, timeoutMs})` produces `health({signal})`, `presets({signal})`, `createRun(body)`, `result(runId,{signal})`, `identity({signal})`, `url(path)`, `baseUrl`. Proxy consumes a fixed configured backend URL.

- [x] Write tests for URL prefixes, run creation, health, FastAPI errors, non-JSON and network failures, abort/timeout, and malformed create success.
- [x] Run `node --test src/backend/api.test.js` and observe missing implementation.
- [x] Implement client; add streaming fixed-target proxy with path allowlist and no response buffering.
- [x] Test proxy status/body forwarding, SSE flush/disconnect and invalid paths using local HTTP servers.
- [x] Correct the existing Windows path assertion to use native path semantics.
- [x] Run `npm test`; record results and commit this task.

### Task 2: Validated new-run model and history (screenshots 2, 9)

**Files:** create `src/runs/run-form.js`, `src/runs/run-form.test.js`, `src/runs/recent-runs.js`, `src/runs/recent-runs.test.js`, `src/runs/navigation.js`, `src/runs/navigation.test.js`.

**Interfaces:** `validatePresets(payload)`, `buildRunRequest({catalog,preset,values,clustering,stream})`; `readRecentRuns(storage,backend)`, `rememberRun(storage,backend,entry)`, `forgetRun(storage,backend,id)`; `readRoute(hash)`, `runHash(runId)`.

- [x] Test actual runner catalog shape, bounds/choices/bools/unknown rules, optional seed, default omission, cross-field restrictions, stages and current clustering fields.
- [x] Test corrupted/disabled storage, duplicate runs, per-backend filtering and 30-entry limit; route encoding, malformed hashes and refresh parsing.
- [x] Observe tests fail, implement pure helpers, run `npm test`, commit.

### Task 3: Runs page and application handoff (screenshots 2, 7, 9; 6 blocked)

**Files:** create `src/runs/RunsPage.jsx`, `src/runs/ClusteringControls.jsx`, `src/runs/LocalRuns.jsx`, `src/runs/runs.css`, `src/backend/RunWorkspace.jsx`; modify `src/main.jsx`, `README.md`.

**Interfaces:** `RunsPage({api=backendApi,onOpenRun,localLibrary})`; `RunWorkspace({runId,api=backendApi,onBack})` is Person 2's replacement point. Shell routes are `#library` and `#archipelago?run_id=<id>`.

- [x] Add interaction tests for catalog loading/retry, validation, stage selection, accepted submission/navigation, no duplicate POST, retained values on errors, browser history/removal and tab changes.
- [x] Observe missing UI, implement page and controls using existing design tokens.
- [x] Replace old Runs entry with new page; retain clearly labeled local-file import, remove obsolete clustering form and copy. Keep viewer/analysis files unchanged.
- [x] Show upload as unavailable with the exact missing service capability; do not call a legacy endpoint.
- [x] Wire backend ID route/refresh/back, local selection clearing, and minimal selected-run boundary.
- [x] Run `npm test`, `npm run build`, controlled browser smoke check. Document local setup and Person 2's handoff.
- [x] Review diff, verify branch and clean staging, commit; push only the personal branch and link actual issues if they exist. Leave integration merge for teammates.

## Progress

- Baseline: 3/4 tests pass. `run ids stay inside the data root` fails on Windows because the assertion assumes `/` separators. Product path guard itself is not failing.
- Backend upload remains blocked: GitHub branch API and `git ls-remote --heads` both show only `main`; no upload route exists. Frontend rewrite and integration branches are identical.
- Task 1: complete. API and proxy tests failed for absent implementations, then `npm test` passed 12/12. Loopback tests require sandbox escalation (a minimal HTTP probe confirmed `connect EACCES` under sandbox); no product fix was needed for that environment restriction.
- Pre-flight: task 2's request model feeds task 1's `createRun(body)`; task 3 consumes the same client, model, route, and storage interfaces. No conflicting interfaces found.
- Decision: retain existing local API/server routes for compatibility, while the new default Runs workflow stops calling the obsolete clustering service. Upload to the current backend remains unavailable rather than guessed.
- Task 2: complete. New model/history/navigation tests first failed for missing implementations; full suite now passes 20/20.
- Validation tooling: add jsdom as a development-only dependency to exercise React interactions; runtime dependencies stay unchanged.
- Task 3: supported scope implemented. Full suite passes 28/28, including React submissions, duplicate guards, backend retry, stale response rejection, draft preservation, storage failure, and history actions. Browser checks verified the submitted request body, returned run ID route, refresh, reopening and Back navigation, and the explicit unavailable upload state. Preview is saved in ignored `.superpowers/runs-page-preview.png`.
- Real end-to-end run not executed: Docker Desktop's engine pipe is absent, and no backend/runner/DB/Redis listeners were found. Browser verification uses a controlled HTTP contract fixture, not a running EA.
- Scope status: screenshot tasks 1 and 2 implemented for local use; 6 blocked on backend upload; 7 implements the new-run path and upload-unavailable state; 9 stores/reopens IDs, with actual run status/result display deferred to Person 2's workspace.
- Final review: independent reviewer found no critical issues, two important error/history issues, and two local-library regressions. Both regressions were treated as important to preserve existing workflows; all four were fixed in one review pass with regression tests. Local library implementation now lives in `src/runs/LocalRuns.jsx` to keep Person 2's shell merge small.
- Review fix: HTML 5xx creation responses now carry ambiguous-acceptance warnings (test failed then passed).
- Review fix: `api.identity()` resolves an uncached `/api/backend-config` for the local proxy and uses the direct URL otherwise. History reads/writes use that actual target (target-switch test failed then passed). Both Vite and Node report the same target they proxy to.
- Review fix: local selector leaves the active analysis route intact and does not navigate after a delayed response; explicit library Open still navigates to the graph. Browser verified a 5-to-4-island switch stays on Migration.
- Review fix: restored local summaries, optional names and confirmed deletion, covered by the local-library interaction test (missing implementation then pass).
- Review exclusions accepted: real service E2E remains unverified because Docker is unavailable; Person 2's graph/SSE work and the backend upload endpoint remain outside this branch. Deployment is outside the user's requested scope. No deferred minor findings.
- Final verification: `npm test` passes 35/35; `npm run build` succeeds (existing large Plotly bundle warning); `git diff --check` passes. Browser verified the unchanged local graph and analysis-page selection, then created another contract-fixture run through the resolved proxy identity.
- Issue lookup repeated before push: no open dashboard issues exist yet, so no issue can accurately be closed or linked by number.

- Delivery: personal branch pushed; draft PR https://github.com/FYP-Archipelago/archipelago-dashboard/pull/6 targets `feat/backend-integration`. GitHub reports CLEAN at verification. Shared branch is unmerged. Temporary fixture and development servers stopped.
