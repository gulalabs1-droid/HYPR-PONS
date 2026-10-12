# Open House strategy

## Positioning

HYPR is the live launchpad and real-time creator/community layer for Robinhood Chain. HYPR-created tokens move through create, go live, trade, fee accounting, curve progress, and Uniswap v4 graduation. Pons remains the first integration and market reference while HYPR turns launches into persistent rooms where people can discover, follow, chat, share, and identify legitimate creators.

The competition is an acceleration target, not the product definition. Every buildathon feature must remain useful after judging.

## Qualification strategy

The official HackQuest listing currently says a qualifying project must be deployed on an Arbitrum chain, and explicitly includes Robinhood Chain as an example. It also states that at least one of the three Overall prizes and at least one of the three Promising Products prizes are reserved for projects building on Robinhood Chain; prizes remain subject to development-tied milestones. The listing currently shows `70,000 USDC` in Overall prizes, `15,000 USDC` in Promising Products, and up to `30,000 USDC` in milestone grants. Check the live listing again immediately before submission because schedules, terms, and award details can change.

Robinhood Chain is the primary target and should be the visible source of the product's indexed activity. A testnet deployment is the first safe milestone; mainnet deployment requires explicit approval for any real spend.

The qualifying proof should include:

- a live HYPR URL;
- a public Robinhood Chain deployment or verified contract address, if a HYPR contract is used;
- chain ID `4663` for mainnet or the current Robinhood testnet chain ID;
- a reproducible HYPR protocol event path, plus the versioned pons indexing path;
- a room URL resolving from a real token address;
- repository, deployment, and demo documentation.

Source checked 2026-09-06: [official HackQuest Singapore listing](https://www.hackquest.io/hackathons/Arbitrum-Open-House-Singapore-Online-Buildathon). The Arbitrum announcement describes Robinhood Chain testnet assets as simulation-only and links the official faucet and explorer; this supports the testnet-first posture but does not replace the buildathon's deployment and milestone terms.

## Product story

`HYPR create → room goes live → people trade and interact → creator earns → HYPR earns → curve progresses → graduate to Uniswap v4`.

The compatibility story is `pons launch → HYPR indexes it → room exists automatically`; that path validates discovery and community demand but does not substitute for native protocol proof.

Lead with discovery, community infrastructure, and creator identity. Do not lead with speculation, prices, casino mechanics, HYPR Rush, or claims about token quality.

## Milestones

### A — Qualify

- Robinhood Chain integration is versioned and evidence-backed.
- A working deployment is reachable by judges.
- Real indexed data and fixture fallback are clearly labeled.
- Any contract is tested, documented, and deployed only with approval.

### B — Compete

- Discover and room flows work on mobile and desktop.
- Persistent chat, follows, HYPE events, sharing, and server-verified claiming work.
- Indexing is restart-safe, idempotent, and honest about stale or missing data.

### C — Win-ready

- Real communities and users are measured without inflated numbers.
- Demo has zero critical paths that depend on uncontrolled external timing.
- README, judging matrix, pitch, demo, architecture, and deployment proof are complete.

## Current decision

Use `HYPR PONS` as the canonical repository. Keep the older `/Users/ct/Documents/hypr` streaming/Solana project and `/Users/ct/Documents/HYPR Rush` separate.

Do not add a decorative contract merely to satisfy the smart-contract criterion. The qualifying contract path is the smallest real HYPR protocol: fixed-supply token, one curve, fee accounting, and one-time graduation. We reviewed an onchain Room Registry and deliberately do not add it to V0: native HYPR already emits the creator in `LaunchCreated`, while Pons deployer attribution is not strong enough to justify a second onchain authority. The durable claim RPC boundary is sufficient for this MVP and avoids an unnecessary contract, admin surface, and revocation policy before testnet evidence exists.

The current repository now has Foundry, native V0 contracts, local curve/v4-boundary tests, a handler-based invariant harness, reentrancy/forced-ETH regressions, event/state assertions, a Robinhood fork-proven full lifecycle, and a shared native-launch read path. Invariant expansion and a broadcast testnet deployment remain explicit work items, not claims of completion.
