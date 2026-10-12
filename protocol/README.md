# HYPR protocol package

This package is the deliberately small Solidity/Foundry V0 core: fixed-supply token creation, one ETH virtual-reserve curve, explicit creator/protocol fee ledgers, and a guarded external graduation adapter.

`HYPRV4GraduationAdapter.sol` now exercises the official v4 PositionManager/Permit2 path, but only for a fully pinned configuration, a factory-registered curve, and no ETH or token dust. It derives an inventory-based launch price and validates the exact v4-rounded settlement before minting. It has no owner or sweep function. An opt-in fork proof covers the deployed Robinhood testnet boundary for 2:1, 1:2, and skewed 3:2 inventory ratios; independent review and a real testnet transaction remain required before use. `HYPRV4Boundary.sol` remains the pure calldata seam. See `../docs/HYPR_UNISWAP_GRADUATION.md`.

Run from this directory:

```bash
forge fmt --check
forge test -vv
```

`script/DeployHYPR.s.sol` is a testnet-only, reproducible deployment plan. It
requires `HYPR_PROTOCOL_RECIPIENT` and a configured Foundry signer, and it
rejects every chain except Robinhood Chain testnet (`46630`). Running it without
`--broadcast` is a simulation; do not broadcast until the deployment checklist,
independent review, and explicit spending approval are complete.

`script/CheckHYPRDeployment.s.sol` and `script/CheckHYPRLaunch.s.sol` are
read-only verifiers for the deployment and a specific factory-created launch.
They never broadcast and must be run against the intended testnet RPC.

This package is not audited and is not approved for mainnet or real funds.
