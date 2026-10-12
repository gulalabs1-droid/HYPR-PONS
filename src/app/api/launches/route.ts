import { NextResponse } from "next/server";
import { getLaunchData } from "@/lib/integrations/pons/data";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const result = await getLaunchData();
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
