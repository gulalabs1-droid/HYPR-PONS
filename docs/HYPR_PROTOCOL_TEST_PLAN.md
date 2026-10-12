# HYPR protocol test plan

Status: required gate; the local V0 unit/fuzz suites, invariant harness, v4 calldata-boundary suite, strict adapter/Permit2 integration suite, adversarial reentrancy/forced-ETH regressions, event/state assertions, opt-in Robinhood testnet fork proof, web normalization tests, stream URL allowlist tests, process-local and durable-claim helper tests, confirmed transaction identity plumbing, and production runtime smoke checks are present. Durable indexing, migration application, and live testnet proof remain open.

## Solidity/Foundry suites

### Current local coverage

- Factory rejects invalid supply, addresses, curve values, and fee splits; token supply/allocation and the live state are checked.
- Buy/sell fee accounting, claims, slippage/deadline rejection, and quote/token solvency are covered.
- Buy and buy/sell fuzz cases run with 256 cases each under the current Foundry profile.
- Graduation success, one-way completion, exact quote/token migration, and a non-migrating adapter failure are covered.
- The v4 boundary suite checks native-ETH currency ordering, disabled hooks, and the official `MINT_POSITION` then `SETTLE_PAIR` payload shape.
- The adapter integration suite checks factory-bound curve registration, rejection of unregistered callers, PositionManager dependency wiring, Permit2 approval, exact token/ETH consumption against strict doubles, position recording, single-use protection, and rollback when the external manager reverts or reports an unexpected position count.
- The opt-in fork suite runs against the deployed Robinhood testnet PositionManager, Permit2, and PoolManager when `HYPR_TESTNET_RPC_URL` is supplied; it proves fresh-pool initialization, the real modify-liquidity call, position creation, pool state, exact settlement for 2:1, 1:2, and skewed 3:2 token/ETH inventory ratios, and zero adapter residuals. It is skipped by default.

### Remaining local unit coverage

- The graduation threshold boundary and one-unit integer-rounding cases are explicitly tested. Launch, graduation, trade, and fee-claim event payloads are decoded and checked.
- Expand invariant-handler coverage for repeated claims and event/state coupling; the current harness covers fixed supply, reserve/liability solvency, bounded phase, and graduated-state zero reserves. Forced-ETH accounting and repeated-claim behavior have separate regression tests, and progress semantics explicitly allow decreases on sells.

### Fuzz tests

Fuzz trade sizes, reserve sizes, fees, thresholds, slippage limits, repeated claims, and buy/sell ordering. Include zero, one-unit, near-max, and values around the graduation threshold. Assert no underflow, overflow, negative output, or reserve violation.

### Invariant tests

- `x*y` behavior obeys the documented fee/rounding model.
- Contract balances cover recorded reserves plus fee liabilities.
- Total token supply is constant.
- Progress is derived from the documented real quote reserve and may decrease on sells while the curve is `Live`; once the threshold triggers graduation, the phase is one-way and no further trades are accepted.
- Graduation is one-way and happens at most once.
- No user can withdraw another user's quote or creator fees.

### Adversarial tests

Reentrant-recipient, forced-ETH, and external-manager rollback regressions are present. V0's factory only creates the fixed HYPRToken, so fee-on-transfer and arbitrary-token callback paths are outside the supported factory path; they remain adapter-boundary defense cases before production. Stale permits and duplicate event delivery also remain open.

## Fork and testnet tests

On a Robinhood Chain fork, the current proof covers the exact deployed v4 PositionManager/Permit2/PoolManager boundary, inventory-derived price selection, non-1:1 settlement, and a real HYPRFactory → HYPRCurve create → buy → sell → threshold → graduate lifecycle. On testnet, repeat with a throwaway wallet, publish transaction hashes, confirm events from an independent RPC/explorer, and record the pool state.

## Web/indexer tests

Keep the existing typecheck, lint, build, and source-label checks. Native/Pons event normalization, stable event identity, confirmation-buffer range, RPC failure/unsupported-version labeling, stream URL safety, durable claim hashing/signer recovery, process-local claim authorization/replay tests, transaction-state tests, and production runtime smoke checks are now present. Reorg persistence, wrong-network wallet tests, and a room test that distinguishes fixture, partial, stale, and verified onchain data remain open.

No contract is “implemented” for the contest until the adversarial Foundry suites, fork path, and testnet proof pass.
