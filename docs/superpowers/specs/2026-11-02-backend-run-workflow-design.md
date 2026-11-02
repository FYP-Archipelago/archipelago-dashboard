# Backend run workflow cleanup

## User direction

Finish Person 1's run configuration/history and related frontend cleanup. Do not implement Person 2's status/SSE/graph/diagnostics/analysis flows. The latest instruction forbids merging into main. Work on `feat/backend-run-workflow` and prepare a reviewable change into `feat/backend-integration`; leave both unmerged.

## Verified contracts

Backend main remains the only remote branch. It supports presets, run creation, events, results, cancellation and health; it has no upload, run-list or run-metadata GET route. No Person 2 implementation has been pushed to the dashboard integration branch. Backend computation already supplies graph layout, fitness percentiles, node/edge/migration statistics, clustering counts and diagnostics, MMD separation and warnings. Do not recreate any of these in the browser or the dashboard's Node server.

## Design

Use a backend-only application shell in the existing carbon palette. A persistent run-browser sidebar offers a new run, remembered runs and manual ID entry. Top tabs correspond to the selected run: Archipelago, Migration, Convergence, Clustering, Run details and Run configuration. Archipelago keeps the existing Person 2 workspace boundary; the other analysis views remain explicit placeholders. Run configuration shows only backend-accepted settings remembered by this browser. A pasted ID with no remembered configuration shows an explicit empty state. No run status is inferred from remembered metadata.

The new-run form offers the API's presets, override controls, supported clustering settings and live/final-only mode, with existing validation and duplicate-submit protection. Remove the unusable upload tab rather than leaving a permanently disabled primary path. Form drafts survive run navigation. Accepted runs open the shared run ID route even when storage fails, with a keep-the-ID warning.

Sidebar history remains isolated by actual backend identity and limited to 30 entries per target. Store only backend-accepted request metadata along with the ID; reopening an existing ID preserves known metadata. Synchronize same-window and cross-window history changes. Show explicit requested mode, never a fabricated live/done status.

Retire local CSV/ZIP imports, clustering-service routes, projection/payload code and local analysis pages from the application. Delete synthetic Scale code. Preserve the user's ignored local data on disk; it is no longer loaded or exposed. Remove unused numerical/plotting/archive runtime dependencies. The Node server becomes a static server plus fixed-target HTTP/SSE proxy and uncached backend identity metadata.

Person 2's `src/backend/RunWorkspace.jsx` stays untouched. Preserve the old WebGL renderer source as an unbundled reference for their adapter; it must not be used through its evaluation aggregation path by the production app. Implement only the requested display preference there: migrations connected to hidden islands or paths are hidden by default, with an explicit opt-in. This is a visibility filter, not graph/statistical computation. Document its helper for Person 2 to carry into their adapter.

## Alternatives

Keeping local analysis active would violate the backend-computation direction and expose an obsolete second workflow. Rebuilding the missing live/final viewer would duplicate Person 2's assigned work and conflicts with the user's latest scope correction. The backend-only shell with an honest handoff is the scoped approach.

## Ownership and files

- `src/app/DashboardApp.jsx`, `src/app/RunBrowserSidebar.jsx`, `src/app/useRunLibrary.js`, `src/app/RunConfiguration.jsx`, `src/app/workspace.css`: shell, browser history and accepted configuration display.
- `src/runs/RunsPage.jsx`: run form only; `recent-runs.js` and `navigation.js`: metadata persistence and current-run routes.
- `src/viewer/visibility.js` plus a narrow change to `stn-viewer.js`: hidden-migration display preference only.
- `server/index.js`: static files, metadata and fixed-target proxy only.
- Retire Scale, local import/analysis and their unused dependencies. Keep backend service and graph ingestion unchanged.

## Validation and delivery

Use regression tests for live/batch request bodies, form retention, metadata preservation, identity-scoped sidebar history, storage failure, refresh/back/current-run routes, unavailable configuration and hidden-path visibility. Test retired Node endpoints return 404 and no longer expose local files or accept imports. Build and inspect the sidebar/form in a browser using controlled API responses. Do not call these real runner E2E tests. Request one independent review; fix material findings; push the descriptive branch and replace the earlier personal-branch PR. No main merge, no Claude attribution.

## Remaining backend/Person 2 requirements

Person 2 must connect status, live deltas, final result, graph rendering and backend statistics. Missing generation time-series or detailed migration timing cannot be calculated in the frontend: add them to the module/backend contract if needed. Existing-run upload requires a backend endpoint before a frontend upload flow can exist. No new computation is implemented here.
