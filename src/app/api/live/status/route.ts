import { NextResponse } from "next/server";
import { getPublicLiveRoomStatus, PUBLIC_STATUS_CACHE_CONTROL, roomNameForLaunch } from "@/lib/livekit";
import { announceLiveLater } from "@/lib/live-announce";
import { recordPeak } from "@/lib/counts-server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const roomId = new URL(request.url).searchParams.get("roomId") || "";
  if (!/^0x[a-fA-F0-9]{40}$/.test(roomId)) return NextResponse.json({ error: "A valid HYPR room address is required." }, { status: 400 });
  try {
    const { broadcastRef, ...status } = await getPublicLiveRoomStatus(roomNameForLaunch(roomId));
    // Backstop for the LiveKit webhook: the creator's own studio polls this while live.
    if (status.live && broadcastRef) { announceLiveLater(roomId, broadcastRef); recordPeak(roomId, broadcastRef, status.viewerCount); }
    return NextResponse.json(status, { headers: { "Cache-Control": PUBLIC_STATUS_CACHE_CONTROL } });
  }
  catch { return NextResponse.json({ configured: true, live: false, error: "Live status is temporarily unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } }); }
}
