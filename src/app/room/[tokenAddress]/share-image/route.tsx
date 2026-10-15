import { ImageResponse } from "next/og";
import { findRoomLaunch } from "@/lib/page-data";
import { ADDRESS, showPhase } from "@/lib/growth";
import { readGrowth } from "@/lib/growth-server";
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
  const live = token.broadcastStatus === "live";
  const phase = showPhase(room?.show || null, live);
  const status = live ? "LIVE NOW · WATCH FREE" : phase === "upcoming" && room?.show ? `NEXT SHOW · ${new Date(room.show.startsAt).toISOString().slice(0, 16).replace("T", " ")} UTC` : "A CREATOR’S PERMANENT ROOM";
  return new ImageResponse(
    <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", background: "#0b0d10", padding: 68, color: "#f1f2f4", fontFamily: "sans-serif", justifyContent: "space-between", borderLeft: live ? "12px solid #ff4d6d" : "12px solid #c7f36b" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ color: "#c7f36b", fontSize: 36, fontWeight: 800 }}>HYPR</span>
        <span style={{ fontSize: 22, color: live ? "#ff4d6d" : "#b5bac4" }}>{moment ? "MOMENT SHARE CARD · NOT VIDEO" : status}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <span style={{ fontSize: moment ? 34 : 66, fontWeight: 800 }}>{name.slice(0, 60)}</span>
        <span style={{ fontSize: moment ? 58 : 30, color: moment ? "#c7f36b" : "#bdc3cd" }}>{moment ? room!.moment!.slice(0, 100) : (live ? "The creator is live. Watching needs no wallet." : room?.show && phase === "upcoming" ? room.show.title.slice(0, 100) : (room?.bio || "Watch live. Join the conversation. Come back for the next show.")).slice(0, 150)}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, fontSize: 23 }}>
        <span>Watching needs no wallet · Trading is optional</span>
        <span style={{ color: "#aab0ba" }}>hypr-pons.vercel.app · Testnet preview · No replay implied</span>
      </div>
    </div>,
    { width: 1200, height: 630, headers: { "Cache-Control": live || moment ? "no-store" : "public, max-age=60" } },
  );
}
