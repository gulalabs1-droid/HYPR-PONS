# Pons versus the HYPR protocol

Pons is HYPR's first ecosystem integration and an important reference implementation. It should remain a source of market and UX learning while HYPR gradually owns the launch-to-graduation path.

The current pons documentation describes two different integration surfaces. The original/current factory launches fixed-supply tokens directly into locked Uniswap V3 WETH pools and has no later migration; pons v2 uses per-launch bonding curves and a separate Uniswap v4 graduation stack. Their factories, events, fee plumbing, and state readers are not interchangeable. HYPR therefore keeps the existing v1 adapter bounded and versioned, while treating v2 as research/reference work until a deliberate adapter is scoped. This avoids making HYPR's own protocol economics, room identity, or graduation proof depend on whichever pons deployment happens to be current.

| Capability | Pons lesson | HYPR V0 decision |
|---|---|---|
| Launch creation | A launch needs a single discoverable source of truth. | `HYPRFactory` emits a complete immutable launch record. |
| Curve | Pons V2 documents a curve-to-Uniswap-v4 flow. | Use one simple fixed virtual-reserve curve; no configurable curve families. |
| Fees | Fee and creator-recipient policy must be visible and queryable. | Fixed fee policy, separate creator/protocol ledgers, pull claims. |
| Graduation | Phase/events matter more than UI inference. | Explicit `Graduating`/`Graduated` state and canonical pool identity. |
| Metadata | Token metadata is useful but untrusted. | Store bounded metadata and label user-provided content. |
| Protection | Complex launch protections add surface area. | No arbitrary taxes, buybacks, or bespoke anti-bot rules in V0. |
| Indexing | Factory versions and start blocks change. | Versioned adapters and event cursors; never silently copy fixture metrics. |

## Why HYPR does not add a pons room registry yet

The pons docs expose a deployer on launch records and describe administrative community takeovers, but they do not provide a simple, permissionless onchain creator-ownership primitive that HYPR can safely treat as authoritative. A HYPR room registry added only to satisfy a chain criterion would create a second identity source and could misrepresent a pons creator or takeover. For V0, the token address remains the stable room key and creator verification stays an explicit future work item. If a registry is later justified, it should be designed against the exact pons version and an independently reviewed authorization model.

## What HYPR should not copy

Do not copy Pons contracts, bytecode, hooks, addresses, fee policy, or undocumented assumptions. Public docs and observable onchain behavior are research inputs; source-code reuse requires a clear license and review. HYPR's differentiation is a live creator/community surface on Robinhood Chain with a smaller, transparent protocol core.

## Versioning rule

The existing adapter currently covers the original Pons factory path. Pons V2 documents a different factory, curve, hook, escrow, vault, locker, and graduation flow. These must be represented as separate integration versions. A Pons V2 event must never be decoded using the V1 ABI merely because both are on Robinhood Chain.

References: [Pons documentation](https://docs.ponsfamily.com/), [Pons V2 documentation](https://docs.ponsfamily.com/v2), and [HYPR Pons integration notes](./PONS_INTEGRATION.md).
