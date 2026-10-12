# HYPR Robinhood Chain testnet deployment runbook

Status: deployment-ready artifact only. No HYPR contract has been broadcast from this repository, and this runbook does not authorize spending, signing, or mainnet deployment.

## Preconditions

Before any broadcast, complete the independent contract review, confirm the current Robinhood Chain testnet v4 deployment addresses, choose a throwaway testnet deployer, and confirm that the protocol recipient is the intended wallet. The deployment script has a chain guard for `46630`; it must never be reused for mainnet.

The testnet uses ETH for gas. Testnet assets have no monetary value. Do not place a private key in the repository or in any `NEXT_PUBLIC_*` variable.

## Priority order for the next milestone

Do not spend the next cycle on more social features. The buildathon qualification gate is an application deployed on an Arbitrum chain, and the strongest HYPR proof is one independently verifiable native create → trade → fee → graduate flow. Close these gates in order:

1. Register/confirm the Open House submission window and keep `HYPR PONS` as the canonical Robinhood/Pons checkout. `/Users/ct/Documents/hypr` is a separate legacy Solana demo and is not the deployment target for this protocol.
2. Obtain a rate-limit-capable Robinhood testnet RPC provider endpoint and an archive-capable endpoint for the fork/backfill. The public endpoint is suitable for smoke checks but not dependable for the worker.
3. Use a throwaway deployer and obtain testnet ETH from the official Robinhood faucet. Record the deployer and protocol-recipient addresses separately before signing anything.
4. Run the fork proof against the current provider, complete the independent contract review, then broadcast only the testnet deployment after explicit approval.
5. Capture the deployment, create, buy, sell, fee-claim, and graduation evidence before wiring the frontend to the addresses.

Robinhood documents chain IDs `4663`/`46630`, ETH gas, the public RPC rate limit, the recommended provider path, and the official testnet faucet at [Connecting to Robinhood Chain](https://docs.robinhood.com/chain/connecting/). Its finality guidance says soft confirmation is appropriate for ordinary UX, while high-value or irreversible actions should wait until the transaction is posted to Ethereum or reaches Ethereum finality; use that stricter standard for graduation evidence.

## Dry run

From `protocol/`, set only a non-sensitive protocol recipient and simulate:

```bash
export RH_RPC_URL=https://rpc.testnet.chain.robinhood.com
export HYPR_PROTOCOL_RECIPIENT=0x000000000000000000000000000000000000dEaD
forge script script/DeployHYPR.s.sol:DeployHYPR --rpc-url "$RH_RPC_URL"
```

The output addresses are simulation-only. A dry run is not deployment proof and must not be entered into the frontend environment.

If Foundry reports artifacts built from source files that no longer exist, clean
the generated output and rerun the same command before diagnosing the protocol:

```bash
forge clean
forge script script/DeployHYPR.s.sol:DeployHYPR --rpc-url "$RH_RPC_URL"
```

On 2026-10-02 this clean dry run completed on chain `46630`, estimated
`0.000134353846717692 ETH` for the two-contract deployment, and printed
`SIMULATION COMPLETE` without broadcasting. The estimate is not a quote and the
simulated addresses are not deployment evidence.

## Approved broadcast and immediate checks

Only after the preconditions are complete and explicit spending approval exists, run the same script with the approved Foundry signer and `--broadcast`. Capture the deploy transaction hashes and the emitted adapter/factory addresses. Never paste a private key into a shell history or documentation.

Then run the read-only verifier against the same RPC:

```bash
export HYPR_FACTORY_ADDRESS=0x<deployed-factory>
export HYPR_ADAPTER_ADDRESS=0x<deployed-adapter>
forge script script/CheckHYPRDeployment.s.sol:CheckHYPRDeployment --rpc-url "$RH_RPC_URL"
```

The checker proves that the deployed bytecode exists, the factory points to the adapter, the adapter is pinned to the expected PositionManager/Permit2/ticks, the PositionManager is wired to a nonzero PoolManager, and the immutable V0 economics match the deployment plan. It is read-only and does not create a launch.

After creating a launch and waiting for the same confirmation buffer used by the indexer, run the per-launch verifier:

```bash
export HYPR_TOKEN_ADDRESS=0x<launch-token>
export HYPR_CURVE_ADDRESS=0x<launch-curve>
forge script script/CheckHYPRLaunch.s.sol:CheckHYPRLaunch --rpc-url "$RH_RPC_URL"
```

This second read-only check proves the token and curve are coupled to the factory, the fixed supply and fee split match the factory, reserve liabilities are covered, the token balance matches the curve reserve, and the lifecycle phase/pool identity are coherent. It does not replace independent event and transaction-hash verification.

## Frontend configuration

After the addresses are independently checked, configure server reads with `HYPR_NETWORK=testnet`, `HYPR_RPC_URL`, and `HYPR_FACTORY_ADDRESS`. Configure the browser launch/trade surface with `NEXT_PUBLIC_HYPR_NETWORK=testnet` and `NEXT_PUBLIC_HYPR_FACTORY_ADDRESS`. Rebuild and rerun the route smoke tests; an address alone is not evidence that the factory is genuine.

## Evidence bundle for judges

Record each item from an independent RPC or the official explorer:

1. Chain ID `46630`, deployer address, deployment transaction hashes, and verified source links.
2. Adapter and factory addresses, plus the successful read-only checker output.
3. One create-launch transaction and decoded `LaunchCreated` event.
4. Buy and sell transaction hashes with `TradeExecuted` values, minimum-output/deadline settings, and the resulting curve reserves.
5. Creator and HYPR fee-ledger reads plus any approved claim transactions.
6. The graduation transaction, `GraduationStarted`/`Graduated` events, pool ID, position ID, and zero residual curve/adapter balances.
7. Independent pool state: initialized price, liquidity, position owner/locker, and no creator withdrawal path.

The fork suite is supporting evidence for deployed v4 compatibility, not a substitute for this bundle. Do not call a launch “live,” a fee “earned,” or a room “indexed” until the corresponding transaction, state read, and confirmation-buffered indexer result exist.

## Rollback and disclosure

If any deployment check, event decode, balance check, or independent read disagrees, stop the demo and leave the frontend factory unset. Do not “fix” a mismatch by editing displayed values. Testnet deployments are disposable; mainnet requires a separate reviewed deployment plan, legal review, and explicit approval.
