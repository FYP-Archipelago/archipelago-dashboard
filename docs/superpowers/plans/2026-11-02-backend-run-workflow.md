# Backend Run Workflow Cleanup Implementation Plan

> Use superpowers:executing-plans for inline task-by-task execution.

**Goal:** Complete Person 1 run setup/history and frontend cleanup without implementing Person 2's viewer.

**Architecture:** Backend-only shell; persistent run sidebar; new-run form; accepted configuration display; static/proxy-only Node server.

**Tech stack:** Existing React, Vite, Node test runner, jsdom/esbuild development tooling.

**Spec:** `docs/superpowers/specs/2026-11-02-backend-run-workflow-design.md`

## Global constraints

- No merge into main; no merge without a later user request.
- No Person 2 status/SSE/graph adapter/diagnostics work.
- No frontend scientific/analysis computation or generated demo data.
- No upload contract exists; remove the unsupported UI path.
- No Claude attribution or co-author trailers.
- Preserve ignored user data and existing dirty sibling checkouts.

## Review focus

- Backend-accepted run metadata survives reopen/refresh without inventing status.
- Identity changes cannot leak another backend's remembered runs.
- Storage failures cannot lose an accepted run ID.
- Browser Back and switching runs retain the intended current-run tab.
- Retired APIs cannot expose local files or execute old clustering/projection code.

### Task 1: History, configuration and navigation

Files: modify `src/runs/recent-runs.js`, `src/runs/navigation.js`; create shell/history/configuration modules under `src/app/`.

Interfaces: `useRunLibrary({api,storage})` supplies identity, entries, errors and remember/remove operations. `RunBrowserSidebar` receives this library and `onOpenRun`; `RunConfiguration` receives only remembered backend-accepted metadata. `runHash(id,page)` preserves ID across Archipelago/configuration routes.

- [ ] Write failing tests for metadata preservation, target isolation, sidebar open/remove, manual IDs, missing configuration and refresh/current-run tabs.
- [ ] Implement the history/configuration/sidebar modules with no status inference or backend data processing.
- [ ] Run focused tests and record results.

### Task 2: Backend-only form and shell

Files: modify `src/runs/RunsPage.jsx`, `src/main.jsx`, styles; create `src/app/DashboardApp.jsx` and `workspace.css`.

Interfaces: `RunsPage({api,onOpenRun})` submits the existing validated backend request and passes `{run}` accepted metadata to the shell. `DashboardApp({api,storage,Workspace})` uses the existing untouched Person 2 workspace boundary.

- [ ] Add interaction tests for new-run creation, batch/live mode, preserved draft while navigating, sidebar synchronization and storage failures.
- [ ] Remove Scale/upload/local-file navigation and stale copy. Keep only backend configuration and current-run navigation.
- [ ] Preserve existing carbon visual style and responsive access to sidebar controls.
- [ ] Run focused tests and build.

### Task 3: Retire obsolete compute and set migration visibility preference

Files: simplify `server/index.js`; remove `server/run.js`, `server/payload.js`, legacy local UI and Scale dataset/bridge; modify package dependencies. Add `src/viewer/visibility.js` and narrow renderer preference plumbing.

Interfaces: server serves static assets, `/api/backend-config`, `/api/status`, and the fixed `/backend` proxy. `migrationVisible` consumes render visibility flags and a default-false hidden-path opt-in; no graph reconstruction.

- [ ] Add tests proving retired API paths return 404 and hidden-path migrations default to hidden with an explicit opt-in.
- [ ] Remove obsolete compute routes, code and dependencies; preserve ignored local data.
- [ ] Implement only migration visibility preference in the retained renderer reference.
- [ ] Run full tests/build; inspect browser flow with a controlled fixture.

### Task 4: Review and prepare integration PR

- [ ] Document backend/Person 2 dependencies and scoped completion.
- [ ] Independent whole-branch review, then regression-test material fixes.
- [ ] Verify tests/build/whitespace and author attribution.
- [ ] Push `feat/backend-run-workflow`; replace draft PR #6 with a descriptive PR into `feat/backend-integration`.
- [ ] Leave main and integration unmerged; report exact remaining dependencies.

## Progress

- Branch renamed locally from `feat/person1-run-entry` to `feat/backend-run-workflow`.
- User explicitly clarified: leave Person 2's flows out and do not merge into main.
- Shared integration still points at `f46fd41`; backend has only main and no upload endpoint.

- Task 1: complete. Metadata and route regressions failed first, then passed; accepted configuration survives reopen and corrupt optional metadata is ignored safely.
- Task 2: complete. Sidebar/form/current-run tab tests pass, including storage failure and retained drafts. Per the latest user steering, Migration, Convergence, Clustering and Run details tabs are retained as placeholders; no Person 2 data fetching was added.
- Task 3: implemented. Local compute/import paths and synthetic Scale data are removed; Node/Vite share a static/proxy-only API surface with retired paths returning 404. Migration visibility helper is wired into the unbundled renderer reference only.
- Remote branch renamed to `feat/backend-run-workflow`; local tracking updated to the matching remote branch. No main or integration merge performed.
- Issues found: #7 is the user's combined workflow task; #8 belongs to Person 2. Missing upload split into dashboard #9, blocked by archipelago-backend #2, so #7 can be closed transparently under the revised scope.
- Application build succeeds at about 250 kB JS (previously about 5.19 MB) after unused dependencies were removed. Scientific processing is absent from the active bundle and Node service.
