# pons + Robinhood Chain integration

Verified against the current official documentation on 2026-09-06:

- Robinhood Chain mainnet chain ID: `4663`.
- Native gas asset: ETH.
- Public RPC: `https://rpc.mainnet.chain.robinhood.com` (rate-limited; not production-grade).
- Active pons factory: `0xA5aAb3F0c6EeadF30Ef1D3Eb997108E976351feB`, start block `8991118`.
- Legacy factory: `0x0c37a24F5D23A486FA692d1500881d698B1F77a4`, start block `8600612`.
- Active WETH quote token: `0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73`.
- Authoritative launch event: `TokenLaunched` on the factory.
- Authoritative pool trade event: Uniswap V3 `Swap`.

## Versioning warning

The official documentation now exposes both the original active/legacy pons deployment and a separate pons v2 deployment. The original surface uses the active and legacy factories above; pons v2 uses a different factory and launch lifecycle with per-launch curves, graduation, and Uniswap v4. HYPR must select the target version explicitly and keep factory addresses, event ABIs, deployment blocks, and state readers versioned. It must not infer a launch's version from its name, symbol, or price.

Sources: [pons integration docs](https://docs.ponsfamily.com/) and [Robinhood Chain connecting docs](https://docs.robinhood.com/chain/connecting/).

## Indexing plan

1. Read factory logs in bounded block chunks; wide public-RPC `eth_getLogs` requests time out.
2. Normalize each launch with token, deployer, pool, block number, transaction hash, and log index.
3. Deduplicate on `transaction_hash + log_index`.
4. Read bounded token metadata (`name`, `symbol`, `decimals`) from the token contract; treat logo, description, socials, and liquidity metadata as separate untrusted enrichment inputs.
5. Register the pool and index bounded `Swap` events.
6. Persist the latest successful block checkpoint and an error status. Re-run failed batches safely.
7. Handle reorgs conservatively by reading only through a 12-block confirmation buffer, splitting recent reads into 500-block chunks, deduplicating stable `(transaction_hash, log_index)` identities, and keeping the backfill bounded.

The current code implements a recent active-factory launch read and event normalization with a 2,500-block lookback, 500-block RPC chunks, 12-block confirmation buffer, duplicate rejection, bounded token name/symbol/decimals reads, bounded Uniswap V3 `Swap` counts, and validated WETH-denominated `slot0`/liquidity reads for each discovered pool. Native HYPR launch reads also aggregate `TradeExecuted` gross quote volume/count over the same bounded window. The opt-in `npm run indexer:once` worker feeds either bounded Pons v1 or native HYPR launch reads into the transactional persistence adapter. `PONS_VERSION` is explicit and unsupported v2 configuration fails closed instead of silently using the v1 ABI. It does not yet index legacy or v2 launches, read holders or graduation state, or run on a schedule. Fixture and partial-RPC states are labeled in the UI and API until persistence is configured.

## Missing production setup

No API key is required for local demo mode. For historical backfills and production reliability, configure an archive-capable RPC provider using `PONS_ARCHIVE_RPC_URL`. Do not put that secret in `NEXT_PUBLIC_*` variables.

pons is written lowercase and HYPR must not imply a partnership or endorsement without a written agreement.
