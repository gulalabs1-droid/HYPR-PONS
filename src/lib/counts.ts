"use client";

type ClientCount = "room_view" | "play_start" | "watch_30s" | "follow" | "share" | "alert_on";
// Per page load only: nothing is written to the device.
const counted = new Set<string>();

/** Adds to anonymous daily totals for the room. Never blocks the UI. */
export function countOnce(event: ClientCount, roomId: string) {
  const key = `${event}:${roomId.toLowerCase()}`;
  if (typeof window === "undefined" || counted.has(key)) return;
  counted.add(key);
  try { void fetch("/api/count", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ event, roomId }), keepalive: true }).catch(() => undefined); } catch { /* counts are optional */ }
}
