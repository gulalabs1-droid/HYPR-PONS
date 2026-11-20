import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { getHyprNetwork, HYPR_NETWORKS } from "@/lib/integrations/hypr/constants";
import { notifyRoom, pushConfig } from "@/lib/push-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || secret.length < 16) return false;
  const supplied = Buffer.from(request.headers.get("authorization") || ""), expected = Buffer.from(`Bearer ${secret}`);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

/** Run every few minutes by a scheduler: sends "starts soon" once per show. */
export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  const client = getSupabaseAdminClient();
  if (!client || !pushConfig()) return NextResponse.json({ shows: 0, sent: 0, configured: false }, { headers });
  try {
    const shows = await client.rpc<Array<{ showId: string; title: string; roomId: string; name: string }>>("hypr_claim_show_reminders", { p_chain_id: HYPR_NETWORKS[getHyprNetwork()].id });
    let sent = 0;
    for (const show of shows) {
      sent += await notifyRoom(show.roomId, "show", show.showId, { title: `${show.name} starts soon`, body: `${show.title} · tap to join the pre-show chat. No wallet needed.`, url: `/room/${show.roomId}`, tag: `show-${show.showId}` }).catch(() => 0);
    }
    return NextResponse.json({ shows: shows.length, sent }, { headers });
  } catch { return NextResponse.json({ error: "Reminders unavailable." }, { status: 503, headers }); }
}
