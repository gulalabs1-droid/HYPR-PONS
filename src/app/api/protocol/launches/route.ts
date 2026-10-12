import { NextResponse } from "next/server";
import { getHyprFactoryAddress, getHyprNetwork } from "@/lib/integrations/hypr/constants";
import { readRecentNativeLaunches } from "@/lib/integrations/hypr/indexer";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function serializeLaunch(launch: Awaited<ReturnType<typeof readRecentNativeLaunches>>[number]) {
  return {
    ...launch,
    totalSupply: launch.totalSupply.toString(),
    tradableSupply: launch.tradableSupply.toString(),
    virtualQuoteReserve: launch.virtualQuoteReserve.toString(),
    graduationThreshold: launch.graduationThreshold.toString(),
    totalFeeBps: launch.totalFeeBps.toString(),
    creatorFeeBps: launch.creatorFeeBps.toString(),
    protocolFeeBps: launch.protocolFeeBps.toString(),
    realQuoteReserve: launch.realQuoteReserve?.toString(),
    realTokenReserve: launch.realTokenReserve?.toString(),
    creatorFees: launch.creatorFees?.toString(),
    protocolFees: launch.protocolFees?.toString(),
    graduationPoolId: launch.graduationPoolId,
    tradeVolume: launch.tradeVolume?.toString(),
    tradeCount: launch.tradeCount,
    blockNumber: launch.blockNumber.toString(),
  };
}

export async function GET() {
  try {
    const factoryAddress = getHyprFactoryAddress();
    const launches = await readRecentNativeLaunches();
    return NextResponse.json({
      network: getHyprNetwork(),
      factoryAddress,
      source: factoryAddress ? "native-rpc" : "unconfigured",
      launches: launches.map(serializeLaunch),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Native protocol read failed" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
