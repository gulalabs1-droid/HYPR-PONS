import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { getHyprNetwork, HYPR_NETWORKS } from "@/lib/integrations/hypr/constants";
import { normalizePulse } from "@/lib/pulse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Aggregates only, the same for every viewer: let the CDN absorb repeat reads.
const cached = { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" };
const uncached = { "Cache-Control": "no-store" };

/** HYPR Pulse: public community engagement for a room. Never includes coin price or trading. */
export async function GET(request: NextRequest) {
  const roomId = request.nextUrl.searchParams.get("roomId") || "";
  if (!/^0x[a-fA-F0-9]{40}$/.test(roomId)) return NextResponse.json({ error: "A valid room is required." }, { status: 400, headers: uncached });
  const client = getSupabaseAdminClient();
  if (!client) return NextResponse.json({ pulse: null }, { headers: uncached });
  try {
    const pulse = normalizePulse(await client.rpc<unknown>("hypr_room_pulse", { p_chain_id: HYPR_NETWORKS[getHyprNetwork()].id, p_token_address: roomId }));
    return NextResponse.json({ pulse }, { headers: pulse ? cached : uncached });
  } catch {
    // Missing migration or a database hiccup: the panel hides itself rather than showing zeros.
    return NextResponse.json({ pulse: null }, { headers: uncached });
  }
}
