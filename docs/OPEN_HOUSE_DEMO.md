# Open House demo script

## Deterministic path

1. Open HYPR Discover and identify whether the source is native HYPR, Pons, RPC, partial, or fixture.
2. Open the live-launch flow or a prepared testnet launch.
3. Show fixed supply, one quote asset, fee split, curve threshold, and creator recipient before signing.
4. Create the launch, show the transaction, and open its room.
5. Buy and sell on testnet with explicit minimum output/deadline protection.
6. Show creator/protocol fee accounting and curve progress from events/state.
7. Cross the threshold once and show the graduation transaction, pool identity, and liquidity ownership.
8. Use the room for chat, follow, share, and—only for live/partial indexed data—complete the server-verified indexed-creator signature flow; explain HYPE as social activity only.
9. If an approved external creator stream is attached and its upstream data marks it live, show the embedded live surface beside the launch; otherwise show the honest offline state and continue with verified activity.
10. If native testnet proof is not ready, use the existing Pons room path as a clearly labeled discovery fallback and do not simulate contract state.

## Failure-safe behavior

The demo must remain understandable when pons has no fresh launch, RPC is rate-limited, or metadata is missing. In those cases show a visible demo/stale/partial-data label. Never replace unavailable live facts with unlabeled invented counts.

## What not to demonstrate

- No fake users, volume, transactions, or testimonials.
- No claim that HYPE predicts price or safety.
- No private-key or seed-phrase flow.
- No unapproved mainnet contract deployment.
- No invented trades, fees, curve progress, graduation, or pool addresses.
- Unless the reviewed Supabase migration and server credentials are explicitly configured, do not present the process-local claim acknowledgement as durable ownership or a production creator profile. The optional durable path must be demonstrated from its persisted response, not inferred from the UI.
- No HYPR Rush or casino framing in the primary story.
