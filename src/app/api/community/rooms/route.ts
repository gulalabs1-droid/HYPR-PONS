import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { COMMUNITY_SESSION_COOKIE, decodeAuthorization, requestOrigin, sameOrigin } from "@/lib/community-auth";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { checkLaunchName } from "@/lib/launch-naming";
import { revalidateTag } from "next/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };

/** Open a room without a coin: a free wallet sign-in, no transaction, no test ETH. */
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Use HYPR to open a room." }, { status: 403, headers });
  const session = decodeAuthorization(request.cookies.get(COMMUNITY_SESSION_COOKIE)?.value, requestOrigin(request), "session");
  if (!session) return NextResponse.json({ error: "Sign in with your wallet (free, no transaction) to open a room." }, { status: 401, headers });
  let body: { name?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400, headers }); }
  const name = typeof body?.name === "string" ? body.name.trim().replace(/\s+/g, " ") : "";
  if (name.length < 2 || name.length > 60) return NextResponse.json({ error: "Room names are 2–60 characters." }, { status: 400, headers });
  if (checkLaunchName(name, "")?.blocked) return NextResponse.json({ error: "Choose a room name you’d be glad to share publicly." }, { status: 422, headers });
  const client = getSupabaseAdminClient();
  if (!client) return NextResponse.json({ error: "Rooms can’t be created right now." }, { status: 503, headers });
  // A random ID in address format so every existing room feature works; it is not a contract.
  const address = `0x${randomBytes(20).toString("hex")}`;
  try {
    await client.rpc("hypr_create_coinless_room", { p_chain_id: session.chainId, p_wallet_address: session.wallet, p_address: address, p_name: name });
    try { revalidateTag("hypr-combined-launch-data"); } catch { /* the 10-second page cache also expires on its own */ }
    return NextResponse.json({ address, roomUrl: `/room/${address}` }, { headers });
  } catch (error) {
    const reason = (error as { detail?: string })?.detail || "";
    return NextResponse.json({ error: reason.includes("room limit") ? "You can open up to 3 rooms for now." : "Your room couldn’t be created. Try again." }, { status: reason.includes("room limit") ? 409 : 503, headers });
  }
}
