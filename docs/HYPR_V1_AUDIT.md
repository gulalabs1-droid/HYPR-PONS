# HYPR V1 audit

## Audit result — 2026-09-06

The initial bootstrap inspection found no implementation to preserve from the earlier streaming demo described in the product brief. The current checkout has since been built into a Next.js/TypeScript consumer shell plus a Foundry protocol package; the status below is the current audit, not a description of the original empty checkout.

## Current architecture

- Next.js App Router with React and TypeScript.
- Server-rendered Discover and room routes.
- Client components for wallet identity, follow, share, and room chat interactions.
- A bounded Pons integration boundary under `src/lib/integrations/pons/`, retained as an external discovery/market reference.
- A native HYPR integration boundary under `src/lib/integrations/hypr/` for configured factory event reads and curve state.
- Fixture, partial, native, and unconfigured states are explicit; no fake onchain totals are shown.
- Optional public-RPC reads can be enabled for Pons and native HYPR launches.
- The Supabase migration and server-only RPC adapter support durable claims, but no project or credentials are configured in this workspace.
- External YouTube/Twitch embeds are allowlisted for the live surface; HYPR does not run a video backend.
- The proposed standalone onchain Room Registry was reviewed and deliberately not added to V0: native HYPR already emits the creator in `LaunchCreated`, while Pons creator attribution is an indexed deployer signal. A second registry would duplicate the durable claim boundary, add revocation/admin questions, and create no trading or discovery capability that the current protocol does not already provide. The current signature-plus-indexed-creator claim path remains the smallest honest identity feature; an onchain registry can be reconsidered after testnet evidence and independent review.

## Reusable pieces

The reusable work is the existing Discover/room shell, wallet/network handling, normalized event identities, Pons adapter, shared launch model, native protocol adapter, and persistence seams. The boundaries keep wallet identity, HYPE scoring, Pons discovery, native HYPR state, and presentation separate so a future Supabase/indexer adapter can replace fixtures without a UI rewrite.

## Technical debt and known limitations

- Fixture data is not a production data source.
- Chat is a local UI interaction; it is not persisted or realtime yet.
- Follow state is local to the browser.
- Claiming now submits a short-lived challenge to the server and verifies the recovered signer against the indexed deployer/creator. An optional Supabase-backed claim adapter and atomic finalization RPCs are present; applying the migration and operating a distributed verifier remain open.
- RPC indexing currently reads recent active-factory launch events with confirmation buffers, bounded Pons token metadata, bounded Uniswap V3 pool swap counts, and validated WETH-denominated pool price/liquidity state, but does not yet run a configured persistence worker or holder/graduation reads. The server-only batch boundary preserves the last good cursor and records failed-batch diagnostics when configured.
- Native curve buy/sell UI now exists behind native onchain-room detection, with exact quote views, wallet signing, slippage bounds, deadlines, and receipt polling; it is not a substitute for a live testnet transaction proof.
- Fonts use a deterministic local system stack; no remote font stylesheet is required by the production shell.

## Security concerns

The app never requests or stores private keys. With no Supabase credentials, the process-local claim verifier checks a server-issued challenge, signature, address, token, expiry, and indexed deployer/creator. With the optional server-only adapter configured, the same check is finalized through durable claim records and an atomic room update; this still is not production approval. See `docs/SECURITY_NOTES.md`.

## Proposed V1 architecture

1. Keep the public app as a lean Next.js frontend.
2. Apply the Supabase migration for normalized tokens, events, rooms, claims, follows, chat messages, HYPE events/snapshots, and indexing state.
3. Run a small scheduled indexer against bounded RPC block ranges. Make event identity `transaction_hash + log_index` and checkpoint only after a successful batch.
4. Expose server-side read/write routes that enforce RLS and rate limits. Never send a service-role key to the browser.
5. Use the native LiveKit room plumbing for HYPR creators and viewers; keep the allowlisted external embed only as an explicitly labeled compatibility fallback.

## Immediate implementation status

The first high-value slice is complete: Discover, room URLs with social metadata, local HYPE scoring, wallet/network detection, share and follow affordances, local chat composition, Pons constants and event normalization, fallback-safe RPC reads, native curve quote/trade controls, durable-claim RPC definitions, an external live-launch surface, production runtime smoke checks, and the required architecture documentation. Testnet deployment, verified source, durable database application, hosted CI execution, and independent security review remain release gates.
