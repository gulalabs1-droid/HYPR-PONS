# HYPR protocol economics

Status: proposed model for testnet design. These figures are benchmarks and must not become deployment constants without review, tests, and explicit approval.

## Design principles

HYPR earns from protocol activity rather than from selling access, advertising claims, or custody. The fee must be visible before confirmation, charged consistently on buys and sells, bounded by immutable configuration, and split through pull-based accounting. There is no fee-on-transfer token in V0.

The current Pump documentation is a useful benchmark: its bonding-curve trading fee is 1.25%, currently split into 0.300% creator and 0.950% protocol, with no LP share on the curve. After graduation, PumpSwap uses a changing schedule that includes creator, protocol, and LP portions, so a curve benchmark must not be presented as a universal post-graduation rate. HYPR should learn from the clarity of that model without copying its contracts or assuming the same market behavior. See [Pump bonding curves](https://pump.fun/docs/bonding-curve) and [Pump fees](https://pump.fun/docs/fees).

## Current benchmark comparison

Checked 2026-09-06 against the linked protocol documentation. These are comparison inputs, not HYPR commitments:

| System | Launch/trading economics | Implication for HYPR |
|---|---|---|
| Pump bonding curve | 1.25% total curve fee: 0.30% creator, 0.95% protocol, 0% LP. Graduated PumpSwap fees vary by market-cap band and include an LP share. | A simple, visible curve split is easy to explain; post-graduation policy must be specified separately. |
| pons v1/current | 1% locked Uniswap V3 pool fee, 0.0005 ETH launch fee, and a snapshotted 70% creator / 30% protocol share for active-factory launches; legacy launches retain 90% / 10%. | This is a pool-fee and payout model, not a bonding-curve fee model. HYPR should not compare the percentages without naming the venue and fee base. |
| pons v2 | The standard trade fee is split among pons, the creator, and optional buyback activity; an optional capped creator tax is fixed at launch and charged separately. The v2 pool itself is documented as zero-fee because the hook applies the fee. The docs expose per-launch configuration rather than one universal rate. | HYPR should keep V0 economics smaller: no creator-defined tax, no buyback vault, no hook fee conversion, and fixed immutable shares. |
| Robinhood Chain network | ETH is the native gas asset. Network gas is an additional variable transaction cost, separate from HYPR's protocol fee; the official docs describe low transaction costs but do not promise a fixed gas price. Testnet tokens have no monetary value. | Show protocol fees and gas as separate concepts. Never quote a fixed “all-in” cost or use testnet ETH as revenue. |

References: [pons v1 integration docs](https://docs.ponsfamily.com/), [pons v2 docs](https://docs.ponsfamily.com/v2), [Robinhood Chain connection docs](https://docs.robinhood.com/chain/connecting/), and [Robinhood Chain terms](https://docs.robinhood.com/chain/terms-of-service/).

## Candidate fee policies

| Option | Total | Creator | HYPR protocol | Extra LP/ecosystem slice | Assessment |
|---|---:|---:|---:|---:|---|
| A — benchmark | 1.25% | 0.30% | 0.95% | 0% | Simple and legible; strong protocol revenue, but creator incentive is modest. |
| B — lean | 1.00% | 0.25% | 0.75% | 0% | Lower friction; less runway per unit volume. |
| C — shared | 1.25% | 0.30% | 0.85% | 0.10% | Only justified if the extra recipient and use are defined; otherwise it adds attack and governance surface. |

### Provisional V0 recommendation

Start with Option A as a testnet benchmark because it is easy to explain and compare. Treat it as a parameter under review, not a promise. A final choice should consider creator retention, user slippage, testnet behavior, competitor ranges, legal review, and whether the graduated Uniswap v4 pool has a separate fee policy.

## Curve model

V0 should use a virtual-reserve constant-product curve with fixed parameters:

`x · y = k`

where `x` is the quote reserve and `y` is the token reserve. A buy deposits quote, removes tokens, and charges the fee before reserve updates. A sell deposits tokens, removes quote, and charges the fee before reserve updates. The exact formulas, minimum-output checks, rounding direction, and reserve floors belong in the contract specification and Foundry tests.

The graduation threshold must be defined in quote-reserve/progress terms that cannot be misread as market capitalization. The UI should call it “curve progress” and show the underlying onchain quantities.

## Example accounting

At 1,000 ETH of hypothetical testnet trading volume, a 1.25% fee produces 12.5 ETH of gross fees: 3 ETH to the creator ledger and 9.5 ETH to the protocol ledger under Option A. This is an accounting example, not actual HYPR traction or a revenue forecast.

Fees should be accrued per curve and claimable by authorized recipients. Claims must be pull-based, non-reentrant, replay-safe, and unable to reduce the curve's solvency or reserved graduation assets.

## Graduation economics

Graduation must reserve the token and quote amounts needed for the initial Uniswap v4 position before fees are claimable. The migration must not double-charge users, silently change price, or leave a partially migrated pool. V0 should use one fixed pool configuration and a protocol-controlled, non-withdrawable liquidity position unless a better, tested policy is approved.

The post-graduation pool fee is a separate parameter and must be displayed separately. HYPR must not imply that curve fees or Uniswap LP fees are the same thing.

## Guardrails

- No arbitrary creator taxes or hidden fee multipliers.
- No fee changes after launch in V0.
- No protocol fee recipient change without a timelocked, reviewed mechanism; an immutable recipient is safer for the first testnet.
- No revenue or traction claims from fixtures, simulated volume, or a single demo wallet.
- Testnet ETH has no economic value and must be labeled that way.
