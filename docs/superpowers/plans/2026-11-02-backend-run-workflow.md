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

- [x] Write failing tests for metadata preservation, target isolation, sidebar open/remove, manual IDs, missing configuration and refresh/current-run tabs.
- [x] Implement the history/configuration/sidebar modules with no status inference or backend data processing.
- [x] Run focused tests and record results.

### Task 2: Backend-only form and shell

Files: modify `src/runs/RunsPage.jsx`, `src/main.jsx`, styles; create `src/app/DashboardApp.jsx` and `workspace.css`.

Interfaces: `RunsPage({api,onOpenRun})` submits the existing validated backend request and passes `{run}` accepted metadata to the shell. `DashboardApp({api,storage,Workspace})` uses the existing untouched Person 2 workspace boundary.

- [x] Add interaction tests for new-run creation, batch/live mode, preserved draft while navigating, sidebar synchronization and storage failures.
- [x] Remove Scale/upload/local-file navigation and stale copy. Keep only backend configuration and current-run navigation.
- [x] Preserve existing carbon visual style and responsive access to sidebar controls.
- [x] Run focused tests and build.

### Task 3: Retire obsolete compute and set migration visibility preference

Files: simplify `server/index.js`; remove `server/run.js`, `server/payload.js`, legacy local UI and Scale dataset/bridge; modify package dependencies. Add `src/viewer/visibility.js` and narrow renderer preference plumbing.

Interfaces: server serves static assets, `/api/backend-config`, `/api/status`, and the fixed `/backend` proxy. `migrationVisible` consumes render visibility flags and a default-false hidden-path opt-in; no graph reconstruction.

- [x] Add tests proving retired API paths return 404 and hidden-path migrations default to hidden with an explicit opt-in.
- [x] Remove obsolete compute routes, code and dependencies; preserve ignored local data.
- [x] Implement only migration visibility preference in the retained renderer reference.
- [x] Run full tests/build; inspect browser flow with a controlled fixture.

### Task 4: Review and prepare integration PR

- [x] Document backend/Person 2 dependencies and scoped completion.
- [x] Independent whole-branch review, then regression-test material fixes.
- [x] Verify tests/build/whitespace and author attribution.
- [x] Push `feat/backend-run-workflow`; replace draft PR #6 with a descriptive PR into `feat/backend-integration`.
- [x] Leave main and integration unmerged; report exact remaining dependencies.

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
- Independent review: one Important identity-loading race, no Critical/Minor findings. Fixed by gating creation until the run browser has identified the actual backend; delayed identity and retry tests failed before the fix, then passed. Unknown identity cannot expose cached configuration.
- Final suite: 41/41 tests pass. Browser fixture verified accepted final-only creation, sidebar selection, configuration after refresh, retained Migration placeholder and current-run routing. Real runner execution and active backend graph rendering remain outside this scoped work.
- Review exclusions accepted: Person 2's lifecycle/graph/analysis remains #8; real EA and WebGL appearance are unverified; no hosted-deployment claim is made. Remote delivery and issue closure are checked separately before completion.

- Delivery verified: remote branch is `feat/backend-run-workflow`; obsolete remote `feat/person1-run-entry` no longer exists. Origin URL now uses the canonical `archipelago-dashboard` repository name.
- Replacement draft PR #10 targets `feat/backend-integration` and GitHub reports CLEAN. PR #6 is closed. PR #5 into main remains OPEN with no merge timestamp; neither shared branch was merged.
- Issue #7 closed with an explicit completion/scope-split comment. Dashboard #9 and backend #2 track missing upload; Person 2 issue #8 remains OPEN.
- All new commits use S Sanjeev Srinivas's configured Git author identity with no co-author trailers or Claude attribution.
