import { NextResponse } from "next/server";
import { getLaunches } from "@/lib/integrations/pons/data";

export async function GET() {
  const launches = await getLaunches();
  return NextResponse.json({ source: process.env.PONS_INDEXER_MODE === "rpc" ? "rpc-or-fallback" : "fixture", launches });
}
