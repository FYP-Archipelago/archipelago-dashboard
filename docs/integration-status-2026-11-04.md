# Integration readiness — 4 November 2026

## Branch state

Work is on `feat/backend-run-workflow`. Shapley, public sample artifacts, Scale removal and technical copy are committed in `9e01cf5`. Person 2's latest remote branch is still `gk/backend-live-viz` at `95a20d7`; its work is already included through merged PR #11 (`f596cd0`). Fetching revealed no further Person 2 commits to integrate. Backend `origin/main` remains `91d41a8`.

No push or merge to `feat/backend-integration` or `main` is part of this pass. PR #10 remains the review boundary. The public demo uses the separate `dashboard-redesign` branch and is unaffected by these integration checks.

## Implemented and reviewed

| Area | State |
| --- | --- |
| Shared API, backend health/identity, preset configuration and validation | Implemented; existing checks pass |
| New streaming and final-only runs | Implemented; HTTP/SSE fixture flow passes through the actual Vite proxy and frontend API client |
| Live status, graph deltas, final-result fallback and persisted reopening | Implemented; component/model/transport regressions cover failure and reconnect behavior |
| Migration visibility, filters, cluster inspection and original STN renderer | Retained; camera movement anchors now follow stable IDs across node deletion |
| Cancellation | Added active-run control and guarded request handling; acknowledges actual backend status, handles completion races, remains available after transport errors, ignores stale responses after navigation |
| Diagnostics | Live/final clustering metadata, MMD separation and layout method/retained variance are displayed |
| Result readiness | Success text requires an actual validated final result; done status alone shows a loading state |
| Malformed data | Layout/separation values, window indices and backend failure payloads are rejected before rendering or terminal-state changes |
| Recent run IDs and accepted configuration | Browser-local and backend-isolated; existing refresh/navigation checks pass |
| Shapley | Python implementation and two versioned public sample artifacts; island/route games, coalition values, permutation analysis and completeness reporting |
| Presentation | Technical copy and original viewer retained; Scale navigation and route removed |

## Verification evidence

- Full JavaScript suite: **82 tests**.
- Python lineage suite: **11 tests**.
- Production build, renderer/session syntax checks and `git diff --check`.
- The shared test fixture validates against the current Python module's `Result` model, loaded directly from its Git revision using Pydantic.
- `test-support/run-contract-smoke.js` passed streaming POST → HTTP/SSE → persisted GET → reopen, final-only equivalent without live graph updates, and cancellation POST → cancelled SSE → unavailable final result.
- Independent review verified cancellation after stream closure, transport failure during cancellation, late failures after terminal status, final-readiness gating, layout display and stable camera anchors. Final review's malformed-error edge case has a failing-then-passing regression.

The transport smoke backend is explicitly labelled test data. It runs no evolutionary algorithm, database or scientific analysis. Browser automation timed out during runtime initialization in this pass; jsdom rendered-component tests and actual HTTP/SSE checks ran instead. No fresh WebGL/GPU visual claim or real distributed-run claim is made. No Docker checks were run.

## Remaining backend work

1. **Automatic Shapley for new runs:** compute while complete individual parent/origin IDs are available, persist the explanation beside the final result and expose a run-scoped readiness/result endpoint. Aggregate cluster links cannot recover individual ancestry. Current Shapley support is for the supplied recordings.
2. **Existing-run upload:** endpoint, file/config contract and validation remain absent; dashboard #9/backend #2 remain open. Uploaded logs must not rerun the optimiser.
3. **Convergence:** per-generation/per-island fitness and diversity histories are absent. The corresponding view reports unavailable data.
4. **Detailed migrations:** individual delivery events, timestamps, outcomes, latency and generation drift are absent; aggregate routes/counts remain supported.
5. **Server history and metadata recovery:** no server run-list or metadata/config lookup endpoint. Browser-local history and locally accepted configuration are supported.
6. **Operational reliability:** idempotent create/recovery, runner readiness in health and early run metadata remain upstream enhancements.

## Before real-stack acceptance

Start API, runner, Redis, Postgres and clustering worker. Run one real streaming and one real final-only search; exercise cancellation, reconnection and persisted reopening. Native Redis/Postgres services are not installed on PATH, and the required services were not listening during this pass. These execution checks remain pending even though supported frontend contracts and regression tests pass.

## Reproduce the non-Docker transport check

Use separate shells from this checkout:

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

The smoke script checks the fixture marker before creating test runs, preventing accidental use against an actual backend.
