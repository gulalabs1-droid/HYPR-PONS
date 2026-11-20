import { NextRequest, NextResponse } from "next/server";
import { COMMUNITY_SESSION_COOKIE, decodeAuthorization, requestOrigin } from "@/lib/community-auth";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };

/** Creator-only room numbers: views, plays, chat, follows, peak viewers and people who came back. */
export async function GET(request: NextRequest) {
  const roomId = request.nextUrl.searchParams.get("roomId") || "";
  if (!/^0x[a-fA-F0-9]{40}$/.test(roomId)) return NextResponse.json({ error: "A valid room is required." }, { status: 400, headers });
  const session = decodeAuthorization(request.cookies.get(COMMUNITY_SESSION_COOKIE)?.value, requestOrigin(request), "session");
  if (!session) return NextResponse.json({ error: "Sign in as the room creator to see stats." }, { status: 401, headers });
  const client = getSupabaseAdminClient();
  if (!client) return NextResponse.json({ error: "Stats are unavailable." }, { status: 503, headers });
  try { return NextResponse.json(await client.rpc("hypr_creator_stats", { p_chain_id: session.chainId, p_token_address: roomId, p_wallet_address: session.wallet }), { headers }); }
  catch { return NextResponse.json({ error: "Only the room creator can see these stats." }, { status: 403, headers }); }
}
