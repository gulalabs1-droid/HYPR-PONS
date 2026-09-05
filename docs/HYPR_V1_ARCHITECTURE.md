# HYPR V1 architecture

## Product loop

`pons TokenLaunched` → normalized token → automatic room → Discover ranking → room activity → follow/share/chat → creator claim.

Every room is useful without a stream. Streaming is an optional future surface attached to a claimed room.

## Runtime boundaries

### Web app

Next.js App Router renders `/` and `/room/[tokenAddress]`. Discover and room UI are client-enhanced but remain usable without a wallet.

### Pons adapter

`src/lib/integrations/pons/constants.ts` contains official network and contract constants. `indexer.ts` owns RPC event reads and normalization. `data.ts` is the data-provider seam: fixture mode is the safe default; RPC mode can be enabled without changing the UI.

### Future persistence

The first database migration should create `tokens`, `token_events`, `rooms`, `room_claims`, `wallets`, `follows`, `chat_messages`, `hype_events`, `hype_snapshots`, and `indexing_state`. Enforce unique `(chain_id, address)` for tokens and `(transaction_hash, log_index)` for events.

## Identity and claiming

The browser detects an EVM provider, requests the account, checks chain ID 4663, and requests a human-readable signature. Production completion requires a server-issued nonce, expiry, domain binding, signature recovery, ownership/deployer or authorized payout-wallet verification, and one-time nonce consumption.

## Ranking

HYPE is social activity only. Market cap and price are displayed as context, not scoring inputs. Rankings are materialized from recent snapshots and can be recalculated when weights change.

## Cost posture

Use local fixtures in development, Supabase free tier for persistence, and bounded public RPC reads while traffic is low. Move to an archive-capable provider only when public RPC rate limits or historical backfills become the constraint.
