import { NextRequest, NextResponse } from "next/server";
import { COMMUNITY_SESSION_COOKIE, decodeAuthorization, requestOrigin } from "@/lib/community-auth";
import { ADDRESS } from "@/lib/growth";
import { growthEnabled, isOperatorWallet } from "@/lib/growth-server";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const headers = { "Cache-Control": "no-store" };
  const session = decodeAuthorization(request.cookies.get(COMMUNITY_SESSION_COOKIE)?.value, requestOrigin(request), "session");
  if (!session) return NextResponse.json({ error: "Sign in as the room creator." }, { status: 401, headers });
  const scope = request.nextUrl.searchParams.get("scope");
  const client = getSupabaseAdminClient();
  if (!growthEnabled() || !client) return NextResponse.json({ error: "Reports unavailable." }, { status: 503, headers });
  if (scope === "operator") {
    if (!isOperatorWallet(session.wallet)) return NextResponse.json({ error: "Operator reports require a configured operator wallet." }, { status: 403, headers });
    try { return NextResponse.json({ reports: await client.rpc("hypr_read_operator_reports", { p_chain_id: session.chainId, p_allowed: true }) }, { headers }); }
    catch { return NextResponse.json({ error: "Operator inbox is unavailable." }, { status: 503, headers }); }
  }
  const roomId = request.nextUrl.searchParams.get("roomId") || "";
  if (!ADDRESS.test(roomId)) return NextResponse.json({ error: "Invalid room." }, { status: 400, headers });
  try { return NextResponse.json({ reports: await client.rpc("hypr_read_reports", { p_chain_id: session.chainId, p_token_address: roomId, p_wallet_address: session.wallet }) }, { headers }); }
  catch { return NextResponse.json({ error: "Only this room’s creator may read reports." }, { status: 403, headers }); }
}
