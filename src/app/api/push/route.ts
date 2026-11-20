import { NextRequest, NextResponse } from "next/server";
import { sameOrigin } from "@/lib/community-auth";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { getHyprNetwork, HYPR_NETWORKS } from "@/lib/integrations/hypr/constants";
import { pushConfig, validSubscription } from "@/lib/push-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };

/** The public key browsers need to subscribe. Push stays off until VAPID keys are configured. */
export async function GET() {
  const config = pushConfig();
  return NextResponse.json({ enabled: Boolean(config && getSupabaseAdminClient()), publicKey: config?.publicKey || null }, { headers });
}

/** Turn "notify me" on or off for one room. No wallet or sign-in is needed. */
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Use HYPR to change notifications." }, { status: 403, headers });
  let body: { roomId?: unknown; subscription?: unknown; follow?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400, headers }); }
  if (typeof body?.roomId !== "string" || !/^0x[a-fA-F0-9]{40}$/.test(body.roomId) || typeof body.follow !== "boolean" || !validSubscription(body.subscription)) {
    return NextResponse.json({ error: "This browser’s notification details weren’t accepted." }, { status: 400, headers });
  }
  const client = getSupabaseAdminClient();
  if (!pushConfig() || !client) return NextResponse.json({ error: "Notifications aren’t available yet." }, { status: 503, headers });
  try {
    await client.rpc("hypr_push_follow", { p_chain_id: HYPR_NETWORKS[getHyprNetwork()].id, p_token_address: body.roomId, p_endpoint: body.subscription.endpoint, p_p256dh: body.subscription.keys.p256dh, p_auth: body.subscription.keys.auth, p_follow: body.follow });
    return NextResponse.json({ following: body.follow }, { headers });
  } catch { return NextResponse.json({ error: "Notifications couldn’t be saved. Try again." }, { status: 503, headers }); }
}
