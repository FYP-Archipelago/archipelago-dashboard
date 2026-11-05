# Lineage explainability implementation plan

**Goal:** Add a local Explainability tab showing island and migration-route Shapley attribution from recorded individual ancestry, without changing the Archipelago viewer.

**Architecture:** A portable, standard-library Python module reads schema-2 evaluation CSV and run metadata, computes two observational coalition games, and exports versioned JSON. React displays those artifacts; it performs no scientific computation. Artifacts and source logs remain ignored local files. The current backend result contains aggregated cluster links, not individual ancestry, so this prototype must never infer individual lineage from that graph.

**Constraints:** Local only; no push, merge, issue changes, frontend analytics, simulated product data, causal claims, or changes to the restored graph renderer. Reuse the existing clean frontend worktree and current branch. Preserve sibling backend edits.

## Recovered idea and corrections

The earlier chat proposed lineage-based Shapley for islands, operators, migrations and clusters, using one recorded run instead of rerunning asynchronous optimisation. Start with islands and directed migration routes. Identity of algorithm settings alone does not imply equal Shapley values: equality requires a symmetric *value function*. An OR path through an aggregated graph does not establish that a multi-parent evaluation could be generated. Require every recorded parent instead. Equal bars can still be a correct result when recorded lineages depend on all islands.

## Game definition

Let b be the best recorded initial-population fitness. Improvement q(x) is max(0, b-f(x)) for minimisation and max(0, f(x)-b) for maximisation. An evaluation's requirements are the union of its parents' requirements plus its own island and any directed cross-island dependency. Initial individuals have no parents. Non-initial records without parents, unresolved references, cycles and their descendants are excluded and counted. Baseline b is deliberately fixed across coalitions: attribution explains improvement beyond observed initial quality, not initial-population quality.

For the island game, v(S) is the largest q(x) among individuals whose complete recorded lineage requires only islands in S. For the migration game, keep all islands available and require only routes in S. Migration v(empty) can be positive (local-only improvement); migration credit sums to v(N)-v(empty). These are separate games and their credits must not be added together. Unsupported evaluations never become roots. The full-coalition best can differ from the observed best when logs are incomplete; show both.

For at most 10 players enumerate all coalition masks and apply the exact Shapley weights 1/(n * choose(n-1, |S|)). Above that use 1,024 deterministic random permutations, reporting per-player Monte Carlo standard errors (not run-to-run uncertainty). Both methods return illustrative permutation walks, precomputed coalition values where exact, contribution shares/bar lengths, baseline/full values and completeness diagnostics. A selected permutation demonstrates one marginal allocation, not the final average.

## Approaches

- Rerunning island ablations: expensive and answers an intervention question this prototype cannot validate; defer.
- Aggregated-cluster reachability: available in current results but loses individual dependencies and can introduce false ancestry; reject for lineage attribution.
- Raw-log observational game: chosen for this local prototype because recorded files already contain the required IDs. Future backend worker integration must compute before clustering discards lineage and persist the explanation with the result.

## Implementation tasks

- [x] Python core and tests: analytical two-player complement/dummy cases, minimisation/maximisation, migration baseline, missing/cyclic ancestry, order independence, exact/sampled efficiency and deterministic estimates. Export available valid run directories into `public/local-explainability/`, ignored by Git. No genomes in exported artifacts.
- [x] Separate React tab: real-run source picker, observed/attributable summary, island/route switch, accessible contribution bars, coalition explorer, permutation walkthrough, completeness panel and method explanation. Abort stale requests and show useful unavailable/error states. Add navigation and UI regression tests.
- [x] Run both recorded datasets, inspect attribution and coverage, run Python/Node suites and production build, and inspect the new tab in the browser at desktop/mobile widths.
- [x] Review mathematics, incomplete-data handling and UI interpretation; document results and the precise remaining backend integration contract.

## Verification outcome

69 Node tests and 11 Python tests pass; the production build passes. Both real recordings resolve all recorded ancestry. Independent review found and verified fixes for production JSON MIME, globally duplicate IDs, malformed sampled metadata and retained PSO origin fields. Origin provenance only establishes a direct dependency on an actual migration-arrival record. Browser checks covered exact island/route games, the larger sampled-route game, coalition changes, walkthrough controls, production artifact loading and mobile width. The mathematical and backend boundaries are documented in `docs/local-explainability.md`. Work remains local and uncommitted; no push or merge was performed.

## Review focus

1. Missing or duplicate IDs must not inflate support or be silently treated as founders.
2. Migration credit is additional to local-only improvement, not the whole run's improvement.
3. Baseline fitness direction comes from run metadata, never a guessed minimisation default.
4. Zero improvement and zero migrations need readable states, no NaN percentages.
5. Switching runs cannot display an old run's explanation under a new ID.

## Sources

- Shapley, *A Value for n-Person Games*: https://doi.org/10.1515/9781400881970-018
- Frye, Rowat and Feige, *Asymmetric Shapley values*: https://proceedings.neurips.cc/paper/2020/hash/0d770c496aa3da6d2c3f2bd19e7b9d6b-Abstract.html . This prototype uses ordinary symmetric Shapley over an explicitly defined observational game, not that paper's causal method.

## Remaining backend work

Add a versioned explanation artifact to the Python module's finalisation path while raw IDs/parent IDs are available; save it alongside persisted results; expose a run-scoped GET endpoint with readiness/completeness status. Define raw-lineage retention and size limits. The current clustered Result alone cannot supply this feature. Live attribution, multi-run uncertainty, operator/cluster games and causal ablation experiments are deferred.
