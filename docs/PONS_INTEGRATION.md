# pons + Robinhood Chain integration

Verified against the current official documentation on 2026-09-05:

- Robinhood Chain mainnet chain ID: `4663`.
- Native gas asset: ETH.
- Public RPC: `https://rpc.mainnet.chain.robinhood.com` (rate-limited; not production-grade).
- Active pons factory: `0xA5aAb3F0c6EeadF30Ef1D3Eb997108E976351feB`, start block `8991118`.
- Legacy factory: `0x0c37a24F5D23A486FA692d1500881d698B1F77a4`, start block `8600612`.
- Active WETH quote token: `0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73`.
- Authoritative launch event: `TokenLaunched` on the factory.
- Authoritative pool trade event: Uniswap V3 `Swap`.

Sources: [pons integration docs](https://docs.ponsfamily.com/) and [Robinhood Chain connecting docs](https://docs.robinhood.com/chain/connecting/).

## Indexing plan

1. Read factory logs in bounded block chunks; wide public-RPC `eth_getLogs` requests time out.
2. Normalize each launch with token, deployer, pool, block number, transaction hash, and log index.
3. Deduplicate on `transaction_hash + log_index`.
4. Read token metadata (`name`, `symbol`, `decimals`, `logo`, `description`, `socials`, `liquidityPool`) from the token contract.
5. Register the pool and index bounded `Swap` events.
6. Persist the latest successful block checkpoint and an error status. Re-run failed batches safely.
7. Handle reorgs conservatively by waiting for confirmations before making a launch visible.

The current code implements steps 1–3 for recent active-factory launches and uses fixtures for the rest until persistence is configured.

## Missing production setup

No API key is required for local demo mode. For historical backfills and production reliability, configure an archive-capable RPC provider using `PONS_ARCHIVE_RPC_URL`. Do not put that secret in `NEXT_PUBLIC_*` variables.

pons is written lowercase and HYPR must not imply a partnership or endorsement without a written agreement.
