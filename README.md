# HYPR

HYPR is the social discovery layer for Robinhood Chain communities. This bootstrap is the first V1 slice for pons launches: Discover, automatic community rooms, activity-first HYPE, wallet/network detection, sharing, and safe fixture/RPC data boundaries.

## Run locally

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`. Demo mode is the default and requires no credentials. Set `PONS_INDEXER_MODE=rpc` to read recent active-factory launch events from the public RPC; the app falls back to fixtures if the endpoint is unavailable.

Useful checks:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

See `docs/HYPR_V1_AUDIT.md` for the repository audit and `docs/LAUNCH_CHECKLIST.md` for what remains before production.
