import { NextRequest, NextResponse } from "next/server";
import { sameOrigin } from "@/lib/community-auth";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { getHyprNetwork, HYPR_NETWORKS } from "@/lib/integrations/hypr/constants";
import { presenceKey } from "@/lib/guest-chat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };

/** Anonymous "here now" heartbeat. The random per-tab ID is hashed and kept for minutes. */
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Use HYPR to join this room." }, { status: 403, headers });
  let body: { roomId?: unknown; viewer?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400, headers }); }
  if (typeof body?.roomId !== "string" || !/^0x[a-fA-F0-9]{40}$/.test(body.roomId) || typeof body.viewer !== "string" || !/^[a-f0-9]{32}$/.test(body.viewer)) return NextResponse.json({ error: "Invalid presence." }, { status: 400, headers });
  const client = getSupabaseAdminClient();
  if (!client) return NextResponse.json({ here: null }, { headers });
  try {
    const here = await client.rpc<number>("hypr_touch_presence", { p_chain_id: HYPR_NETWORKS[getHyprNetwork()].id, p_token_address: body.roomId, p_viewer_key: presenceKey(body.roomId, body.viewer) });
    return NextResponse.json({ here: typeof here === "number" ? here : null }, { headers });
  } catch { return NextResponse.json({ here: null }, { headers }); }
}
