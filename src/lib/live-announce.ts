import { after } from "next/server";
import { notifyRoom, pushConfig } from "./push-server";

/**
 * Tells followers a creator went live. `ref` is the host's LiveKit participant
 * ID, which changes per broadcast, so each broadcast notifies a browser once
 * no matter how many status checks or webhooks observe it.
 */
export async function announceLive(roomId: string, ref: string) {
  if (!pushConfig() || !/^0x[a-fA-F0-9]{40}$/.test(roomId) || !ref) return 0;
  // Loaded lazily: page data uses React's server cache, which webhooks don't need.
  const [{ findRoomLaunch }, { readGrowth }] = await Promise.all([import("./page-data"), import("./growth-server")]);
  const token = (await findRoomLaunch(roomId))?.token;
  if (!token) return 0;
  const profile = await readGrowth(null, roomId).then(rooms => rooms[0]).catch(() => null);
  const name = profile?.displayName || token.name;
  return notifyRoom(roomId, "live", ref, { title: `${name} is live`, body: profile?.show?.title ? `${profile.show.title} · tap to watch. No wallet needed.` : "Tap to watch. No wallet needed.", url: `/room/${roomId}`, tag: `live-${roomId.toLowerCase()}` });
}

/** Run after the response so viewers never wait on notification delivery. */
export function announceLiveLater(roomId: string, ref: string) {
  const task = () => announceLive(roomId, ref).then(() => undefined, () => undefined);
  try { after(task); } catch { void task(); }
}
