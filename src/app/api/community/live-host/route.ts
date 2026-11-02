import { NextRequest, NextResponse } from "next/server";
import { COMMUNITY_SESSION_COOKIE, decodeAuthorization, requestOrigin, sameOrigin } from "@/lib/community-auth";
import { isLiveKitConfigured } from "@/lib/livekit";
import { encodeHostCapability, liveHostCookieName } from "@/lib/live-host-auth";
import { createCreatorLiveSession, CreatorLiveError } from "@/lib/live-host-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
const error = (message: string, status: number) => NextResponse.json({ error: message }, { status, headers });

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return error("Use HYPR to start your broadcast.", 403);
  const origin = requestOrigin(request);
  const session = decodeAuthorization(request.cookies.get(COMMUNITY_SESSION_COOKIE)?.value, origin, "session");
  if (!session || session.version !== 2) return error("Sign in with your creator wallet to start a broadcast.", 401);
  if (!isLiveKitConfigured()) return error("Live streaming is temporarily unavailable.", 503);
  let body: { roomId?: unknown };
  try { if (Number(request.headers.get("content-length") || 0) > 1000) throw new Error(); body = await request.json(); if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error(); }
  catch { return error("Invalid live request.", 400); }
  if (typeof body.roomId !== "string" || !/^0x[a-fA-F0-9]{40}$/.test(body.roomId)) return error("A valid HYPR room is required.", 400);
  const roomId = body.roomId.toLowerCase();
  try {
    const { capability, ...access } = await createCreatorLiveSession(roomId, session.wallet, origin);
    const response = NextResponse.json(access, { headers });
    response.cookies.set(liveHostCookieName(roomId), encodeHostCapability(capability), { httpOnly: true, secure: new URL(request.url).protocol === "https:", sameSite: "strict", path: "/api/live", maxAge: 12 * 60 * 60 });
    return response;
  } catch (failure) { if (failure instanceof CreatorLiveError) return error(failure.message, failure.status); return error("Could not verify this room. Try again.", 503); }
}
