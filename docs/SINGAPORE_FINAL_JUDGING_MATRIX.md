# Singapore final judging matrix

Audit date: 2026-10-01

This is an evidence audit of the current checkout, not a claim that HYPR is
deployed or production-ready. The current HackQuest listing says a qualifying
project must be deployed on an Arbitrum chain and lists Robinhood Chain as an
eligible example. It evaluates smart-contract quality, product-market fit,
innovation/creativity, and real problem solving, with extra consideration for a
legitimate Paxos USDG integration. See the [current Singapore listing](https://arbitrum-singapore.hackquest.io/).

## Qualification status

**Not qualified yet on the evidence currently available.**

The repository contains a testnet-only deployment script and a read-only fork
proof against Robinhood Chain testnet v4 contracts, but no HYPR adapter/factory
deployment transaction, verified HYPR source page, deployed frontend URL, or
two-browser live demo evidence was found in the current workspace. The Pons
integration and local fork are supporting evidence; they do not substitute for
a deployed HYPR project.

Current network evidence:

- Robinhood Chain testnet RPC responded with chain ID `46630` on 2026-10-01.
- The opt-in fork proof ran against the current testnet bytecode and passed all
  four tests.
- A clean Foundry deployment simulation passed on 2026-10-02 for chain `46630`
  and estimated `0.000134353846717692 ETH`; it did not broadcast and therefore
  produced no public HYPR deployment evidence.
- No `HYPR_FACTORY_ADDRESS`, `HYPR_ADAPTER_ADDRESS`, launch address, or
  deployment transaction is configured in the current environment.
- No HYPR-hosted Site was found; the connected Sites inventory contained only
  an unrelated project. Vercel has no local credentials.

## Smart contract quality

| Field | Evidence |
|---|---|
| Strongest evidence | Fixed-supply `HYPRToken`, factory-created curve, explicit creator/protocol fee ledgers, guarded one-way graduation, reentrancy guard, forced-ETH regression, strict v4 adapter boundary, fuzz tests, and invariant tests. |
| Source paths | `protocol/src/HYPRToken.sol`, `protocol/src/HYPRFactory.sol`, `protocol/src/HYPRCurve.sol`, `protocol/src/HYPRV4GraduationAdapter.sol`, `protocol/test/`. |
| Test evidence | `forge test --match-contract HYPRProtocolTest -vv`: 19 passed; `HYPRV4IntegrationTest`: 6 passed; `HYPRV4BoundaryTest`: 3 passed; `HYPRInvariantTest`: 3 invariants passed across 128,000 calls; fork proof: 4 passed. |
| Demo moment | Create a launch, buy, sell, show creator/HYPR fee ledgers, cross the threshold once, and show the resulting v4 pool/position state. |
| Current weakness | No broadcast HYPR deployment, source verification, real user transaction, or professional security review. Local doubles and a local fork are not the same as a production audit. |
| Final correction needed | Deploy only to Robinhood Chain testnet with approval, verify source, capture independent RPC/explorer evidence, and publish the exact compiler/configuration and transaction hashes. Do not deploy mainnet for the competition demo. |

## Product-market fit

| Field | Evidence |
|---|---|
| Strongest evidence | The product thesis is coherent: every native launch can have a persistent room combining creator live media, trading context, creator identity, and social interaction. |
| Source paths | `src/app/page.tsx`, `src/app/room/[tokenAddress]/page.tsx`, `src/components/discover-client.tsx`, `src/components/room-client.tsx`, `docs/OPEN_HOUSE_SUBMISSION.md`. |
| Test evidence | Production build and credential-free runtime smoke pass; native RPC discovery is implemented but currently unconfigured. |
| Demo moment | A judge opens a real token address, sees the room, connects a wallet, and follows the same launch through live media and onchain activity. |
| Current weakness | No measured users, retention, creator repeats, live minutes, or transaction activity. Chat and follows are browser-local; there is no deployed frontend URL. |
| Final correction needed | Run a small testnet pilot with real creators/viewers, record only measured results, and make the room/demo URL publicly reachable. |

## Innovation and creativity

| Field | Evidence |
|---|---|
| Strongest evidence | HYPR combines a transparent launch curve with an in-room creator/community experience while retaining a clearly labeled Pons discovery path. Native live media is designed to stay inside HYPR instead of sending the creator to an external platform. |
| Source paths | `src/components/native-live-room.tsx`, `src/lib/livekit.ts`, `src/lib/integrations/pons/`, `src/lib/integrations/hypr/`, `src/lib/launch-data.ts`. |
| Test evidence | Wallet-signature and source-label tests pass; LiveKit token/status plumbing is implemented. |
| Demo moment | A creator signs a free wallet authorization, publishes camera/microphone tracks in a HYPR room, and a second browser watches without leaving HYPR. |
| Current weakness | LiveKit credentials are absent, so the actual creator/viewer room has not been runtime verified. No durable chat/follow layer is configured. |
| Final correction needed | Configure a server-only LiveKit project, deploy the app with those secrets, and complete the two-browser test with a real indexed native launch. |

## Real problem solving

| Field | Evidence |
|---|---|
| Strongest evidence | The design addresses a concrete fragmentation problem: launch, trade, creator earnings, live community, identity, and graduation are otherwise split across separate tools. |
| Source paths | `src/components/room-client.tsx`, `src/app/api/room-claims/`, `src/lib/supabase/`, `docs/HYPR_LIVE_LAUNCH_SPEC.md`, `docs/OPEN_HOUSE_DEMO.md`. |
| Test evidence | Claim signing/replay tests, transaction receipt tests, bounded indexer tests, and honest fixture/partial/unconfigured runtime labels pass. |
| Demo moment | Complete `CREATE → LIVE → BUY → SELL → EARN → GRADUATE` using real testnet evidence and show that the room remains the community destination afterward. |
| Current weakness | The current checkout cannot complete that path against a deployed HYPR contract. Durable persistence, production moderation, and creator analytics are not configured. |
| Final correction needed | Prioritize one verifiable end-to-end testnet path over additional features. If deployment is not completed, disclose the fork proof as a prototype boundary and do not call the full path live. |

## USDG decision

Do not add USDG merely to collect judging points. USDG is available on Robinhood
Chain according to Paxos documentation, but a legitimate integration would only
help HYPR if it solves a real product need such as a stable quote/settlement
option or creator payout display. It would add token-address, decimals,
allowance, balance, liquidity, pricing, and compliance surface area.

For this submission, keep ETH as the single testnet quote asset and document
USDG as a post-submission option. A later USDG phase should begin with a
read-only balance/quote display or an explicitly separate market, not a rewrite
of the current curve during the final days. Paxos's current network/address
documentation is the authoritative starting point: [USDG on main networks](https://docs.paxos.com/guides/stablecoin/usdg/mainnet).

## Acceptance decision

The strongest honest submission story is a smaller, reproducible native HYPR
flow with visible limitations. The gating item is deployment and evidence, not
another feature. Until the P0 list is complete, the project should be described
as a testnet-ready prototype with a passing local/fork proof—not as a live
deployed protocol.
