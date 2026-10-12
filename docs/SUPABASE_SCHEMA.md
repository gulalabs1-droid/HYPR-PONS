# HYPR persistence baseline

Status: migration prepared but not applied. The repository remains credential-free and defaults to fixture data until a specific Supabase project is configured.

## Migration

Apply [`supabase/migrations/0001_hypr_v1.sql`](../supabase/migrations/0001_hypr_v1.sql) to the intended Supabase project through the reviewed migration workflow. It creates the normalized V1 entities:

- `hypr_chains`, `hypr_wallets`, and `hypr_profiles` for network-aware identity;
- `hypr_tokens` and `hypr_token_events` with unique `(chain_id, address)` and `(chain_id, transaction_hash, log_index)` identities;
- `hypr_rooms` and `hypr_room_claims` for one room per token and durable verified-claim history;
- `hypr_follows` and `hypr_chat_messages` for authenticated community interaction;
- `hypr_hype_events` and `hypr_hype_snapshots` for idempotent social scoring;
- `hypr_indexing_state` for per-source, per-chain checkpoints and errors.

The `hypr_` prefix protects the earlier Solana application's existing tables in
Supabase project `vxusuxsdjdsqgizilmrz`. Its unprefixed `profiles` table has a
different identity model and must not be altered by this migration. The RPC
names remain unchanged; their internal table references use the new prefix.

The migration seeds only the two documented Robinhood Chain IDs (`4663` and `46630`). It does not insert tokens, users, claims, chat, HYPE, or traction data.

## Trust boundaries

Public read access is limited to chain metadata, profiles, token/event records, rooms, and HYPE snapshots. Authenticated users can write only their own profile, wallet association, follows, chat messages, and HYPE events. Wallet ownership is checked by RLS for user-owned writes.

Token/event ingestion, room creation, verified claim records, checkpoints, and moderation actions are server/indexer responsibilities. They must use a server-side Supabase credential and validate the same address, chain, event, and confirmation rules used by the RPC readers. Never expose a service-role key in `NEXT_PUBLIC_*` variables or browser code. `src/lib/supabase/indexer.ts` now provides the server-only batch adapter; no worker invokes it until a project is intentionally configured.

## Indexer contract

For each source and chain, process only through the confirmation buffer, upsert tokens by `(chain_id, lower(address))`, and upsert events by `(chain_id, lower(transaction_hash), log_index)`. Advance `indexing_state.cursor_block` only after the entire batch and all dependent writes succeed. On restart, replay an overlap window; idempotent identities make that safe. On a suspected reorg, rewind the checkpoint to the last finalized ancestor and replay the bounded overlap before marking the source healthy.

## Claim contract

The optional server-only adapter in `src/lib/supabase/server.ts` uses the migration's `hypr_create_room_claim`, `hypr_get_room_claim`, and `hypr_finalize_room_claim` RPCs when both Supabase credentials are configured. Challenges are stored as pending rows with a SHA-256 challenge-id hash, exact signed message, claimant wallet, expiry, and status. Signature recovery remains in Node; finalization then rechecks the indexed creator and atomically marks the claim verified while updating `rooms.claimed_wallet_id`. Invalid signatures are rejected, replayed or expired rows cannot finalize, and a room cannot be reassigned.

The server-only indexer adapter in `src/lib/supabase/indexer.ts` calls `hypr_apply_index_batch`. That transaction serializes each source/chain, upserts token rows and their rooms, deduplicates events by `(chain_id, lower(transaction_hash), log_index)`, and advances the checkpoint only after all dependent writes succeed. A failed batch leaves the last good cursor untouched and best-effort marks the row through `hypr_mark_index_error`, preserving the original error. The opt-in `npm run indexer:once` command feeds bounded Pons v1 or native HYPR reads into this adapter; it performs only RPC reads and server-side database writes, never wallet or chain writes. After configuring a reviewed project, run it with `HYPR_INDEXER_SOURCE=pons npm run indexer:once` or `HYPR_INDEXER_SOURCE=hypr npm run indexer:once`. A restart can replay an overlap window safely. Scheduling and a configured project remain rollout work.

For credential-free review, `HYPR_INDEXER_DRY_RUN=1 HYPR_INDEXER_SOURCE=pons npm run indexer:once` prints the same serialized batch that would be passed to the transactional RPC and performs no database write. Dry-run failures also skip diagnostic writes.

Without both server credentials, the web verifier is intentionally process-local and does not write this schema. With credentials present, the adapter fails closed if the project has not been migrated or the indexed token/room is not persisted; it never silently falls back to process-local ownership.

## Rollout gate

Applying the migration alone does not enable full persistence. Before switching the app from fixtures, configure RLS-aware routes and rate limits, run migration/RPC tests in a disposable project, backfill bounded chain data, and verify restart/replay behavior. Chat, follows, profiles, HYPE, and worker scheduling still require their server adapters. Until those steps are complete, keep the current source labels and local interactions honest.
