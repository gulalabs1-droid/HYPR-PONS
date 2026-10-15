import { NextRequest, NextResponse } from "next/server";
import { COMMUNITY_SESSION_COOKIE, decodeAuthorization, requestOrigin, sameOrigin } from "@/lib/community-auth";
import { ADDRESS, UUID } from "@/lib/growth";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { getHyprNetwork, HYPR_NETWORKS } from "@/lib/integrations/hypr/constants";
import { getLiveCaptureSession, roomNameForLaunch } from "@/lib/livekit";
import { createMediaUpload, verifyMediaHeader, type StoredMedia } from "@/lib/media-server";
import { MEDIA_LIMITS, mediaMime } from "@/lib/media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
const chain = () => HYPR_NETWORKS[getHyprNetwork()].id;
export async function GET(request: NextRequest) {
  const roomId = request.nextUrl.searchParams.get("roomId") || "";
  if (!ADDRESS.test(roomId)) return NextResponse.json({ error: "Invalid room." }, { status: 400, headers });
  const client = getSupabaseAdminClient();
  if (!client) return NextResponse.json({ enabled: false, error: "Video storage is not connected." }, { status: 503, headers });
  const session = decodeAuthorization(request.cookies.get(COMMUNITY_SESSION_COOKIE)?.value, requestOrigin(request), "session");
  try {
    const broadcastId = await getLiveCaptureSession(roomNameForLaunch(roomId)).catch(() => null);
    const result = await client.rpc<Record<string, unknown>>("hypr_media", { p_chain_id: chain(), p_token_address: roomId, p_wallet_address: session?.wallet || null, p_action: "list", p_data: { broadcastId } });
    return NextResponse.json({ ...result, wallet: session?.wallet || null, live: Boolean(broadcastId), limits: MEDIA_LIMITS }, { headers });
  } catch { return NextResponse.json({ enabled: false, error: "The video library is temporarily unavailable. No sample recordings are shown." }, { status: 503, headers }); }
}
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Use HYPR to manage recordings." }, { status: 403, headers });
  const session = decodeAuthorization(request.cookies.get(COMMUNITY_SESSION_COOKIE)?.value, requestOrigin(request), "session");
  if (!session) return NextResponse.json({ error: "Sign in with your wallet. Watching replays needs no wallet." }, { status: 401, headers });
  let body: Record<string, unknown>;
  try { if (Number(request.headers.get("content-length") || 0) > 4000) throw new Error(); body = await request.json(); if (!body || Array.isArray(body) || typeof body !== "object") throw new Error(); } catch { return NextResponse.json({ error: "Invalid recording request." }, { status: 400, headers }); }
  const roomId = typeof body.roomId === "string" ? body.roomId : "";
  const action = typeof body.action === "string" ? body.action : "";
  if (!ADDRESS.test(roomId) || !["policy", "reserve", "upload", "complete", "publish", "hide"].includes(action)) return NextResponse.json({ error: "Invalid recording action." }, { status: 400, headers });
  const data: Record<string, unknown> = {};
  if (["upload", "complete", "publish", "hide"].includes(action)) {
    if (typeof body.id !== "string" || !UUID.test(body.id)) return NextResponse.json({ error: "Invalid recording ID." }, { status: 400, headers });
    data.id = body.id;
  }
  if (action === "reserve") {
    if ((body.kind !== "replay" && body.kind !== "clip") || !mediaMime(body.mime) || typeof body.title !== "string" || !body.title.trim() || body.title.trim().length > 80 || body.consent !== true) return NextResponse.json({ error: "Choose a title and explicitly consent to recording." }, { status: 400, headers });
    Object.assign(data, { kind: body.kind, mime: mediaMime(body.mime), title: body.title.trim(), consent: true });
  }
  if (action === "complete") {
    if (typeof body.durationSeconds !== "number" || !Number.isFinite(body.durationSeconds) || body.durationSeconds < 0.2 || body.durationSeconds > 601) return NextResponse.json({ error: "Invalid recording duration." }, { status: 400, headers });
    data.durationSeconds = body.durationSeconds;
  }
  if (action === "policy") {
    if (typeof body.allowClips !== "boolean") return NextResponse.json({ error: "Choose whether viewers may clip this broadcast." }, { status: 400, headers });
    data.allowClips = body.allowClips;
  }
  const client = getSupabaseAdminClient();
  if (!client) return NextResponse.json({ error: "Video storage is unavailable." }, { status: 503, headers });
  const args = { p_chain_id: session.chainId, p_token_address: roomId, p_wallet_address: session.wallet };
  try {
    if (action === "reserve" || action === "policy" && body.allowClips === true) {
      data.broadcastId = await getLiveCaptureSession(roomNameForLaunch(roomId));
      if (!data.broadcastId) return NextResponse.json({ error: "The creator must be live with published media before recording or enabling clips." }, { status: 409, headers });
    }
    if (action === "complete") {
      const asset = await client.rpc<StoredMedia>("hypr_media", { ...args, p_action: "upload", p_data: data });
      await verifyMediaHeader(asset);
    }
    const result = await client.rpc<StoredMedia>("hypr_media", { ...args, p_action: action, p_data: data });
    if (action === "reserve" || action === "upload") {
      if (result.ready) return NextResponse.json({ id: result.id, ready: true }, { headers });
      const uploadUrl = await createMediaUpload(result);
      return NextResponse.json({ id: result.id, kind: result.kind, title: result.title, mime: result.mime, uploaded: result.uploaded, uploadUrl }, { headers });
    }
    return NextResponse.json({ saved: true }, { headers });
  } catch { return NextResponse.json({ error: "Recording action was not completed. Check creator permission, the daily limit (6 per wallet / 16 per room), and available pilot storage (256 MB). Your live broadcast is unchanged." }, { status: 409, headers }); }
}
