# Faculty demonstration and review guide

Open https://archipelago-dashboard.vercel.app/#library. The public deployment is self-contained: it uses two real saved DE/Rastrigin searches, Python-clustered Results, recorded generation summaries and recorded-lineage Shapley artifacts. It does not require the backend or execute an optimiser. The persistent demonstration notice identifies this mode.

## Demonstration sequence

1. **Runs:** open the four-island ring recording, then repeat with the five-island fully connected recording. Both contain their actual recorded IDs, timestamps and execution settings.
2. **Archipelago:** inspect the clustered search trajectories; demonstrate island/path filters, migration visibility, best markers, node selection, rotation and zoom. Positions, graph statistics and cluster assignments were computed in Python.
3. **Migration:** inspect aggregate source/arrival clusters and migrant counts. These are aggregate routes, not individual delivery timestamps or latency measurements.
4. **Convergence:** compare recorded best-so-far fitness across islands. Expand generation values for generation-best, best-so-far, mean, fitness standard deviation, diversity and evaluation counts. Each line stops at that island's actual last record. Python copies summaries and prepares plotting coordinates; no missing generations are filled.
5. **Clustering:** inspect executed stages, resolved settings, counts, warnings, layout variance and MMD island separation. The offline clustering configuration is identified separately from the original execution settings.
6. **Explainability:** compare island and migration-route games; inspect coalition values, marginal contributions, ancestry coverage and sampling error. Switch between exact and sampled examples by changing the recording/game.
7. **Run details / Run configuration:** identify algorithm, objective direction, topology and analysis provenance. Reload or open the direct URL to demonstrate that saved views do not depend on a live service.

| Recording | Evaluations | Clusters | Graph edges | Migration routes | Generation summaries |
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

The connected implementation supports preset configuration, live/final-only runs, SSE updates, clustered graphs, persistence/reopening, cancellation, diagnostics and browser-local history. Automatic Shapley for new runs is in backend PR #3 and is used only when that review branch is running; it has not been merged to backend main.

The hosted demonstration additionally reads saved generation histories. The current backend Result does not expose a convergence series, detailed migration timing or a server-wide run/configuration listing. Those values are not reconstructed in the browser. Existing-run uploads and Scale study are excluded. A recorded walkthrough demonstrates presentation and data interpretation; it is separate from acceptance of the live runner–Redis–worker–database path.
