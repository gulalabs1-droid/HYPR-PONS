import type { Launch } from "@/lib/types";
import { getLaunchData, type LaunchDataSource } from "@/lib/integrations/pons/data";
import { getHyprFactoryAddress } from "@/lib/integrations/hypr/constants";
import { readRecentNativeLaunches } from "@/lib/integrations/hypr/indexer";

export type CombinedLaunchDataSource = LaunchDataSource | "mixed" | "native-empty" | "native-error";

export type CombinedLaunchData = {
  launches: Launch[];
  source: CombinedLaunchDataSource;
};

function nativeLaunchToRoom(
  launch: Awaited<ReturnType<typeof readRecentNativeLaunches>>[number],
  index: number,
): Launch {
  return {
    address: launch.token,
    // HYPR's curve is the room's current onchain venue until graduation.
    pool: launch.curve,
    name: launch.name,
    symbol: launch.symbol,
    logo: "✦",
    description: "A native HYPR launch indexed from the protocol factory. Token metadata and trading state are still being read.",
    deployer: launch.creator,
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
    origin: "hypr",
    dataStatus: "partial",
    curveProgressBps: launch.curveProgressBps,
    curvePhase: launch.curvePhase,
    nativeRealQuoteReserve: launch.realQuoteReserve?.toString(),
    nativeRealTokenReserve: launch.realTokenReserve?.toString(),
    nativeCreatorFees: launch.creatorFees?.toString(),
    nativeProtocolFees: launch.protocolFees?.toString(),
    nativeGraduationPoolId: launch.graduationPoolId,
    nativeTotalFeeBps: launch.totalFeeBps.toString(),
    nativeCreatorFeeBps: launch.creatorFeeBps.toString(),
    nativeProtocolFeeBps: launch.protocolFeeBps.toString(),
    nativeTradeVolume: launch.tradeVolume?.toString(),
    nativeTradeCount: launch.tradeCount,
    launchTxHash: launch.transactionHash,
    graduationTxHash: launch.graduationTxHash,
  };
}

async function getNativeLaunches() {
  try {
    if (!getHyprFactoryAddress()) return { launches: [], configured: false, source: "native-unconfigured" as const };
    const indexed = await readRecentNativeLaunches();
    return {
      launches: indexed.map(nativeLaunchToRoom),
      configured: true,
      source: indexed.length ? "native-rpc" as const : "native-empty" as const,
    };
  } catch {
    return { launches: [], configured: true, source: "native-error" as const };
  }
}

export async function getCombinedLaunchData(): Promise<CombinedLaunchData> {
  const [pons, native] = await Promise.all([getLaunchData(), getNativeLaunches()]);
  const knownAddresses = new Set(native.launches.map((item) => item.address.toLowerCase()));
  const ponsLaunches = pons.launches
    .filter((item) => !knownAddresses.has(item.address.toLowerCase()))
    .map((item) => ({ ...item, origin: item.origin || "pons", dataStatus: item.dataStatus || (pons.source === "fixture" || pons.source === "fixture-fallback" ? "demo" : "partial") }));
  const launches = [...native.launches, ...ponsLaunches].map((item, index) => ({ ...item, rank: index + 1 }));
  return {
    launches,
    source: native.source === "native-error"
      ? "native-error"
      : native.configured && (native.launches.length > 0 || pons.launches.length > 0)
        ? "mixed"
        : native.configured
          ? "native-empty"
          : pons.source,
  };
}
