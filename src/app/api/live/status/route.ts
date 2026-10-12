import { NextResponse } from "next/server";
import { getLiveRoomStatus, roomNameForLaunch } from "@/lib/livekit";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const roomId = new URL(request.url).searchParams.get("roomId") || "";
  if (!/^0x[a-fA-F0-9]{40}$/.test(roomId)) return NextResponse.json({ error: "A valid HYPR room address is required." }, { status: 400 });
  try { return NextResponse.json(await getLiveRoomStatus(roomNameForLaunch(roomId)), { headers: { "Cache-Control": "no-store" } }); }
  catch { return NextResponse.json({ configured: true, live: false, viewerCount: 0, error: "Live status is temporarily unavailable." }, { status: 503 }); }
}
