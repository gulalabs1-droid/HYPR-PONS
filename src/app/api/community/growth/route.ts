import { NextRequest, NextResponse } from "next/server";
import { COMMUNITY_SESSION_COOKIE, decodeAuthorization, requestOrigin, sameOrigin } from "@/lib/community-auth";
import { ADDRESS, validateGrowthWrite } from "@/lib/growth";
import { growthEnabled, readGrowth } from "@/lib/growth-server";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };

export async function GET(request: NextRequest) {
  const roomId = request.nextUrl.searchParams.get("roomId");
  if (roomId && !ADDRESS.test(roomId)) return NextResponse.json({ error: "Invalid room address." }, { status: 400, headers });
  if (!growthEnabled()) return NextResponse.json({ enabled: false, rooms: [], wallet: null, checkedAt: new Date().toISOString() }, { headers });
  const session = decodeAuthorization(request.cookies.get(COMMUNITY_SESSION_COOKIE)?.value, requestOrigin(request), "session");
  try { return NextResponse.json({ enabled: true, rooms: await readGrowth(session?.wallet || null, roomId), wallet: session?.wallet || null, checkedAt: new Date().toISOString() }, { headers }); }
  catch { return NextResponse.json({ error: "Shows and creator profiles are temporarily unavailable. No sample schedules are shown." }, { status: 503, headers }); }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Use HYPR to update this room." }, { status: 403, headers });
  const session = decodeAuthorization(request.cookies.get(COMMUNITY_SESSION_COOKIE)?.value, requestOrigin(request), "session");
  if (!session) return NextResponse.json({ error: "Sign in to save this change." }, { status: 401, headers });
  if (Number(request.headers.get("content-length")) > 6000) return NextResponse.json({ error: "Request too large." }, { status: 413, headers });
  let body;
  try { body = validateGrowthWrite(await request.json()); } catch { /* invalid JSON */ }
  if (!body) return NextResponse.json({ error: "Check the form. Shows must start in the next 90 days and include a timezone." }, { status: 400, headers });
  const client = getSupabaseAdminClient();
  if (!growthEnabled() || !client) return NextResponse.json({ error: "Creator scheduling is not available yet." }, { status: 503, headers });
  try {
    const result = await client.rpc("hypr_write_growth", { p_chain_id: session.chainId, p_token_address: body.roomId, p_wallet_address: session.wallet, p_action: body.action, p_payload: body.payload });
    return NextResponse.json({ saved: true, result }, { headers });
  } catch { return NextResponse.json({ error: "Not saved. Only this room’s creator may edit it. Refresh if the show changed; wait before retrying repeated requests." }, { status: 409, headers }); }
}
