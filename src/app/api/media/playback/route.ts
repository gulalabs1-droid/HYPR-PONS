import { NextRequest, NextResponse } from "next/server";
import { COMMUNITY_SESSION_COOKIE, decodeAuthorization, requestOrigin } from "@/lib/community-auth";
import { ADDRESS, UUID } from "@/lib/growth";
import { HYPR_NETWORKS, getHyprNetwork } from "@/lib/integrations/hypr/constants";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { createMediaPlayback, type StoredMedia } from "@/lib/media-server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const headers = { "Cache-Control": "no-store" };
  const roomId = request.nextUrl.searchParams.get("roomId") || "", id = request.nextUrl.searchParams.get("id") || "";
  if (!ADDRESS.test(roomId) || !UUID.test(id)) return NextResponse.json({ error: "Invalid recording." }, { status: 400, headers });
  const client = getSupabaseAdminClient();
  if (!client) return NextResponse.json({ error: "Video storage is unavailable." }, { status: 503, headers });
  const session = decodeAuthorization(request.cookies.get(COMMUNITY_SESSION_COOKIE)?.value, requestOrigin(request), "session");
  try {
    const asset = await client.rpc<StoredMedia>("hypr_media", { p_chain_id: HYPR_NETWORKS[getHyprNetwork()].id, p_token_address: roomId, p_wallet_address: session?.wallet || null, p_action: "asset", p_data: { id } });
    const url = await createMediaPlayback(asset);
    return NextResponse.json({ id: asset.id, kind: asset.kind, title: asset.title, mime: asset.mime, durationSeconds: asset.durationSeconds, published: asset.published, url }, { headers });
  } catch { return NextResponse.json({ error: "This recording is private, hidden, or unavailable." }, { status: 404, headers }); }
}
