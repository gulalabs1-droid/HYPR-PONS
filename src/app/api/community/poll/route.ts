import { NextRequest, NextResponse } from "next/server";
import { COMMUNITY_SESSION_COOKIE, decodeAuthorization, requestOrigin, sameOrigin } from "@/lib/community-auth";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { getHyprNetwork, HYPR_NETWORKS } from "@/lib/integrations/hypr/constants";
import { chatMessageProblem, decodeGuest, GUEST_COOKIE, voterKey } from "@/lib/guest-chat";
import { UUID } from "@/lib/growth";
import { countEvent } from "@/lib/counts-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
const ADDRESS = /^0x[a-fA-F0-9]{40}$/;

/** Creator opens/closes a poll; anyone in the room votes once (changeable while open). */
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Use HYPR to vote." }, { status: 403, headers });
  let body: { roomId?: unknown; action?: unknown; question?: unknown; options?: unknown; pollId?: unknown; option?: unknown; viewer?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400, headers }); }
  if (typeof body?.roomId !== "string" || !ADDRESS.test(body.roomId)) return NextResponse.json({ error: "Invalid room." }, { status: 400, headers });
  const client = getSupabaseAdminClient();
  if (!client) return NextResponse.json({ error: "Polls are unavailable." }, { status: 503, headers });
  const origin = requestOrigin(request);
  const session = decodeAuthorization(request.cookies.get(COMMUNITY_SESSION_COOKIE)?.value, origin, "session");
  const chainId = HYPR_NETWORKS[getHyprNetwork()].id;
  if (body.action === "vote") {
    const key = voterKey(body.roomId, { wallet: session?.wallet, guestId: decodeGuest(request.cookies.get(GUEST_COOKIE)?.value, origin)?.id, viewer: typeof body.viewer === "string" ? body.viewer : null });
    if (!key || typeof body.pollId !== "string" || !UUID.test(body.pollId) || !Number.isInteger(body.option)) return NextResponse.json({ error: "Invalid vote." }, { status: 400, headers });
    try { await client.rpc("hypr_vote_poll", { p_chain_id: chainId, p_token_address: body.roomId, p_poll_id: body.pollId, p_voter_key: key, p_option: body.option }); countEvent(request, body.roomId, "poll_vote"); return NextResponse.json({ voted: true }, { headers }); }
    catch { return NextResponse.json({ error: "This poll has closed." }, { status: 409, headers }); }
  }
  if (!session) return NextResponse.json({ error: "Sign in as the room creator to run polls." }, { status: 401, headers });
  if (body.action === "open") {
    const question = typeof body.question === "string" ? body.question.trim() : "";
    const options = Array.isArray(body.options) ? body.options.map(option => typeof option === "string" ? option.trim() : "").filter(Boolean) : [];
    if (question.length < 3 || question.length > 120 || options.length < 2 || options.length > 4 || options.some(option => option.length > 40)) return NextResponse.json({ error: "Polls need a question and 2–4 short options." }, { status: 400, headers });
    if ([question, ...options].some(text => chatMessageProblem(text, { guest: false }))) return NextResponse.json({ error: "That poll can’t be posted here." }, { status: 422, headers });
    try { await client.rpc("hypr_write_poll", { p_chain_id: chainId, p_token_address: body.roomId, p_wallet_address: session.wallet, p_action: "open", p_question: question, p_options: options }); return NextResponse.json({ saved: true }, { headers }); }
    catch { return NextResponse.json({ error: "Only the room creator can run polls." }, { status: 403, headers }); }
  }
  if (body.action === "close") {
    try { await client.rpc("hypr_write_poll", { p_chain_id: chainId, p_token_address: body.roomId, p_wallet_address: session.wallet, p_action: "close" }); return NextResponse.json({ saved: true }, { headers }); }
    catch { return NextResponse.json({ error: "Only the room creator can end polls." }, { status: 403, headers }); }
  }
  return NextResponse.json({ error: "Invalid poll action." }, { status: 400, headers });
}
