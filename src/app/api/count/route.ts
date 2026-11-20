import { NextResponse } from "next/server";
import { sameOrigin } from "@/lib/community-auth";
import { CLIENT_COUNT_EVENTS, countEvent } from "@/lib/counts-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Anonymous daily totals: no cookie, ID, IP or wallet is read or stored. */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return new Response(null, { status: 403 });
  let body: { roomId?: unknown; event?: unknown };
  try { body = await request.json(); } catch { return new Response(null, { status: 400 }); }
  if (typeof body?.roomId !== "string" || !/^0x[a-fA-F0-9]{40}$/.test(body.roomId) || !CLIENT_COUNT_EVENTS.includes(body.event as typeof CLIENT_COUNT_EVENTS[number])) return new Response(null, { status: 400 });
  countEvent(request, body.roomId, body.event as typeof CLIENT_COUNT_EVENTS[number]);
  return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
