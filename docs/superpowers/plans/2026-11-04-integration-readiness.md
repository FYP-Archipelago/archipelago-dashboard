# Combined integration readiness plan

Goal: publish the reviewed Shapley and frontend work to `feat/backend-run-workflow`, audit Person 2's merged status/graph implementation, fix verified interoperability failures, and report readiness before any push or merge to `feat/backend-integration` or `main`.

Constraints: preserve the original graph renderer and professional copy, remove Scale navigation, keep scientific calculations in Python, preserve dirty sibling backend edits, run no Docker tests, and do not fabricate APIs or unavailable analytics.

- [ ] Verify remote refs and API contracts; record actual new commits rather than assuming another merge is needed.
- [ ] Bring the published demo's undefined-run startup fix into Shapley, include the two public attribution artifacts for review without raw log files, and run existing Python/JS checks before committing and pushing own branch.
- [ ] Review merged streaming, batch-result fallback, run transitions, malformed payload handling, inspection and diagnostics against current backend contracts. Add regression cases for confirmed failures and implement fixes.
- [ ] Run non-Docker verification, review the final diff, update integration PR/status documentation and push only own branch. Leave shared integration and main refs unchanged.

Remote audit: frontend Person 2 branch remains `95a20d7`, merged in PR #11 (`f596cd0`) and included in current HEAD `ecf62ad`. Backend remains `91d41a8`. Integration target has no commits absent from the working branch (0 behind / 15 ahead before this pass).

Acceptance limits: no native runner/API/Postgres/Redis services are currently listening, and Redis/Postgres command-line services are not installed on PATH. Fixture, UI and transport checks can validate the frontend contract; real distributed execution requires a running service stack. Existing-run upload, convergence histories, detailed migration timing, metadata recovery and automatic Shapley persistence remain backend contract gaps unless upstream changes supply them.
