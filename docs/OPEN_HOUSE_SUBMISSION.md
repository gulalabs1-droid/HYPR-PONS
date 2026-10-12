# Open House submission draft

## Project name

HYPR

## One-line description

HYPR is the live launchpad for Robinhood Chain: create, go live, trade, earn, and graduate with a persistent community room.

## Short description

HYPR combines a small, transparent launch protocol with a consumer live-room surface. A creator launches a fixed-supply token through HYPR, trades on one bonding curve with visible fee accounting, and graduates to Uniswap v4. Pons remains a versioned integration so existing Robinhood Chain activity can also become a discoverable room.

## Problem

Onchain communities are fragmented across launchpads, explorers, charts, X, Telegram, Discord, and occasional streams. A token can exist onchain without a durable social destination where a new visitor understands what is happening, meets the community, or finds the legitimate creator.

## Solution

HYPR creates the protocol state and turns each launch into a consumer-oriented live room. Discover surfaces Trending, Rising, New, and Most HYPR. Rooms combine launch/trade context with chat, follows, shares, activity, and a social-only HYPE score. Pons launches are indexed through a clearly labeled compatibility path.

## Robinhood Chain usage

HYPR targets Robinhood Chain mainnet chain ID `4663` and testnet `46630`. The native protocol will emit launch, trade, fee, and graduation events; the Pons integration remains modular so factory versions, event ABIs, bounded backfills, and provider changes do not leak into the UI.

## Technical stack

- Next.js App Router
- TypeScript and React
- viem for EVM reads and wallet interoperability
- Solidity/Foundry for the native protocol, with local V0 unit/fuzz tests and a v4 calldata-boundary suite
- Robinhood Chain RPC for development and bounded indexing
- Supabase planned for persistence, authentication, realtime chat, RLS, and analytics

## Status and traction

The current repository is an early V1 bootstrap. Demo fixtures are clearly separated from RPC reads. No user, volume, transaction, or community numbers should be submitted as traction until measured from real systems.

## Security

HYPR does not custody funds, request private keys, or claim to assess token quality. The credential-free testnet/demo path issues a five-minute, one-time process-local challenge; an optional configured path persists pending claims and atomically finalizes room ownership through Supabase RPCs. Durable claims still require an applied migration, restart/replay verification, RLS, rate limits, and independent review before handling valuable actions.

## Roadmap

1. Foundry protocol implementation and local-fork tests.
2. Robinhood Chain testnet create → trade → fee → graduate proof.
3. Persistent native/Pons indexing and normalized rooms.
4. Server-verified wallet identity, realtime chat, follows, analytics, and HYPE snapshots.
5. Optional external creator streams after the community loop proves demand.
