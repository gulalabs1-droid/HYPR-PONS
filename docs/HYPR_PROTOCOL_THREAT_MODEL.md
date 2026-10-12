# HYPR protocol threat model

Status: pre-audit design review. No financial contract should be presented as safe or production-ready from this document.

## Assets and trust boundaries

Assets are user quote funds, curve token reserves, graduation liquidity, creator fee ledgers, protocol fee ledgers, launch metadata, and the correctness of progress/price events. The trust boundary is between the browser, untrusted RPC/indexer data, HYPR contracts, the external Uniswap v4 deployment, and any future server database.

The factory and curve should be minimally privileged. A deployer may create a launch, but cannot drain reserves, rewrite parameters, pause trades indefinitely, or change recipients after launch. External integrations are adapters with explicit addresses and interface checks.

## Main threats and controls

| Threat | Control required before testnet demo |
|---|---|
| Reentrancy during buy, sell, claim, or graduation | Checks-effects-interactions, `nonReentrant`, safe token transfer wrappers, and malicious-token tests. |
| Reserve or fee-accounting insolvency | Checked math, invariant tests, reserve floors, separate fee ledgers, and conservation assertions after every trade. |
| Price/amount rounding exploitation | Fixed-point specification, one-sided rounding policy, min-output/deadline parameters, fuzzing around zero and max values. |
| Double graduation or partial migration | Explicit state machine, one-time guard, atomic external call, event assertions, and fork tests against the target v4 manager. |
| Shared-adapter preemption or griefing | Factory-bound curve registration, adapter caller authorization, one-time token binding, and a regression test for unregistered callers. |
| Fake token metadata or creator identity | Treat metadata as untrusted; verify creator from the launch record; server-issued nonces and recovered signatures for web claims. |
| Admin key compromise | No upgradeability in V0, minimal immutable configuration, separate testnet key, never commit private keys, and documented pause policy if one is later added. |
| Sybil launches, chat, or social scoring | Per-wallet/account rate limits, abuse reporting, server-side HYPE aggregation, and no financial meaning assigned to HYPE. |
| RPC/indexer omissions or reorgs | Confirmation depth, idempotent `(txHash, logIndex)` keys, bounded backfill, reorg recovery, and visible stale/partial labels. |
| Uniswap address or ABI mismatch | Verify deployed bytecode and interface on Robinhood Chain before any adapter call; never infer a PositionManager address from a truncated source. |
| Economic manipulation around graduation | Fixed threshold, explicit slippage/deadline, no privileged price override, documented progress decrease on sells, and tests for buy/sell/graduation ordering. |

## Security gates

1. Unit, fuzz, and current invariant harness suites pass; reentrant-recipient, forced-ETH, repeated-claim, launch/graduation/trade/fee event, and external-manager rollback regressions are covered. Arbitrary-token callback cases are defense-in-depth because the supported V0 factory path only creates the fixed HYPRToken.
2. A local fork now reproduces the exact deployed v4 graduation boundary and the full create → buy → sell → threshold → graduate path. The fork uses the documented inventory-price policy; production price mapping still requires independent review.
3. Testnet deployment uses a throwaway key and no user funds.
4. Contract addresses, compiler settings, source verification, and event samples are published.
5. Independent review covers arithmetic, external calls, permissions, and legal/consumer-risk language.

Known residual risks include economic attacks that only appear under real liquidity, external Uniswap integration changes, wallet UX mistakes, and regulatory questions around token issuance and creator revenue. These are not solved by the web UI.
