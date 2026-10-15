import { NextRequest } from "next/server";
import { ADDRESS, UUID, calendarText, canonicalRoomUrl } from "@/lib/growth";
import { readGrowth } from "@/lib/growth-server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const roomId = request.nextUrl.searchParams.get("roomId") || "", showId = request.nextUrl.searchParams.get("showId") || "";
  if (!ADDRESS.test(roomId) || !UUID.test(showId)) return new Response("Invalid show", { status: 400 });
  try {
    const show = (await readGrowth(null, roomId))[0]?.show;
    if (!show || show.id !== showId) return new Response("Show unavailable or canceled", { status: 404 });
    return new Response(calendarText(show, canonicalRoomUrl(roomId)), { headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": 'attachment; filename="hypr-show.ics"', "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  } catch { return new Response("Schedule temporarily unavailable", { status: 503 }); }
}
