# HYPR V1 audit

## Audit result — 2026-09-05

The workspace contained an initialized Git repository with no commits, no tracked files, no untracked source files, no remote, package manifest, schema, deployment configuration, or environment templates. There was no existing implementation available to preserve.

This is therefore a clean bootstrap, not a rewrite of the earlier streaming demo described in the product brief. The earlier demo architecture (Next.js, mock adapters, Solana SDK, API/worker) exists only in the referenced conversation and is not present in this checkout.

## Current architecture

- Next.js App Router with React and TypeScript.
- Server-rendered Discover and room routes.
- Client components for wallet identity, follow, share, and room chat interactions.
- A small pons integration boundary under `src/lib/integrations/pons/`.
- Fixture data is the default runtime so the app is runnable without credentials.
- Optional public-RPC indexing can be enabled with `PONS_INDEXER_MODE=rpc`.
- No database, authentication service, service-role secret, or production indexer is configured.

## Reusable pieces

There were no repository pieces to reuse. The new boundaries intentionally keep wallet identity, HYPE scoring, pons indexing, and presentation separate so a future Supabase or API adapter can replace fixtures without a UI rewrite.

## Technical debt and known limitations

- Fixture data is not a production data source.
- Chat is a local UI interaction; it is not persisted or realtime yet.
- Follow state is local to the browser.
- Claiming currently requests a nonce-bearing demo signature but does not yet submit it to a server verifier.
- RPC indexing currently reads recent active-factory launch events and does not persist checkpoints or metadata reads.
- Font loading is remote CSS and should be self-hosted or replaced with `next/font` before a production launch.

## Security concerns

The app never requests or stores private keys. Wallet claims are not considered complete until a server-side nonce, signature, address, token, and expiry are verified. See `docs/SECURITY_NOTES.md`.

## Proposed V1 architecture

1. Keep the public app as a lean Next.js frontend.
2. Add Supabase tables for normalized tokens, events, rooms, claims, follows, chat messages, HYPE events/snapshots, and indexing state.
3. Run a small scheduled indexer against bounded RPC block ranges. Make event identity `transaction_hash + log_index` and checkpoint only after a successful batch.
4. Expose server-side read/write routes that enforce RLS and rate limits. Never send a service-role key to the browser.
5. Keep native streaming out of V1. A claimed room may later store an external stream URL.

## Immediate implementation status

The first high-value slice is complete in this bootstrap: Discover, room URLs with social metadata, local HYPE scoring, wallet/network detection, share and follow affordances, local chat composition, pons constants and event normalization, fallback-safe RPC reads, and the required architecture documentation.
