# HYPR protocol architecture

Status: design baseline for a testnet MVP. No HYPR protocol contract is deployed or production-ready.

## North star

HYPR is the live launchpad for Robinhood Chain:

`CREATE → GO LIVE → TRADE → CREATOR EARNS → HYPR EARNS → CURVE PROGRESSES → GRADUATE → UNISWAP V4`

The web app remains the consumer surface. Pons is a useful first integration and market reference; it is not the long-term authority for HYPR-created launches.

## V0 goals

- Create a fixed-supply token and its curve in one explicit transaction path.
- Use one quote asset: ETH at the wallet boundary and native ETH in the currently tested v4 pool path; use WETH only if a verified deployment path requires it.
- Make buy, sell, fee, reserve, progress, and graduation behavior deterministic and observable.
- Keep the contract set small enough to audit and test with Foundry.
- Graduate once, atomically, to the verified Robinhood Chain Uniswap v4 deployment.
- Let the UI show live launch state without inventing volume, users, or price history.

## V0 non-goals

No multiple quote assets, user-defined taxes, buybacks, governance, upgradeability, arbitrary hooks, custom DEX, leverage, custody of unrelated funds, or permissionless changes to curve parameters.

## Contract boundaries

### `HYPRFactory`

The factory creates a `HYPRToken` and `HYPRCurve`, registers the curve with the shared graduation adapter, records immutable launch configuration, and emits a complete `LaunchCreated` event. It validates the fixed ETH boundary, supply, curve parameters, fee configuration, and token metadata. The adapter accepts graduation only from the registered curve whose factory performed the registration, preventing a third party from preempting a token's graduation slot.

### `HYPRToken`

The token has a fixed maximum supply and records the factory that created it. V0 should avoid transfer taxes and rebasing. The current V0 seeds the full supply to the curve: `tradableSupply` is the priced reserve, while `totalSupply - tradableSupply` remains unpriced inventory intended for graduation. There is no creator allocation in this version; that policy must remain explicit before deployment.

### `HYPRCurve`

The curve holds the tradable token reserve and quote reserve, executes exact-input buys and sells, accounts for creator and protocol fees, reports progress from its real quote reserve, and transitions to `Graduated` exactly once. Live progress can decrease after sells; graduation itself is one-way. All arithmetic is integer-only, uses checked math, and applies a documented rounding direction.

### `HYPRGraduationManager`

Use a separate manager or adapter only if the verified Uniswap v4 interfaces require it. The manager receives the curve's reserved assets, initializes the canonical pool, adds liquidity through the official position path, locks or permanently controls the graduation position, and reports the pool identity back to the curve. It must not become a second exchange.

## State machine

`Created → Live → Graduating → Graduated`

`Created` may become `Cancelled` only before trading starts and only if that rule is deliberately included in the final V0 design. Once a buy or sell is possible, there is no admin cancellation path. `Graduating` is a short, guarded state: reentrancy protection, a one-time transition guard, exact asset accounting, and a failure-atomic external call are mandatory.

## Event and indexing contract

The protocol should emit, at minimum:

- `LaunchCreated(token, curve, creator, totalSupply, tradableSupply, virtualQuoteReserve, graduationThreshold, totalFeeBps, creatorFeeBps, protocolFeeBps, name, symbol)`
- `TradeExecuted(trader, isBuy, grossQuoteAmount, tokenAmount, fee, creatorFee, protocolFee, realQuoteReserve, realTokenReserve)`
- `FeesClaimed(recipient, amount, kind)`
- `GraduationStarted(tokenAmount, quoteAmount)`
- `Graduated(poolId, tokenAmount, quoteAmount)`
- `CurveRegistered(token, curve, factory)` from the shared graduation adapter

These are the exact V0 event payloads emitted by the current contracts. A future indexer may derive normalized fields such as `progressBps` or `poolManager`, but those must not be presented as raw event fields unless the ABI is intentionally extended.

The existing Pons adapter stays separate from these HYPR events. The room route uses the token address as its stable identity, and the opt-in one-shot indexer maps confirmed HYPR launch events into the same normalized persistence model without mixing Pons and native protocol state.

The read-only `/protocol` page and `/api/protocol/summary` endpoint aggregate native launch, trade, phase, and fee-ledger state over the same bounded lookback used by the room reader. Aggregates remain unavailable when required reads are incomplete; the page is informational and has no privileged controls.

## Existing work to preserve

- `src/app/` is the current Discover and room surface.
- `src/lib/integrations/pons/` is the versioned external-data seam.
- The source-aware fixture/RPC labeling is required for honest demos.
- Wallet/network detection, room URLs, share flow, HYPE social scoring, and Open House materials remain reusable.

## Deployment posture

Development and local fork testing come first. Robinhood Chain testnet is the first public target. Mainnet deployment, real funds, creator payouts, and any privileged key action require explicit approval and an independent review gate.

References: [Robinhood Chain deployment docs](https://docs.robinhood.com/chain/deploy-smart-contracts/), [Robinhood Chain connection docs](https://docs.robinhood.com/chain/connecting/), and [Uniswap v4 core](https://github.com/Uniswap/v4-core/).
