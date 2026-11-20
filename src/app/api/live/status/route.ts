import { NextResponse } from "next/server";
import { getPublicLiveRoomStatus, PUBLIC_STATUS_CACHE_CONTROL, roomNameForLaunch } from "@/lib/livekit";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const roomId = new URL(request.url).searchParams.get("roomId") || "";
  if (!/^0x[a-fA-F0-9]{40}$/.test(roomId)) return NextResponse.json({ error: "A valid HYPR room address is required." }, { status: 400 });
  try { return NextResponse.json(await getPublicLiveRoomStatus(roomNameForLaunch(roomId)), { headers: { "Cache-Control": PUBLIC_STATUS_CACHE_CONTROL } }); }
  catch { return NextResponse.json({ configured: true, live: false, error: "Live status is temporarily unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } }); }
}
