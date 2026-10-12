# HYPR public testnet evidence

Verified 2026-10-12. Test assets only; no mainnet deployment or professional audit.

## Signer and funding

- Chain: Robinhood Chain testnet, `46630`.
- RPC: `https://rpc.testnet.chain.robinhood.com`.
- Deployer and explicitly approved testnet protocol recipient:
  `0xE698beD535d853f002b1f448549D38ba8343Afa0`.
- Official faucet sent 0.01 test ETH:
  [funding transaction](https://explorer.testnet.chain.robinhood.com/tx/0xc80b07910130401bead41c0381c4851a7b14dbd3a0aeeb7a66859079a5cf58bf).
- Encrypted signer is outside the repository in the user's macOS Application
  Support/HYPR/testnet directory. Its strong random password is recoverable from
  macOS Keychain, service `HYPR Robinhood Testnet`, account `hypr-testnet-deployer`.
  No seed phrase, private key, or plaintext password was written to this repo,
  the hosted app, Vercel, or a command-line argument.
- `node scripts/prepare-testnet-wallet.mjs` is idempotent and verifies the local
  signer with an off-chain challenge. It never broadcasts or exports the key.

## Public-chain deployments

| Contract | Address | Transaction | Block |
| --- | --- | --- | --- |
| Graduation adapter | [0x77bc7Ed4B59F9D8B68104F7F4dB673D2777B19eE](https://explorer.testnet.chain.robinhood.com/address/0x77bc7Ed4B59F9D8B68104F7F4dB673D2777B19eE?tab=contract) | [0xc8509218…7b378c6](https://explorer.testnet.chain.robinhood.com/tx/0xc8509218c75d3c82331977a96183693036a8b9e37ab84428be63873ca7b378c6) | 133747107 |
| HYPR Factory | [0x6461786C6a62e2b7E40917312Cc35bb3Df127d14](https://explorer.testnet.chain.robinhood.com/address/0x6461786C6a62e2b7E40917312Cc35bb3Df127d14?tab=contract) | [0x58de7a53…4747efa](https://explorer.testnet.chain.robinhood.com/tx/0x58de7a5347ea0926683a050d5340dca056768f4b16042846da99c3b3a4747efa) | 133747144 |

Both receipts succeeded and were checked after two confirmations. Actual gas
used: adapter 1,976,639; factory 2,660,626; effective gas price 10,000,000 wei.
Combined receipt execution cost: 0.00004637265 test ETH. The explicit approval
cap was 0.001 test ETH. No ETH was transferred as contract constructor value.

The source of both contracts returned `Pass - Verified`. Initial Foundry
submissions matched executable code but the explorer labeled them partial
matches: the verifier had normalized the deployment's remapping metadata.
`scripts/verify-exact-testnet.mjs` checks every source hash and submits the exact
artifact compiler settings. The explorer subsequently reported both
`is_fully_verified: true`, `is_partially_verified: false`. Compiler: Solidity
0.8.24, optimizer 200 runs, via IR. Source verification is not a security audit.

## Independent deployment checks

`CheckHYPRDeployment.s.sol` ran against the public testnet RPC and passed:

- Both contracts have bytecode and the factory points to the deployed adapter.
- Protocol recipient, fixed supply, tradable supply, virtual reserve,
  graduation threshold and 125/30/95 bps fee split match the reviewed plan.
- PositionManager `0x58daec3116aae6D93017bAAea7749052E8a04fA7` and Permit2
  `0x000000000022D473030F116dDEE9F6B43aC78BA3` have deployed code.
- PoolManager: `0x8366a39CC670B4001A1121B8F6A443A643e40951`.

The guarded deployment helper defaults to check-only. Its approved broadcast
mode compares every transaction's bytecode/constructor data against fresh
Foundry artifacts, verifies chain/sender/nonces/zero value, fixes gas and fee
caps, saves public receipts before continuing, and stops after any mismatch.
It intentionally rejects a nonzero sender nonce to prevent blind redeployment.

## Tests and honest remaining gates

- `HYPR_TESTNET_RPC_URL=https://rpc.testnet.chain.robinhood.com forge test -vv`:
  33 passed, zero failed, zero skipped. Includes four current-chain fork tests,
  two 256-run fuzz tests, and 256 invariant runs / 128,000 handler calls.
- Web tests: 47 passed, including keystore and durable-native-record checks.
- Typecheck, lint, production build, and client-bundle security scan passed.
- GitHub Web and Foundry checks passed at `c0883658f1f99aac3e5a466f99b15ad638a644da`.
- Vercel production deployment `hypr-pons-d3z13aojp-gulas-projects-212c0e1d.vercel.app`
  is Ready. Hosted runtime smoke passed with source `native-rpc`, chain 46630,
  factory `0x6461786C6a62e2b7E40917312Cc35bb3Df127d14`, and zero launches.
- Public browser read and displayed the correct immutable supply, reserve,
  threshold, 125/30/95 bps split and recipient, then enabled the create form.
- Historical room discovery uses persisted factory/event provenance, then
  re-reads the canonical factory creation event and current curve state. It
  does not turn database metadata into trusted creator authority.
- No create/buy/sell/claim transaction or real camera broadcast is claimed by
  this deployment evidence alone. Those require their own runtime evidence.
- The official faucet supplies 0.01 test ETH per 24 hours. A full graduation
  from zero reserves requires approximately 10.1266 gross test ETH plus gas,
  because the unchanged graduation threshold is 10 ETH net and fees are 1.25%.
  Fork proof does not substitute for a public-chain graduation transaction.
- Confirmed launches discovered while viewing HYPR are persisted immediately.
  Durable indexing still needs a scheduled worker/backfill plan for unattended
  launches that are never viewed during the recent window. Historical
  persistence does not make a scheduler operational.

Public frontend: [HYPR](https://hypr-pons.vercel.app).
