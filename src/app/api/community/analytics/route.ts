import { NextRequest, NextResponse } from "next/server";
import { COMMUNITY_SESSION_COOKIE, decodeAuthorization, requestOrigin, sameOrigin } from "@/lib/community-auth";
import { ADDRESS, UUID } from "@/lib/growth";
import { growthChain, growthEnabled } from "@/lib/growth-server";
import { PILOT_COOKIE, issuePilotConsent, permitsPilotRequest, readPilotConsent, recordPilotEvent } from "@/lib/pilot-analytics-server";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
const clientEvents = ["room_viewed", "stream_playback_started", "stream_watch_threshold_reached", "room_shared", "share_link_opened"];
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Use HYPR for this request." }, { status: 403, headers });
  let body;
  try { if (Number(request.headers.get("content-length")) > 1500) throw new Error(); body = await request.json(); if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error(); } catch { return NextResponse.json({ error: "Invalid event." }, { status: 400, headers }); }
  const cookieOptions = { path: "/api/community", httpOnly: true, sameSite: "strict" as const, secure: new URL(request.url).protocol === "https:", maxAge: 30 * 86400 };
  if (body.action === "withdraw") {
    const actor = readPilotConsent(request.cookies.get(PILOT_COOKIE)?.value);
    const client = getSupabaseAdminClient();
    if (actor && client && growthEnabled()) {
      try { await client.rpc("hypr_forget_growth_actor", { p_actor_id: actor }); }
      catch { return NextResponse.json({ error: "Tracking stopped in this browser; stored-data removal failed. Retry removal." }, { status: 503, headers }); }
    }
    const response = NextResponse.json({ tracking: false }, { headers }); response.cookies.set(PILOT_COOKIE, "", { ...cookieOptions, maxAge: 0 }); return response;
  }
  if (!growthEnabled()) return NextResponse.json({ error: "Pilot analytics are not enabled." }, { status: 503, headers });
  if (!permitsPilotRequest(request)) return NextResponse.json({ ignored: true }, { headers });
  const actor = readPilotConsent(request.cookies.get(PILOT_COOKIE)?.value);
  if (body.action === "consent") {
    const response = NextResponse.json({ tracking: true }, { headers });
    if (!actor) response.cookies.set(PILOT_COOKIE, issuePilotConsent(), cookieOptions);
    return response;
  }
  if (!actor) return NextResponse.json({ error: "Optional analytics consent is required." }, { status: 401, headers });
  if (body.action === "prepare-share" && typeof body.roomId === "string" && ADDRESS.test(body.roomId)) {
    try { const client = getSupabaseAdminClient(); if (!client) throw new Error(); return NextResponse.json({ shareId: await client.rpc("hypr_prepare_growth_share", { p_chain_id: growthChain(), p_token_address: body.roomId, p_actor_id: actor }) }, { headers }); }
    catch { return NextResponse.json({ error: "Attribution unavailable; canonical sharing still works." }, { status: 429, headers }); }
  }
  if (body.action !== "event" || !clientEvents.includes(body.event) || typeof body.roomId !== "string" || !ADDRESS.test(body.roomId) || typeof body.id !== "string" || !UUID.test(body.id) || (body.shareId != null && (typeof body.shareId !== "string" || !UUID.test(body.shareId)))) return NextResponse.json({ error: "Invalid event." }, { status: 400, headers });
  try { return NextResponse.json(await recordPilotEvent(actor, body.event, body.roomId, body.id, body.shareId || null), { headers }); }
  catch { return NextResponse.json({ error: "Measurement not saved. Viewing and sharing still work." }, { status: 429, headers }); }
}
export async function GET(request: NextRequest) {
  const session = decodeAuthorization(request.cookies.get(COMMUNITY_SESSION_COOKIE)?.value, requestOrigin(request), "session");
  if (!session) return NextResponse.json({ error: "Sign in as a creator to see insights." }, { status: 401, headers });
  const roomId = request.nextUrl.searchParams.get("roomId");
  if (roomId && !ADDRESS.test(roomId)) return NextResponse.json({ error: "Invalid room." }, { status: 400, headers });
  const founder = process.env.HYPR_ANALYTICS_ADMIN_WALLET?.toLowerCase() === session.wallet;
  if (!roomId && !founder) return NextResponse.json({ error: "Founder insights require an explicitly configured admin wallet." }, { status: 403, headers });
  const client = getSupabaseAdminClient();
  if (!growthEnabled() || !client) return NextResponse.json({ error: "Insights unavailable." }, { status: 503, headers });
  try { return NextResponse.json(await client.rpc("hypr_growth_metrics", { p_chain_id: session.chainId, p_token_address: roomId, p_wallet_address: session.wallet, p_founder: founder }), { headers }); }
  catch { return NextResponse.json({ error: "Only this room’s creator may view its insights." }, { status: 403, headers }); }
}
