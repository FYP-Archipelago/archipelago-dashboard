# Archipelago JavaScript rewrite

## Public explainability demo

The **Explainability** tab presents precomputed lineage-based Shapley attribution for the two bundled DE/Rastrigin recordings. It includes island and directed-route contributions, exact coalition values where tractable, and permutation-marginal analysis. Computation runs in Python before deployment; the browser only renders saved artifacts. These are observational ancestry scores, not causal estimates from optimiser ablations. The original sample viewer and palette controls remain available; Scale study is removed from navigation.

Regenerate with `npm run explainability:prepare` when the raw sample directories are available in `data/`. The generated `public/sample-explanations/` JSON is versioned with this demo branch so redeployments preserve the sample page. Raw genomes are not included in those artifacts. Run `npm test`, `npm run test:explainability` and `npm run build` before deployment.

JavaScript implementation of the Archipelago frontend. No Streamlit or Python code is used by this app.

## Run

```bash
cd js-rewrite
npm install
npm run dev
```

Open <http://127.0.0.1:5173>. Vite proxies API calls to the Node server on port 4174. Runs and clustering results live in this checkout's `data/` directory. The directory is created automatically and ignored by Git; users can upload runs from the Runs page.

For clustered views, start the existing `archipelago-api` service separately. Set `ARCHIPELAGO_API_URL` before starting this app or change the service URL on the Runs page. The clustering service itself is outside this frontend rewrite.

## What was ported

- The six Streamlit pages and their sidebar navigation, controls, charts, tables, and run management.
- Schema 2.0 CSV and JSONL reading, compact genome decoding, PCA projection, and viewer payload preparation.
- Clustering API calls, stage controls, result persistence, and per-sample cluster labels.
- The WebGL2 network viewer and its CSS are copied from `archipelago_ui/viewer/frontend/`; only its Streamlit message bridge is replaced by a React mount adapter.

The Node server handles local paths and upload archives because browsers cannot safely read arbitrary directories.

## Production

```bash
npm ci
npm run build
npm start
```

The Node server serves the built UI and API together at <http://127.0.0.1:4174>. Set `HOST=0.0.0.0` and `PORT` for a container or hosting platform. Persist `data/` as a writable volume if uploaded runs should survive redeploys. The repository and Docker image include no run data.

```bash
docker build -t archipelago-js .
docker run -p 4174:4174 -v archipelago-runs:/app/data archipelago-js
```

For clustered views, set `ARCHIPELAGO_API_URL` to the separately deployed clustering service URL. The Runs page can also override it for the current session.

## Design

Colour tokens and the workspace layout live in `src/designs.css`. Island hues, migration cyan and best-solution pink are data encodings and are never themed.

The **Colour palette** bar at the top offers Tidal (deep teal), Graphite (charcoal and sage), Midnight (navy) and Fieldwork (forest green) for team testing. Graphite keeps the existing default. A selection applies across pages and charts, stays saved in that browser, and preserves the current viewer and camera. All palettes use the same graph background and data colours so comparisons reflect the interface palette alone.

## Check

```bash
npm test
npm run build
```
