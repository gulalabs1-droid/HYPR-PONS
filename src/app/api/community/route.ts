import { NextRequest, NextResponse } from "next/server";
import { COMMUNITY_SESSION_COOKIE, decodeAuthorization, requestOrigin, sameOrigin } from "@/lib/community-auth";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { getHyprNetwork, HYPR_NETWORKS } from "@/lib/integrations/hypr/constants";
import { PILOT_COOKIE, permitsPilotRequest, readPilotConsent, recordPilotEvent } from "@/lib/pilot-analytics-server";
import { UUID } from "@/lib/growth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
const validAddress = (value: unknown): value is string => typeof value === "string" && /^0x[a-fA-F0-9]{40}$/.test(value);

export async function GET(request: NextRequest) {
  const roomId = request.nextUrl.searchParams.get("roomId");
  if (!validAddress(roomId)) return NextResponse.json({ error: "A valid room address is required." }, { status: 400, headers });
  const client = getSupabaseAdminClient();
  if (!client) return NextResponse.json({ error: "Shared chat and follows are unavailable." }, { status: 503, headers });
  const session = decodeAuthorization(request.cookies.get(COMMUNITY_SESSION_COOKIE)?.value, requestOrigin(request), "session");
  const before = request.nextUrl.searchParams.get("before");
  if (before && !UUID.test(before)) return NextResponse.json({ error: "Invalid message cursor." }, { status: 400, headers });
  try {
    const args = { p_chain_id: HYPR_NETWORKS[getHyprNetwork()].id, p_token_address: roomId, p_wallet_address: session?.wallet || null, p_before: before };
    const state = before
      ? await client.rpc<Record<string, unknown>>("hypr_read_community_feed", args)
      : await client.rpc<Record<string, unknown>>("hypr_read_community_feed", args).catch(() => client.rpc<Record<string, unknown>>("hypr_read_community", { p_chain_id: args.p_chain_id, p_token_address: args.p_token_address, p_wallet_address: args.p_wallet_address }));
    return NextResponse.json({ ...state, wallet: session?.wallet || null, checkedAt: new Date().toISOString() }, { headers });
  } catch { return NextResponse.json({ error: before ? "Older messages are unavailable." : "Shared community data is temporarily unavailable. No local preview is being shown." }, { status: 503, headers }); }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Use HYPR to update this room." }, { status: 403, headers });
  const session = decodeAuthorization(request.cookies.get(COMMUNITY_SESSION_COOKIE)?.value, requestOrigin(request), "session");
  if (!session) return NextResponse.json({ error: "Sign in with your wallet to join the community." }, { status: 401, headers });
  let body: { roomId?: string; action?: string; body?: string; following?: boolean; messageId?: string; shareId?: string; analyticsConsent?: boolean };
  try { body = await request.json(); if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("invalid body"); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400, headers }); }
  if (!validAddress(body.roomId) || !["message", "follow", "hide", "pin", "unpin"].includes(body.action || "") ||
    (body.action === "message" && (typeof body.body !== "string" || !body.body.trim() || body.body.length > 280)) ||
    (body.action === "follow" && typeof body.following !== "boolean") ||
    (["hide", "pin"].includes(body.action || "") && !UUID.test(body.messageId || ""))) return NextResponse.json({ error: "Invalid community update." }, { status: 400, headers });
  const client = getSupabaseAdminClient();
  if (!client) return NextResponse.json({ error: "Shared community is unavailable." }, { status: 503, headers });
  try {
    const actor = body.analyticsConsent === true && permitsPilotRequest(request) ? readPilotConsent(request.cookies.get(PILOT_COOKIE)?.value) : null;
    const before = actor && body.action === "follow" ? await client.rpc<{ following: boolean }>("hypr_read_community", { p_chain_id: session.chainId, p_token_address: body.roomId, p_wallet_address: session.wallet }).catch(() => null) : null;
    await client.rpc("hypr_write_community", { p_chain_id: session.chainId, p_token_address: body.roomId, p_wallet_address: session.wallet, p_action: body.action, p_body: body.body?.trim() || null, p_follow: body.following ?? null, p_message_id: body.messageId || null });
    if (actor && before && before.following !== body.following) await recordPilotEvent(actor, body.following ? "creator_followed" : "creator_unfollowed", body.roomId!, crypto.randomUUID(), body.shareId && UUID.test(body.shareId) ? body.shareId : null).catch(() => undefined);
    return NextResponse.json({ saved: true }, { headers });
  } catch { return NextResponse.json({ error: "Update not saved. Try again in a few seconds. Messages are limited to ten per minute; only you or the room creator can hide a message." }, { status: 503, headers }); }
}
