import type { Launch } from "@/lib/types";
import { readRecentLaunches, resolvePonsVersion } from "./indexer";

export type LaunchDataSource = "fixture" | "fixture-fallback" | "rpc" | "rpc-partial" | "rpc-empty" | "rpc-error";

export type LaunchData = {
  launches: Launch[];
  source: LaunchDataSource;
};

function unresolvedLaunch(indexed: Awaited<ReturnType<typeof readRecentLaunches>>[number], index: number): Launch {
  return {
    address: indexed.address,
    pool: indexed.pool,
    deployer: indexed.deployer,
    name: indexed.name || "Unresolved Robinhood token",
    symbol: indexed.symbol || "—",
    logo: "◈",
    description: "Launch indexed. Token metadata is still being read from the contract.",
    priceUsd: 0,
    marketCapUsd: 0,
    change24h: 0,
    holders: 0,
    activeNow: 0,
    followers: 0,
    hype: 0,
    rank: index + 1,
    launchedAt: "",
    trades24h: 0,
    officialLinks: [],
  };
}

export async function getLaunchData(): Promise<LaunchData> {
  // The public product never substitutes samples for a missing live source.
  if (process.env.PONS_INDEXER_MODE !== "rpc") return { launches: [], source: "rpc-empty" };
  try {
    resolvePonsVersion();
    const indexed = await readRecentLaunches();
    if (!indexed.length) return { launches: [], source: "rpc-empty" };
    return {
      // RPC results intentionally do not inherit fixture price, holder, or
      // social metrics. Only bounded token metadata is read from the chain.
      launches: indexed.map((item, index) => ({
        ...unresolvedLaunch(item, index),
        launchTxHash: item.transactionHash,
        ponsTradeCount: item.swapCount,
        poolPriceQuote: item.poolPriceQuote,
        poolLiquidity: item.poolLiquidity,
      })),
      source: "rpc-partial",
    };
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Unsupported Pons version:")) {
      return { launches: [], source: "rpc-error" };
    }
    return { launches: [], source: "rpc-error" };
  }
}

export async function getLaunches(): Promise<Launch[]> {
  return (await getLaunchData()).launches;
}
