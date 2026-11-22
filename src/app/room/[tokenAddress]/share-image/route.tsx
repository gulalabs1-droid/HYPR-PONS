import { ImageResponse } from "next/og";
import { findRoomLaunch } from "@/lib/page-data";
import { ADDRESS, showPhase } from "@/lib/growth";
import { readGrowth } from "@/lib/growth-server";
import { getPublicLiveRoomStatus, roomNameForLaunch } from "@/lib/livekit";
import { roomShareCard } from "@/lib/room-share-card";
export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ tokenAddress: string }> }) {
  const { tokenAddress } = await params;
  if (!ADDRESS.test(tokenAddress)) return new Response("Room not found", { status: 404 });
  const token = (await findRoomLaunch(tokenAddress))?.token;
  if (!token) return new Response("Room not found", { status: 404 });
  const moment = new URL(request.url).searchParams.get("moment") === "1";
  const profile = await readGrowth(null, tokenAddress).then(rooms => ({ room: rooms[0], error: false })).catch(() => ({ room: null, error: true }));
  if (moment && profile.error) return new Response("Share card temporarily unavailable", { status: 503, headers: { "Cache-Control": "no-store" } });
  const room = profile.room;
  if (moment && !room?.moment) return new Response("Share card unavailable or removed", { status: 404 });
  const name = room?.displayName || token.name;
  const live = token.origin === "hypr" && await getPublicLiveRoomStatus(roomNameForLaunch(token.address)).then(status => status.live, () => false);
  const phase = showPhase(room?.show || null, live);
  const upcoming = phase === "upcoming" && room?.show ? room.show : null;

  return new ImageResponse(
    roomShareCard({ address: token.address, name, live, upcoming, liveTitle: room?.show?.title, bio: room?.bio, moment: moment ? room!.moment : null }),
    { width: 1200, height: 630, headers: { "Cache-Control": live || moment ? "no-store" : "public, max-age=60" } },
  );
}
