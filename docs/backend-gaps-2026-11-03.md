# Backend contract gaps — 3 November 2026

Audited backend `origin/main` at `91d41a8890e47bd0b09e085590786569dedbc802`, particularly `app/routes.py`, `app/models.py`, and the clustering module's Result/Update contracts. This is a contract audit, not a claim that backend container tests or real runner execution were performed. Docker checks were explicitly excluded.

## Implemented already

Presets and allowed overrides, run creation with streaming/batch configuration, SSE status/update/final/error events, persisted final results, cancellation, backend clustering/layout, graph statistics and best markers, diagnostics/warnings, and island-separation results. These do not need frontend replacements or new scientific computation in the dashboard.

## Missing capabilities

| Priority / purpose | Missing backend capability | Dashboard consequence |
|---|---|---|
| Required for upload workflow | Existing-run upload endpoint, documented file/config format, validation and persisted compatible run ID | Upload cannot be completed. Tracked in [backend #2](https://github.com/FYP-Archipelago/archipelago-backend/issues/2), with [dashboard #9](https://github.com/FYP-Archipelago/archipelago-dashboard/issues/9). It must cluster logs without restarting the evolutionary runner. |
| Needed for full Convergence page | Per-island generation/wall-time fitness and diversity series | Current result has aggregate node fitness and progress, not a generation history. The UI correctly reports unavailable; backend/module must supply a series if this chart is required. |
| Needed for detailed Migration analysis | Individual send/arrival events, delivery outcomes, timestamps, latency and generation drift | Current graph supplies aggregated route endpoints/counts only. Aggregate route tables work; detailed latency or event timelines cannot be reconstructed in the frontend. |
| Needed for server-wide browsing | Run-list/history endpoint | Browser history only contains IDs remembered by that browser. It is not a server run library. |
| Needed to recover full configuration for arbitrary IDs | GET run metadata/status/configuration endpoint | RunStatus includes accepted settings when creating/cancelling, and final Result includes run summary metadata, but an ID opened in a different browser cannot retrieve its original overrides/clustering request through a dedicated metadata lookup. |

## Reliability/observability enhancements, not missing core clustering features

- **Idempotent create/recovery:** `POST /runs` mints a new run ID; there is no client idempotency key. Losing the response leaves an ambiguous creation, so the frontend warns rather than automatically retrying. A client request key plus lookup would allow safe retries and recovery.
- **Runner readiness in health:** `/health` checks Postgres and Redis, not runner availability. An OK response alone does not guarantee preset retrieval or runner start will succeed. The UI handles those failures separately; a runner readiness field/check would improve diagnosis.
- **Live run metadata:** Update contains graph/clustering/layout information; algorithm, benchmark, island list and objective direction are supplied with the final Result. Send run metadata early if live headings must show those values before completion without relying on remembered preset data.

## Remaining verification, not an implementation gap

Run one real streaming search and one final-only search through runner → Redis → worker → DB → API → browser, including cancellation/reconnect and persisted reopening. No Docker or real runner checks were run in this reliability pass. The original visual renderer and restored layout are unchanged; GPU/WebGL appearance is not established by jsdom tests.

## Reliability fixes in the dashboard branch

Empty graphs and run switches clear old rendered content; same-run nonempty updates retain the viewer. Incoming graph deltas and metadata are validated before React state updates. Malformed data shows a retryable error; failed/cancelled runs reject late successful updates; failed statuses allow a bounded wait for backend failure details. Live counts/diagnostics use SSE metadata. Persisted-result fallback, closed-stream recovery and unmount cleanup have regression coverage.

Scale/synthetic study content restored by the teammate is intentionally untouched in this pass to preserve the requested layout. Its removal remains a product-requirement decision, not a backend capability gap.
