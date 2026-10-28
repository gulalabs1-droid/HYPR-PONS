# HYPR

## Native market chart — October 28, 2026

Native rooms now include interactive confirmed price history, volume, line/candle
views and wallet-specific buy/sell fill markers. Select a trade to inspect its
time, exact token/ETH amounts, fee and explorer receipt. Watching needs no wallet.
The market line excludes trading fees; markers show actual fee-adjusted wallet
fills. This is historical native-curve data—not a live quote, USD feed, P&L or
post-graduation pool chart. See [data, precision and performance boundaries](docs/HYPR_MARKET_CHART.md).

Use the public [product overview](https://hypr-pons.vercel.app/about) for current
features and testnet limits. Later work is separate from the locked October 12
contest submission and is not backdated to its deadline.

## Native clips and replay pilot — October 15, 2026

Creators can opt into saving a private replay when starting a broadcast, or start
recording from the connected studio. Viewers can record the **next** 30 seconds
only when the creator enables clipping for that broadcast. Every capture becomes
a private draft; only the room creator can publish it. Published recordings have
permanent HYPR playback/share pages and do not require a wallet to watch.

This is browser recording, **not** full-length cloud DVR. Pilot limits are 10
minutes / 40 MiB per replay, 30 seconds / 8 MiB per clip, and 256 MiB total stored
or reserved capacity. No LiveKit cloud-egress jobs or paid plan changes are used.
See [recording architecture, permissions, tests, and operator limits](docs/HYPR_NATIVE_VIDEO.md).

## Current review materials — October 13, 2026

Start with the [dated product review guide](docs/HYPR_REVIEW_GUIDE_20261013.md)
for current access instructions, desktop/mobile captures, verified evidence and
remaining release gates. This progress update is separate from the locked
October 12 Crypto World's Fair submission; later changes are not represented
as having been completed before its deadline.

## Live data and native broadcasts

The public product uses real chain reads, actual media-publishing status, and shared wallet-authenticated chat/follows. No fixture launches or local social previews are shown. See [current source/freshness and release boundaries](docs/HYPR_LIVE_DATA.md). Older setup notes below describe prior prototype stages and may be historical.

## Crypto World's Fair — current prototype

- [Live testnet app](https://hypr-pons.vercel.app)
- [Submission package](docs/WORLDS_FAIR_SUBMISSION.md)
- [Public testnet evidence](docs/HYPR_CONTROLLED_DEMO.md)
- [Readiness audit](docs/HYPR_READINESS_AUDIT_20261012.md)

The deployed native protocol is on Robinhood Chain **testnet (46630)**. Creation,
controlled buying/selling and fee claims have public receipts. Native broadcasting
is implemented; actual creator-to-viewer media acceptance is a separate gate.
Chat/follows use shared wallet-authenticated storage. Uniswap v4 graduation is fork-tested, not a
completed public graduation. No mainnet, traction or million-user readiness is
claimed. Bootstrap work predates the competition and is disclosed in the package.

The older Open House/Singapore drafts below are historical planning context,
not the current contest checklist.

HYPR is the live launchpad for Robinhood Chain: create, go live from the browser, trade, earn, progress on a bonding curve, graduate to Uniswap v4, and keep the community in a persistent room. This repository is the V1 web/bootstrap slice, with Pons discovery integration, activity-first HYPE, wallet/network detection, sharing, native LiveKit room plumbing, and safe fixture/RPC data boundaries preserved.

## Run locally

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`. Demo mode is the default and requires no credentials. Set `PONS_INDEXER_MODE=rpc` to read recent active-factory launch events from the public RPC. The UI labels empty, partial, and fallback states; fixture metrics are not production traction.

Native browser live rooms use LiveKit. Set `LIVEKIT_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET` on the server only. The room token route grants viewers subscribe-only access and requires the verified native launch creator to sign a short-lived, transaction-free authorization before publishing camera and microphone tracks. Without those settings, the site stays in an honest offline/setup state.

When a native HYPR factory is configured, `/protocol` provides a read-only testnet accounting view backed by the same bounded, confirmation-buffered RPC reads. It has no claim, withdrawal, or configuration controls. A reviewed Supabase persistence baseline and optional server-only claim adapter are in `supabase/migrations/0001_hypr_v1.sql` and `src/lib/supabase/server.ts`; demo mode remains credential-free until that project is explicitly configured.

After applying the migration and configuring server-only Supabase credentials, the bounded persistence worker can be run once with `HYPR_INDEXER_SOURCE=pons npm run indexer:once` or `HYPR_INDEXER_SOURCE=hypr npm run indexer:once`. It performs RPC reads and database writes only; it never signs or broadcasts a blockchain transaction.

To inspect the exact bounded batch without Supabase credentials or any database write, add `HYPR_INDEXER_DRY_RUN=1`; the worker prints its serialized payload and exits after the RPC read.

Useful checks:

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run security:smoke
npm run smoke -- http://127.0.0.1:3100
```

See `docs/HYPR_PROTOCOL_ARCHITECTURE.md` for the native protocol design, `docs/HYPR_PROTOCOL_TEST_PLAN.md` for the contract gate, `docs/HYPR_V1_AUDIT.md` for the repository audit, and `docs/LAUNCH_CHECKLIST.md` for what remains before production.
See `docs/SUPABASE_SCHEMA.md` for the persistence boundary and rollout requirements.
