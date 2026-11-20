import { NextRequest, NextResponse } from "next/server";
import { COMMUNITY_SESSION_COOKIE, decodeAuthorization, requestOrigin, sameOrigin } from "@/lib/community-auth";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { getHyprNetwork, HYPR_NETWORKS } from "@/lib/integrations/hypr/constants";
import { PILOT_COOKIE, permitsPilotRequest, readPilotConsent, recordPilotEvent } from "@/lib/pilot-analytics-server";
import { UUID } from "@/lib/growth";
import { countEvent } from "@/lib/counts-server";
import { chatMessageProblem, clientRateKey, decodeGuest, encodeGuest, GUEST_COOKIE, guestNameProblem, newGuest, voterKey } from "@/lib/guest-chat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
const validAddress = (value: unknown): value is string => typeof value === "string" && /^0x[a-fA-F0-9]{40}$/.test(value);
const guestCookie = (request: Request) => ({ httpOnly: true, secure: new URL(request.url).protocol === "https:", sameSite: "strict" as const, path: "/api/community", maxAge: 30 * 24 * 60 * 60 });
const dbReason = (error: unknown) => (error as { detail?: string })?.detail || "";
function writeFailure(error: unknown) {
  const reason = dbReason(error);
  if (reason.includes("rate limit")) return "Slow down a little—this room limits how often each person can post.";
  if (reason.includes("guest chat off")) return "The creator turned off guest chat. Sign in to chat.";
  if (reason.includes("creator required")) return "Only the room creator can change that.";
  return "Update not saved. Try again in a few seconds.";
}

export async function GET(request: NextRequest) {
  const roomId = request.nextUrl.searchParams.get("roomId");
  if (!validAddress(roomId)) return NextResponse.json({ error: "A valid room address is required." }, { status: 400, headers });
  const client = getSupabaseAdminClient();
  if (!client) return NextResponse.json({ error: "Shared chat and follows are unavailable." }, { status: 503, headers });
  const session = decodeAuthorization(request.cookies.get(COMMUNITY_SESSION_COOKIE)?.value, requestOrigin(request), "session");
  const before = request.nextUrl.searchParams.get("before");
  if (before && !UUID.test(before)) return NextResponse.json({ error: "Invalid message cursor." }, { status: 400, headers });
  const rawLimit = request.nextUrl.searchParams.get("limit") ?? "50";
  const limit = Number(rawLimit);
  if (!/^\d+$/.test(rawLimit) || !Number.isInteger(limit) || limit < 50 || limit > 500) return NextResponse.json({ error: "Message limit must be between 50 and 500." }, { status: 400, headers });
  try {
    const args = { p_chain_id: HYPR_NETWORKS[getHyprNetwork()].id, p_token_address: roomId, p_wallet_address: session?.wallet || null, p_before: before, p_limit: limit };
    const state = before || limit !== 50
      ? await client.rpc<Record<string, unknown>>("hypr_read_community_feed", args)
      : await client.rpc<Record<string, unknown>>("hypr_read_community_feed", args).catch(() => client.rpc<Record<string, unknown>>("hypr_read_community", { p_chain_id: args.p_chain_id, p_token_address: args.p_token_address, p_wallet_address: args.p_wallet_address }));
    const guest = session ? null : decodeGuest(request.cookies.get(GUEST_COOKIE)?.value, requestOrigin(request));
    // The live poll rides along with chat so viewers don't poll a second endpoint.
    const voter = voterKey(roomId, { wallet: session?.wallet, guestId: guest?.id, viewer: request.nextUrl.searchParams.get("viewer") });
    const messageIds = Array.isArray((state as { messages?: unknown }).messages) ? ((state as { messages: Array<{ id?: unknown }> }).messages).map(message => message.id).filter((id): id is string => typeof id === "string" && UUID.test(id)) : [];
    const authors = [...new Set(((state as { messages?: Array<{ wallet?: unknown }> }).messages || []).map(message => message.wallet).filter((wallet): wallet is string => typeof wallet === "string"))];
    const [poll, reactions, names] = await Promise.all([
      before ? undefined : client.rpc<unknown>("hypr_read_poll", { p_chain_id: args.p_chain_id, p_token_address: roomId, p_voter_key: voter }).catch(() => undefined),
      messageIds.length ? client.rpc<unknown>("hypr_read_reactions", { p_message_ids: messageIds, p_reactor_key: voter }).catch(() => undefined) : undefined,
      authors.length ? client.rpc<unknown>("hypr_member_names", { p_addresses: authors }).catch(() => undefined) : undefined,
    ]);
    return NextResponse.json({ ...state, wallet: session?.wallet || null, guest: guest ? { name: guest.name } : null, ...(poll !== undefined ? { poll } : {}), ...(reactions !== undefined ? { reactions } : {}), ...(names !== undefined ? { names } : {}), member: session?.account === "passkey" ? { name: session.name || "Member" } : null, checkedAt: new Date().toISOString() }, { headers });
  } catch { return NextResponse.json({ error: before ? "Older messages are unavailable." : "Shared community data is temporarily unavailable. No local preview is being shown." }, { status: 503, headers }); }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Use HYPR to update this room." }, { status: 403, headers });
  let body: { roomId?: string; action?: string; body?: string; following?: boolean; messageId?: string; shareId?: string; analyticsConsent?: boolean; guestName?: string; guestsAllowed?: boolean; slowMode?: number; emoji?: string; on?: boolean; viewer?: string };
  try { body = await request.json(); if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("invalid body"); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400, headers }); }
  const session = decodeAuthorization(request.cookies.get(COMMUNITY_SESSION_COOKIE)?.value, requestOrigin(request), "session");
  if (body.action === "guest-message") return guestMessage(request, body);
  if (body.action === "react") return react(request, body, session?.wallet || null);
  if (!session) return NextResponse.json({ error: "Sign in with your wallet to join the community." }, { status: 401, headers });
  if (body.action === "settings") {
    if (!validAddress(body.roomId) || typeof body.guestsAllowed !== "boolean" || ![0, 5, 15, 30, 60].includes(Number(body.slowMode))) return NextResponse.json({ error: "Invalid chat settings." }, { status: 400, headers });
    const client = getSupabaseAdminClient();
    if (!client) return NextResponse.json({ error: "Shared community is unavailable." }, { status: 503, headers });
    try { return NextResponse.json({ saved: true, settings: await client.rpc("hypr_write_chat_settings", { p_chain_id: session.chainId, p_token_address: body.roomId, p_wallet_address: session.wallet, p_guests_allowed: body.guestsAllowed, p_slow_mode_seconds: Number(body.slowMode) }) }, { headers }); }
    catch (error) { return NextResponse.json({ error: writeFailure(error) }, { status: dbReason(error).includes("creator required") ? 403 : 503, headers }); }
  }
  if (!validAddress(body.roomId) || !["message", "follow", "hide", "pin", "unpin"].includes(body.action || "") ||
    (body.action === "message" && (typeof body.body !== "string" || !body.body.trim() || body.body.length > 280)) ||
    (body.action === "follow" && typeof body.following !== "boolean") ||
    (["hide", "pin"].includes(body.action || "") && !UUID.test(body.messageId || ""))) return NextResponse.json({ error: "Invalid community update." }, { status: 400, headers });
  if (body.action === "message" && typeof body.body === "string") {
    const problem = chatMessageProblem(body.body, { guest: false });
    if (problem) return NextResponse.json({ error: problem }, { status: 422, headers });
  }
  const client = getSupabaseAdminClient();
  if (!client) return NextResponse.json({ error: "Shared community is unavailable." }, { status: 503, headers });
  try {
    const actor = body.analyticsConsent === true && permitsPilotRequest(request) ? readPilotConsent(request.cookies.get(PILOT_COOKIE)?.value) : null;
    const before = actor && body.action === "follow" ? await client.rpc<{ following: boolean }>("hypr_read_community", { p_chain_id: session.chainId, p_token_address: body.roomId, p_wallet_address: session.wallet }).catch(() => null) : null;
    await client.rpc("hypr_write_community", { p_chain_id: session.chainId, p_token_address: body.roomId, p_wallet_address: session.wallet, p_action: body.action, p_body: body.body?.trim() || null, p_follow: body.following ?? null, p_message_id: body.messageId || null });
    if (body.action === "message") countEvent(request, body.roomId!, "chat_message");
    if (actor && before && before.following !== body.following) await recordPilotEvent(actor, body.following ? "creator_followed" : "creator_unfollowed", body.roomId!, crypto.randomUUID(), body.shareId && UUID.test(body.shareId) ? body.shareId : null).catch(() => undefined);
    return NextResponse.json({ saved: true }, { headers });
  } catch (error) { return NextResponse.json({ error: dbReason(error) ? writeFailure(error) : "Update not saved. Try again in a few seconds. Messages are limited to ten per minute; only you or the room creator can hide a message." }, { status: dbReason(error).includes("rate limit") ? 429 : 503, headers }); }
}

/** Wallet-free chat: a nickname, a signed browser ID, strict limits and a content filter. */
async function guestMessage(request: NextRequest, body: { roomId?: string; body?: string; guestName?: string }) {
  if (!validAddress(body.roomId) || typeof body.body !== "string") return NextResponse.json({ error: "Invalid message." }, { status: 400, headers });
  const origin = requestOrigin(request);
  const existing = decodeGuest(request.cookies.get(GUEST_COOKIE)?.value, origin);
  const name = typeof body.guestName === "string" && body.guestName.trim() ? body.guestName : existing?.name;
  const nameProblem = guestNameProblem(name);
  if (nameProblem) return NextResponse.json({ error: nameProblem, needsName: true }, { status: 422, headers });
  const problem = chatMessageProblem(body.body, { guest: true });
  if (problem) return NextResponse.json({ error: problem }, { status: 422, headers });
  const client = getSupabaseAdminClient();
  if (!client) return NextResponse.json({ error: "Shared chat is unavailable." }, { status: 503, headers });
  const guest = newGuest(name!, origin, existing?.id);
  try {
    await client.rpc("hypr_write_guest_message", { p_chain_id: HYPR_NETWORKS[getHyprNetwork()].id, p_token_address: body.roomId, p_guest_id: guest.id, p_guest_name: guest.name, p_body: body.body.trim(), p_ip_hash: clientRateKey(request) });
    countEvent(request, body.roomId, "guest_message");
    const response = NextResponse.json({ saved: true, guest: { name: guest.name } }, { headers });
    response.cookies.set(GUEST_COOKIE, encodeGuest(guest), guestCookie(request));
    return response;
  } catch (error) {
    return NextResponse.json({ error: writeFailure(error) }, { status: dbReason(error).includes("rate limit") ? 429 : dbReason(error).includes("guest chat off") ? 403 : 503, headers });
  }
}

const REACTIONS = ["heart", "fire", "laugh", "clap"];
/** Anyone in the room can react—wallet, guest or anonymous tab—once per emoji per message. */
async function react(request: NextRequest, body: { roomId?: string; messageId?: string; emoji?: string; on?: boolean; viewer?: string }, wallet: string | null) {
  if (!validAddress(body.roomId) || !UUID.test(body.messageId || "") || !REACTIONS.includes(body.emoji || "") || typeof body.on !== "boolean") return NextResponse.json({ error: "Invalid reaction." }, { status: 400, headers });
  const key = voterKey(body.roomId, { wallet, guestId: decodeGuest(request.cookies.get(GUEST_COOKIE)?.value, requestOrigin(request))?.id, viewer: body.viewer || null });
  if (!key) return NextResponse.json({ error: "Invalid reaction." }, { status: 400, headers });
  const client = getSupabaseAdminClient();
  if (!client) return NextResponse.json({ error: "Reactions are unavailable." }, { status: 503, headers });
  try { await client.rpc("hypr_react", { p_chain_id: HYPR_NETWORKS[getHyprNetwork()].id, p_token_address: body.roomId, p_message_id: body.messageId, p_reactor_key: key, p_emoji: body.emoji, p_on: body.on }); return NextResponse.json({ saved: true }, { headers }); }
  catch (error) { return NextResponse.json({ error: dbReason(error).includes("rate limit") ? "Easy there—try again in a minute." : "Reaction not saved." }, { status: dbReason(error).includes("rate limit") ? 429 : 503, headers }); }
}
