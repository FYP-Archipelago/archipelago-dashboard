# Integration readiness — 4 November 2026

> Historical snapshot from 4 November. See the [faculty demo guide](faculty-demo-guide.md) for the current workflow and limitations.

## Delivery and scope

Frontend source branch: `feat/backend-run-workflow`; integration target: `feat/backend-integration`, through [dashboard PR #10](https://github.com/FYP-Archipelago/archipelago-dashboard/pull/10). Person 2's `gk/backend-live-viz` at `95a20d7` is included through PR #11; the latest fetch contained no further changes. The original STN renderer is retained. Main and the separate deployed demo are outside this delivery.

The user authorized only Shapley-related backend additions. [Backend PR #3](https://github.com/FYP-Archipelago/archipelago-backend/pull/3), branch `feat/shapley-attribution-api`, adds Python analysis, final persistence and a run-scoped explanation API for teammate review. It is not merged automatically. Automatic analysis of new runs requires that backend extension and a restart of API and workers. Existing-run upload is excluded; no upload tab exists and dashboard issue #9 is closed as not planned. This scope supersedes earlier upload plans and backend-gap reports.

## Supported workflow

| Area | State |
| --- | --- |
| Configuration | Backend identity/health, presets, typed overrides, clustering stages, live/final-only choice, validation and duplicate-submit protection |
| Execution and results | Shared run ID, SSE lifecycle and graph deltas, final-result fallback, cancellation, reconnect and persisted reopening |
| Visualization | Original viewer, stable node identities and camera anchors, filters, best markers, cluster inspection and aggregate migration routes; hidden-path migrations disabled by default |
| Statistics | Backend counts, resolved settings, stage diagnostics, elapsed time, malformed rows, warnings, MMD separation and layout variance |
| History | Browser-local, backend-isolated run IDs and accepted configuration; manual reopening by ID |
| Shapley frontend | Backend pending/ready/unavailable states, bounded-interval polling, navigation cleanup and retry; independently selectable, clearly labelled public sample recordings |
| Shapley backend PR | Compact raw-lineage collection, exact/sampled observational games, batch/stream/replay agreement, bounded analysis, atomic graph/explanation persistence and GET explanation API |
| Presentation | Technical copy, Scale navigation/route removed; Migration and Convergence tabs retained |
| Validation | Malformed columns, references, deltas, metadata and error payloads become recoverable errors; final success requires complete metadata and matching run identity |

## Verification evidence

- **196 JavaScript tests**, **11 local Python analysis tests**, production build and whitespace checks pass.
- Backend PR: **38 tests plus 13 parameterized cases**, Ruff and format checks pass. Includes an actual installed-module worker boundary in both processing modes. External stores are replaced by doubles in persistence/API tests.
- Both real published recordings were recomputed through the new backend accumulator and accepted by the frontend validator: 1,786/1,786 and 3,866/3,866 supported evaluations.
- HTTP/SSE smoke checks pass through the actual Vite proxy and frontend API client: streaming creation, final-only creation, persisted graph reopening, pending-to-ready explanation and explanation reopening, cancellation and unavailable cancelled analysis.
- Independent review found a final-result metadata omission gap. Missing/null fields and nested clustering omissions were reproduced as failing tests, fixed, and reviewed again. Backend review reported no critical/important findings.

The transport smoke server is explicitly labelled test data. It executes no optimiser, database or scientific computation; explanation data is a Python-precomputed recording with a test identity. No real distributed-run or fresh GPU/WebGL acceptance claim is made. No Docker checks were run.

## Remaining acceptance and backend boundaries

The Shapley backend PR requires teammate review and merge before automatic analysis is available on backend main. Run the full Postgres/Redis integration suite on dedicated test services, then execute one real streaming and one real final-only search through runner → worker → persistence → API → dashboard. Verify cancellation, reconnect, persisted reopening and Shapley readiness. These real-service checks remain outstanding; the automated checks above do not establish deployment readiness.

The following are outside the authorized backend changes and are shown honestly in the frontend:

- Convergence histories and diversity series are absent from Result; the tab reports unavailable.
- Detailed migration timestamps, latency and generation drift are absent; aggregate route endpoints/counts are available.
- There is no server run-list or accepted-config lookup endpoint; history/configuration remain browser-local.
- Idempotent create recovery, runner readiness in health and early run metadata remain potential upstream enhancements.

## Reproduce non-Docker transport checks

Run each in a separate shell from this checkout:

```powershell
node test-support/integration-smoke-server.js
```

```powershell
$env:ARCHIPELAGO_BACKEND_URL='http://127.0.0.1:8181'
node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5180 --strictPort
```

```powershell
node test-support/run-contract-smoke.js
```

The smoke script checks the fixture marker before creating runs. Stop these two test servers afterwards. See the [faculty demo guide](faculty-demo-guide.md) for attribution semantics and analysis limits.
