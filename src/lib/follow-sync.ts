"use client";
import { savedRooms } from "./saved-rooms";

/** After a wallet sign-in, carry device follows to the account so they appear everywhere. */
export async function syncDeviceFollows(fetcher: typeof fetch = fetch) {
  const rooms = savedRooms().slice(0, 25);
  for (const roomId of rooms) {
    try { await fetcher("/api/community", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ roomId, action: "follow", following: true }) }); }
    catch { /* Best effort: the device copy remains. */ }
  }
  return rooms.length;
}
