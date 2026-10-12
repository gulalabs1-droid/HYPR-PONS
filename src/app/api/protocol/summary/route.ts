import { NextResponse } from "next/server";
import { readNativeProtocolSnapshot } from "@/lib/integrations/hypr/indexer";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const snapshot = await readNativeProtocolSnapshot();
  return NextResponse.json({
    ...snapshot,
    lookbackBlocks: snapshot.lookbackBlocks.toString(),
    confirmationDepth: snapshot.confirmationDepth.toString(),
    totalTradeVolume: snapshot.totalTradeVolume?.toString(),
    totalCreatorFees: snapshot.totalCreatorFees?.toString(),
    totalProtocolFees: snapshot.totalProtocolFees?.toString(),
  }, { headers: { "Cache-Control": "no-store" } });
}
