# HYPR graduation to Uniswap v4

Status: local adapter, strict mock integration, and an opt-in fork proof against Robinhood Chain testnet are implemented; a real testnet transaction and final economics/security review remain required before deployment.

## Verified deployment context

Robinhood Chain is EVM-compatible. Official Robinhood docs list Uniswap as a public DEX, identify chain ID `4663` for mainnet and `46630` for testnet, and use ETH for gas. The official UniswapX Robinhood deployment playbook records a Robinhood Chain v4 `PoolManager` at `0x8366a39cc670b4001a1121b8f6a443a643e40951`.

That PoolManager address is a deployment fact to re-check at implementation time, not permission to assume every v4 peripheral exists at a guessed address. The exact PositionManager, permit, quoter, router, pool key, and hook configuration must be verified from deployed bytecode, official ABI/source, and a fork test. HYPR must not use a truncated address from a search preview.

The current official Uniswap chain-4663 deployment record also lists the mainnet v4 PositionManager as `0x58daec3116aae6d93017bAAea7749052E8a04fA7`, the v4 Quoter as `0x8dc178efb8111bb0973dd9d722ebeff267c98f94`, the v3 factory as `0x1f7d7550B1b028f7571E69A784071F0205FD2EfA`, and SwapRouter02 as `0xcaf681a66D020601342297493863E78C959E5cb2`. These are mainnet (`4663`) references only; they must not be copied into a `46630` testnet deployment without checking testnet code and official deployment metadata.

## Read-only testnet verification

On September 5, 2026, the public Robinhood testnet RPC returned chain ID `0xB626` (`46630`). At the current testnet head, `eth_getCode` returned non-empty bytecode for the reference PoolManager (`0x8366a39cc670b4001a1121b8f6a443a643e40951`) and PositionManager (`0x58daec3116aae6D93017bAAea7749052E8a04fA7`) addresses. Read-only calls to the testnet PositionManager also returned the expected PoolManager address and canonical Permit2 address (`0x000000000022D473030F116dDEE9F6B43aC78BA3`). This is deployment evidence; the fork proof below covers pool initialization, Permit2 approvals, liquidity math, exact asset consumption, position creation, and pool state for the tested path.

The opt-in fork test now runs successfully against that public testnet RPC. It deploys fresh HYPR-owned contracts only inside the local fork, initializes fresh no-hook v4 pools, exercises the deployed PositionManager/Permit2 path across multiple inventory ratios, and runs a full Factory → Curve → buy → sell → threshold → graduate lifecycle. It verifies nonzero positions, initialized pool state, exact settlement, and zero adapter residual assets. Run it with `HYPR_TESTNET_RPC_URL=https://rpc.testnet.chain.robinhood.com forge test --match-contract HYPRV4ForkTest`. This is fork evidence, not a broadcast testnet transaction or an audit.

References: [Robinhood Chain deploy docs](https://docs.robinhood.com/chain/deploy-smart-contracts/), [Robinhood Chain overview](https://docs.robinhood.com/chain/?lang=en), [Uniswap's chain-4663 deployment record](https://github.com/Uniswap/contracts/blob/main/deployments/4663.md), and [Uniswap's Robinhood deployment playbook](https://github.com/Uniswap/UniswapX/blob/main/playbook/chains/robinhood.md).

## V0 migration sequence

1. Before launch, reserve the graduation token allocation and define the quote asset path (`ETH` at the user boundary, `WETH` where required).
2. During trading, prevent the reserved amount from being sold and track progress against the immutable threshold.
3. When the threshold is met, enter `Graduating` and reject further curve trades.
4. Build one fixed pool key using the verified quote asset, fee tier, tick spacing, and no custom hook unless a hook is specifically required and audited.
5. Initialize the pool and add the reserved assets through the verified official position path.
6. Lock or permanently protocol-control the resulting liquidity position; no creator withdrawal in V0.
7. Emit `Graduated` with the pool identity and amounts, then make the state irreversible.

Every step must be failure-atomic. If the external call fails, the curve must remain in a recoverable pre-graduation state or revert the complete transaction; there must be no “half graduated” UI state.

## Price continuity and user protection

The V0 policy is explicit: the initial v4 spot price is derived from the exact token/ETH inventory being migrated, not claimed to equal the curve's final marginal price. The adapter then searches a bounded neighborhood using v4's own rounded amount-delta formulas, selecting a price/liquidity pair whose calculated asset requirements do not exceed the supplied caps. The actual deployed PositionManager call is authoritative, and the adapter requires both balances to be zero afterward; any residual asset reverts the whole migration. The final product must disclose this inventory-price policy and independently review whether a marginal-price mapping is preferred for production. Buyers and sellers need minimum-output and deadline protection. The UI should show “curve progress” and “graduated pool” as separate phases.

## Implementation gate

The repository now includes a pure `HYPRV4Boundary` helper and `HYPRV4GraduationAdapter`. The adapter pins PositionManager, Permit2, fee, tick range, and no-hook pool shape; verifies the PositionManager dependency wiring; binds each token to its factory-created curve; derives the launch price from migrated inventory and validates exact settlement with the deployed v4 rounding rules; uses the official Permit2 approval flow; rejects a mismatched pre-existing pool; records the minted position; and has no owner or sweep function. It reverts if either ETH or token dust remains. Foundry tests cover this behavior against strict local PositionManager/Permit2 doubles, while the pure suite pins the native-ETH `PoolKey` ordering and official `MINT_POSITION` followed by `SETTLE_PAIR` payload shape.

The strict local doubles are not evidence that the deployed Robinhood contracts will accept the call; the fork proof closes that specific bytecode-compatibility gap for the tested path. Do not make a custom AMM or substitute a guessed router. A contest-ready deployment still requires an independent testnet transaction confirming the transaction, emitted events, pool state, exact asset consumption, and permanently controlled liquidity ownership.
