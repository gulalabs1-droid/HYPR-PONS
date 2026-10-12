# HYPR V1 architecture

## Product direction

The V1 web bootstrap is becoming the consumer shell for the HYPR protocol: the live launchpad for Robinhood Chain. The protocol owns HYPR-created launch economics; Pons remains a versioned external integration and market reference.

## Product loop

`HYPRFactory LaunchCreated` → launch room → GO LIVE → trade → creator/protocol fee accounting → curve progress → Uniswap v4 graduation.

The compatibility loop remains `pons TokenLaunched` → normalized token → automatic room → Discover ranking → room activity → follow/share/chat. Both paths use the token address as the stable room identity, but the UI must label the source and must not pretend Pons data is HYPR protocol state.

Every room is useful without a stream. Native HYPR rooms use LiveKit as the media transport while creators and viewers remain on HYPR; the room is live only while the signed host participant is present. A validated YouTube or Twitch embed remains an explicitly optional compatibility fallback, not the core user experience.

## Runtime boundaries

### Web app

Next.js App Router renders `/` and `/room/[tokenAddress]`. Discover and room UI are client-enhanced but remain usable without a wallet.

### Pons adapter

`src/lib/integrations/pons/constants.ts` contains official network and contract constants. `indexer.ts` owns RPC event reads and normalization. `data.ts` is the data-provider seam: fixture mode is the safe default; RPC mode can be enabled without changing the UI.

### Native protocol

The `protocol/` package contains the Solidity/Foundry V0 implementation of `HYPRFactory`, `HYPRToken`, and `HYPRCurve`, a fixed-configuration `HYPRV4GraduationAdapter`, and strict local adapter/v4-boundary tests. The opt-in Robinhood testnet fork now covers both the deployed v4 boundary and a full factory → curve → buy → sell → graduate lifecycle, but a real testnet transaction and independent review remain gates. The web-side `src/lib/integrations/hypr/` seam and read-only `/api/protocol/launches` endpoint read native `LaunchCreated` events only when an explicitly configured factory address exists; both native and Pons readers use bounded recent lookbacks, 500-block RPC chunks, stable log identities, and a 12-block confirmation buffer before exposing events. The shared Discover/room path now includes those native launches with partial-data labels. The event includes launch name and symbol so a native room can render its onchain identity without trusting fixture metadata. The contract specification is in `docs/HYPR_PROTOCOL_ARCHITECTURE.md`; no contract is considered testnet-ready until the full test plan passes.

### Persistence boundary

The migration in `supabase/migrations/0001_hypr_v1.sql` creates `tokens`, `token_events`, `rooms`, `room_claims`, `wallets`, `follows`, `chat_messages`, `hype_events`, `hype_snapshots`, and `indexing_state`. Enforce unique `(chain_id, address)` for tokens and `(transaction_hash, log_index)` for events. Claim creation/finalization RPCs use short-lived challenges, signer recovery, expiry/hash checks, wallet serialization, and atomic room assignment; they are defined but require a configured Supabase project before durable behavior can be exercised.

## Identity and claiming

The browser detects an EVM provider, requests the account, accepts Robinhood Chain mainnet `4663` or testnet `46630`, and requests a human-readable signature. Production completion requires a server-issued challenge, expiry, domain binding, signature recovery, ownership/deployer or authorized payout-wallet verification, and one-time durable challenge consumption. The current process-local path is safe for demo use; the Supabase path is fail-closed when configuration is incomplete.

## Ranking

HYPE is social activity only. Market cap and price are displayed as context, not scoring inputs. Rankings are materialized from recent snapshots and can be recalculated when weights change.

## Cost posture

Use local fixtures in development, Supabase free tier for persistence, and bounded public RPC reads while traffic is low. Use Robinhood Chain testnet for the first protocol proof. Move to an archive-capable provider only when public RPC rate limits or historical backfills become the constraint. Mainnet deployment and real funds are outside V1 without explicit approval.
