# Faculty demonstration and review guide

Open https://archipelago-dashboard.vercel.app/#library. The public deployment is self-contained: it uses two real saved DE/Rastrigin searches, Python-clustered Results, recorded generation summaries and recorded-lineage Shapley artifacts. It does not require the backend or execute an optimiser. The persistent demonstration notice identifies this mode.

## Local live demonstration

Start the runner, PostgreSQL, Redis, API, clustering worker and dashboard. Open the [completed PSO–Ackley run](http://127.0.0.1:5173/#convergence?run_id=run-20261111T072559Z-23e1d867) on the presentation device. It has 14,712 evaluations, 2,662 nodes, 225 generation summaries and 87 arrivals over 9 directed routes. Its best fitness improved from 18.89 to 0.062. This URL requires the local database containing that run. Open Runs to start a fresh search if you want to show execution.

The local dashboard forwards `/backend/*` through Vite to the Python API. The Node server can forward those dashboard requests in a static deployment. The Python API starts runs, sends events and reads persisted results. The runner evaluates candidates and the clustering worker computes the graph and analysis.

## Hosted demonstration sequence

1. **Runs:** open the four-island ring recording, then repeat with the five-island fully connected recording. Both contain their actual recorded IDs, timestamps and execution settings.
2. **Archipelago:** inspect the clustered search trajectories; demonstrate island/path filters, migration visibility, best markers, node selection, rotation and zoom. Positions, graph statistics and cluster assignments were computed in Python.
3. **Migration:** inspect aggregate source/arrival clusters and migrant counts. These are aggregate routes, not individual delivery timestamps or latency measurements.
4. **Convergence:** compare recorded best-so-far fitness across islands. Expand generation values for generation-best, best-so-far, mean, fitness standard deviation, diversity and evaluation counts. Each line stops at that island's actual last record. Python copies summaries and prepares plotting coordinates; no missing generations are filled.
5. **Clustering:** inspect executed stages, resolved settings, counts, warnings, layout variance and MMD island separation. The offline clustering configuration is identified separately from the original execution settings.
6. **Explainability:** compare island and migration-route games; inspect coalition values, marginal contributions, ancestry coverage and sampling error. Switch between exact and sampled examples by changing the recording/game.
7. **Run details / Run configuration:** identify algorithm, objective direction, topology and analysis provenance. Reload or open the direct URL to demonstrate that saved views do not depend on a live service.

| Recording | Evaluations | Clusters | Graph edges | Migration cluster links | Generation summaries |
| --- | ---: | ---: | ---: | ---: | ---: |
| Four-island ring | 1,786 | 1,326 | 6,012 | 21 | 73 |
| Five-island fully connected | 3,866 | 2,313 | 8,487 | 287 | 86 |

## Validity questions for review

- Does the cluster graph preserve enough trajectory and migration structure for the intended research claims? Which sensitivity checks should be reported for clustering detail, projection and random-feature MMD?
- Is the observational coalition definition an appropriate measure of recorded support? An evaluation is supported only when its complete recorded ancestry is available. This does not estimate the outcome of rerunning the optimiser with an island or route disabled.
- Are the baselines and interpretation sufficiently explicit? Island credit and route credit explain separate games and must not be added. The route game's empty coalition retains migration-free progress.
- Are exact enumeration for small games and fixed-seed permutation sampling for larger games sufficient? Monte Carlo standard errors measure estimation error, not between-run variability or causal uncertainty.
- What independent runs, random seeds, objective families, topology comparisons, ablations and external baselines are required for empirical validity? These two recordings demonstrate functionality; they are not a comparative experiment or evidence of general superiority.
- Does the report need multiple-comparison treatment for MMD pairs/windows, uncertainty over repeated runs, or stronger checks on lineage completeness beyond resolving recorded IDs?

## Completeness boundaries

The connected dashboard supports preset configuration, live and batch runs, SSE graph updates, persistence and reopening, cancellation, diagnostics and browser-local history. Current final results include generation histories, aggregate route counts and module-computed Shapley attribution. Earlier saved results can lack those fields. The hosted demonstration is a separately deployed recording viewer.

Detailed migration timing remains unavailable in the result. Graph replay orders clusters by first evaluation and is illustrative. The API exposes run history and metadata. The dashboard keeps a browser-local list and recovers accepted settings from the API when opening a shared run URL. Existing-run upload and Scale study are outside the agreed scope.
