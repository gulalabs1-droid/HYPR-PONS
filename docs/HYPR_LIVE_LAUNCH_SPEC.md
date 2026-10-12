# HYPR live launch specification

Status: native room plumbing implemented; the testnet MVP still requires a configured LiveKit project, verified native factory deployment, durable persistence, and production rollout proof.

## Product promise

HYPR turns a token launch into a live destination. The creator can prepare a launch, go live, trade transparently, earn the configured creator share, and take the community through curve progress and graduation.

## V0 user flow

1. Creator connects a wallet on Robinhood Chain and enters bounded launch metadata. The current bootstrap form accepts name and symbol; logo, description, and social metadata require the persisted launch-metadata path.
2. HYPR reads and previews the configured factory's immutable supply, quote asset, fee policy, curve threshold, and protocol recipient before enabling the create transaction. Scheduling/start time is not part of the current V0 contract.
3. Creator signs the create transaction. No private key or seed phrase ever enters HYPR.
4. The launch page shows `Scheduled`, `Live`, `Graduating`, or `Graduated` from contract state/events, not a client timer alone.
5. During `Live`, users can connect, buy, sell, set minimum output/deadline, view reserves/progress, chat, follow, and share.
6. Fee cards show creator and HYPR protocol accrual separately; testnet status is visible.
7. After graduation, the room remains the social home while the pool identity and verifiable transaction become the settlement proof.

## Live media boundary

Native HYPR rooms use LiveKit as the media transport while the creator and viewer stay inside HYPR. `src/components/native-live-room.tsx` requests browser camera/microphone permission only after the creator clicks the live control. The server signs a two-hour room token; viewer tokens are subscribe-only, while host tokens are issued only after a short-lived wallet signature is recovered and matched to the indexed native launch creator. The server never receives a private key or seed phrase. The room status endpoint reads provider presence and marks a room live only while the signed host participant is present. Supabase persistence and moderation history remain separate rollout work. Validated YouTube/Twitch embeds remain an optional compatibility fallback only when an explicit external stream URL exists.

## Existing UI reuse

The current Discover page, room route, wallet/network detection, shareable token URL, activity-first HYPE language, and source-aware data notices are the first shell. The native launch form reads the factory's immutable configuration and stays disabled unless it matches the reviewed V0 supply, curve, fee split, and recipient invariants. Pons rooms remain discoverable while native HYPR launches are added as a distinct indexed source.

## Required states

The UI must handle wallet disconnected, wrong network, transaction pending, reverted, stale indexer, missing metadata, insufficient balance, slippage failure, curve complete, graduation pending, and graduated. Never show “live” solely because a page loaded.

## Trust language

HYPE is social activity, not a token-quality, price, or investment score. Testnet ETH is valueless test currency. HYPR must not imply Robinhood endorsement or partnership and must use “Robinhood Chain” in external materials.
