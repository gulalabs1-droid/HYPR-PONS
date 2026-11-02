import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { COMMUNITY_SESSION_COOKIE, decodeAuthorization, requestOrigin, sameOrigin } from "@/lib/community-auth";
import { getCombinedLaunchData } from "@/lib/launch-data";
import { createLiveKitToken, getLiveKitClientUrl, getLiveRoomStatus, getRoomService, isLiveKitConfigured, roomNameForLaunch } from "@/lib/livekit";
import { GuestActionError, performGuestAction, type GuestInput, type GuestService } from "@/lib/live-guests-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
const reply = (error: string, status: number) => NextResponse.json({ error }, { status, headers });

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return reply("Use HYPR to join this broadcast.", 403);
  const session = decodeAuthorization(request.cookies.get(COMMUNITY_SESSION_COOKIE)?.value, requestOrigin(request), "session");
  if (!session) return reply("Sign in to request a spot on stage.", 401);
  if (!isLiveKitConfigured()) return reply("Live guests are temporarily unavailable.", 503);
  let body: Record<string, unknown>;
  try { const text = await request.text(); if (text.length > 3000) return reply("Request too large.", 413); body = JSON.parse(text); if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("invalid"); }
  catch { return reply("Invalid request.", 400); }
  if (typeof body.roomId !== "string" || !/^0x[a-fA-F0-9]{40}$/.test(body.roomId) || typeof body.action !== "string" || !["viewer-token", "request", "cancel", "leave"].includes(body.action)) return reply("Invalid guest request.", 400);
  const roomId = body.roomId.toLowerCase(), roomName = roomNameForLaunch(roomId);
  try {
    if (body.action === "viewer-token") {
      const launch = (await getCombinedLaunchData()).launches.find(item => item.address.toLowerCase() === roomId);
      if (!launch || launch.origin !== "hypr" || launch.dataStatus === "demo") return reply("This native room is not available.", 404);
      if (!(await getLiveRoomStatus(roomName)).live) return reply("The creator is currently offline.", 409);
      const token = await createLiveKitToken({ roomName, identity: `guest-${randomUUID()}`, name: `${session.wallet.slice(0, 6)}…${session.wallet.slice(-4)}`, role: "viewer", launchAddress: roomId, wallet: session.wallet });
      return NextResponse.json({ token, serverUrl: getLiveKitClientUrl(), roomName, role: "viewer", authenticated: true }, { headers });
    }
    const result = await performGuestAction(getRoomService() as unknown as GuestService, roomName, body as unknown as GuestInput, { wallet: session.wallet });
    return NextResponse.json(result, { headers });
  } catch (error) {
    if (error instanceof GuestActionError) return reply(error.message, error.status);
    return reply("Guest requests are temporarily unavailable. Please try again.", 503);
  }
}
