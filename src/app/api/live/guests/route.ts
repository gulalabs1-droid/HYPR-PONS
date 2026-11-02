import { NextRequest, NextResponse } from "next/server";
import { requestOrigin, sameOrigin } from "@/lib/community-auth";
import { decodeHostCapability, liveHostCookieName } from "@/lib/live-host-auth";
import { getRoomService, isLiveKitConfigured, roomNameForLaunch } from "@/lib/livekit";
import { GuestActionError, performGuestAction, type GuestInput, type GuestService } from "@/lib/live-guests-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
const reply = (error: string, status: number) => NextResponse.json({ error }, { status, headers });

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return reply("Use your HYPR studio to manage guests.", 403);
  if (!isLiveKitConfigured()) return reply("Guest controls are temporarily unavailable.", 503);
  let body: Record<string, unknown>;
  try { const text = await request.text(); if (text.length > 3000) return reply("Request too large.", 413); body = JSON.parse(text); if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("invalid"); }
  catch { return reply("Invalid request.", 400); }
  if (typeof body.roomId !== "string" || !/^0x[a-fA-F0-9]{40}$/.test(body.roomId) || typeof body.action !== "string" || !["approve", "decline", "revoke", "close"].includes(body.action)) return reply("Invalid guest request.", 400);
  const cookieName = liveHostCookieName(body.roomId);
  const host = decodeHostCapability(request.cookies.get(cookieName)?.value, requestOrigin(request));
  if (!host || body.roomId.toLowerCase() !== host.roomId) return reply("Creator authorization expired. Reopen the studio.", 401);
  try {
    const result = await performGuestAction(getRoomService() as unknown as GuestService, roomNameForLaunch(body.roomId), body as unknown as GuestInput, { host });
    const response = NextResponse.json(result, { headers });
    if (body.action === "close") response.cookies.set(cookieName, "", { httpOnly: true, secure: new URL(request.url).protocol === "https:", sameSite: "strict", path: "/api/live", maxAge: 0 });
    return response;
  } catch (error) {
    if (error instanceof GuestActionError) return reply(error.message, error.status);
    return reply("Guest controls are temporarily unavailable. Please try again.", 503);
  }
}
