# archipelago-dashboard

**Archipelago** is an explainability platform for distributed (island-model) evolutionary algorithms.

This is the dashboard for Archipelago. It starts runs on the [backend](https://github.com/FYP-Archipelago/archipelago-backend), shows the search trajectory network live as a run progresses, and presents migration, clustering, convergence and explainability analysis for each run. The clustering and analysis happen in the [archipelago](https://github.com/FYP-Archipelago/archipelago) module.

## Development

1. Clone the repository:

   ```bash
   git clone https://github.com/FYP-Archipelago/archipelago-dashboard
   cd archipelago-dashboard
   ```

2. Install the dependencies:

   ```bash
   bun install
   ```

3. Create your local `.env` from the example. `VITE_BACKEND_URL` defaults to `http://127.0.0.1:8000`, and the backend's `ARCHIPELAGO_CORS_ORIGINS` must allow the dashboard's origin:

   ```bash
   cp .env.example .env
   ```

4. Start the [backend](https://github.com/FYP-Archipelago/archipelago-backend#development), then start the dashboard and open <http://127.0.0.1:5173>:

   ```bash
   bun run dev
   ```

## Tests

To run the unit tests:

```bash
bun run test
```

## LICENSE

The project is licensed under the [MIT License](LICENSE).
