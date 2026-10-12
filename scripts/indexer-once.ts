import { createPublicClient, http } from "viem";
import { readRecentNativeLaunches } from "../src/lib/integrations/hypr/indexer";
import { getHyprFactoryAddress, getHyprNetwork, HYPR_NETWORKS } from "../src/lib/integrations/hypr/constants";
import { confirmedBlockRange } from "../src/lib/integrations/indexer-utils";
import { getPonsRpcUrl, PONS, ROBINHOOD_CHAIN } from "../src/lib/integrations/pons/constants";
import { readRecentLaunches } from "../src/lib/integrations/pons/indexer";
import { applyIndexBatch, markIndexError, serializeIndexBatch, type IndexBatch } from "../src/lib/supabase/indexer";

const LOOKBACK_BLOCKS = 2_500n;
const CONFIRMATION_DEPTH = 12n;

function readSource() {
  const source = process.env.HYPR_INDEXER_SOURCE?.trim().toLowerCase() || "pons";
  if (source !== "pons" && source !== "hypr") throw new Error("HYPR_INDEXER_SOURCE must be pons or hypr");
  return source;
}

async function readWindow(source: "pons" | "hypr") {
  const network = source === "pons" ? ROBINHOOD_CHAIN : HYPR_NETWORKS[getHyprNetwork()];
  const rpcUrl = source === "pons"
    ? getPonsRpcUrl()
    : process.env.HYPR_RPC_URL || network.rpcUrl;
  const client = createPublicClient({ chain: network, transport: http(rpcUrl) });
  const latest = await client.getBlockNumber();
  const floor = source === "pons" ? PONS.activeFactoryStartBlock : 0n;
  return {
    chainId: network.id,
    rpcUrl,
    range: confirmedBlockRange(latest, CONFIRMATION_DEPTH, LOOKBACK_BLOCKS, floor),
  };
}

async function buildBatch(source: "pons" | "hypr"): Promise<IndexBatch> {
  const window = await readWindow(source);
  if (source === "pons") {
    const launches = await readRecentLaunches(window.rpcUrl);
    return {
      source: "pons-v1",
      chainId: window.chainId,
      fromBlock: window.range.fromBlock,
      toBlock: window.range.safeHead,
      tokens: launches.map((launch) => ({
        address: launch.address,
        origin: "pons" as const,
        dataStatus: "partial" as const,
        name: launch.name || "Unresolved Robinhood token",
        symbol: launch.symbol || "—",
        deployer: launch.deployer,
        pool: launch.pool,
        metadata: {
          decimals: launch.decimals,
          swapCount: launch.swapCount,
          poolPriceQuote: launch.poolPriceQuote,
          poolLiquidity: launch.poolLiquidity,
        },
      })),
      events: launches.map((launch) => ({
        transactionHash: launch.transactionHash,
        logIndex: BigInt(launch.eventId.split(":").pop() || "0"),
        blockNumber: launch.blockNumber,
        eventType: "TokenLaunched",
        tokenAddress: launch.address,
        payload: {
          pool: launch.pool,
          deployer: launch.deployer,
          name: launch.name,
          symbol: launch.symbol,
          decimals: launch.decimals,
          swapCount: launch.swapCount,
          poolPriceQuote: launch.poolPriceQuote,
          poolLiquidity: launch.poolLiquidity,
        },
      })),
    };
  }

  const launches = await readRecentNativeLaunches(window.rpcUrl);
  return {
    source: "hypr",
    chainId: window.chainId,
    fromBlock: window.range.fromBlock,
    toBlock: window.range.safeHead,
    tokens: launches.map((launch) => ({
      address: launch.token,
      origin: "hypr" as const,
      dataStatus: "partial" as const,
      name: launch.name,
      symbol: launch.symbol,
      deployer: launch.creator,
      metadata: {
        factory: getHyprFactoryAddress()?.toLowerCase(),
        creator: launch.creator,
        curve: launch.curve,
        transactionHash: launch.transactionHash,
        blockNumber: launch.blockNumber.toString(),
        logIndex: launch.eventId.split(":").pop(),
        totalSupply: launch.totalSupply.toString(),
        tradableSupply: launch.tradableSupply.toString(),
        virtualQuoteReserve: launch.virtualQuoteReserve.toString(),
        graduationThreshold: launch.graduationThreshold.toString(),
        totalFeeBps: launch.totalFeeBps.toString(),
        creatorFeeBps: launch.creatorFeeBps.toString(),
        protocolFeeBps: launch.protocolFeeBps.toString(),
      },
    })),
    events: launches.filter((launch) => launch.blockNumber >= window.range.fromBlock && launch.blockNumber <= window.range.safeHead).map((launch) => ({
      transactionHash: launch.transactionHash,
      logIndex: BigInt(launch.eventId.split(":").pop() || "0"),
      blockNumber: launch.blockNumber,
      eventType: "LaunchCreated",
      tokenAddress: launch.token,
      payload: {
        curve: launch.curve,
        creator: launch.creator,
        name: launch.name,
        symbol: launch.symbol,
        realQuoteReserve: launch.realQuoteReserve?.toString(),
        realTokenReserve: launch.realTokenReserve?.toString(),
        creatorFees: launch.creatorFees?.toString(),
        protocolFees: launch.protocolFees?.toString(),
        tradeVolume: launch.tradeVolume?.toString(),
        tradeCount: launch.tradeCount,
        curvePhase: launch.curvePhase,
        graduationPoolId: launch.graduationPoolId,
        graduationTxHash: launch.graduationTxHash,
      },
    })),
  };
}

async function main() {
  const source = readSource();
  const indexSource = source === "pons" ? "pons-v1" : "hypr";
  const indexChainId = source === "pons" ? ROBINHOOD_CHAIN.id : HYPR_NETWORKS[getHyprNetwork()].id;
  const dryRun = process.env.HYPR_INDEXER_DRY_RUN === "1";
  let applyStarted = false;
  try {
    const batch = await buildBatch(source);
    if (dryRun) {
      const payload = serializeIndexBatch(batch);
      console.log(JSON.stringify(payload, (_key, value) => typeof value === "bigint" ? value.toString() : value, 2));
      console.log(`indexer dry run complete: ${batch.events.length} ${source} events; no database or chain write attempted`);
    } else {
      applyStarted = true;
      const result = await applyIndexBatch(batch);
      console.log(`indexer applied ${result.processedEvents} ${source} events through block ${result.cursorBlock}`);
    }
  } catch (error) {
    if (!dryRun && !applyStarted) {
      try {
        await markIndexError(indexSource, indexChainId, error instanceof Error ? error.message : "Indexer read failed");
      } catch {
        // Preserve the RPC/configuration error when diagnostics are unavailable.
      }
    }
    throw error;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
