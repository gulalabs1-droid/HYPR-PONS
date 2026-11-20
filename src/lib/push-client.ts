"use client";

const KEY = "hypr-push-rooms-v1";
export const PUSH_ROOMS_EVENT = "hypr-push-rooms";

export function pushRooms(): string[] {
  try { const parsed: unknown = JSON.parse(window.localStorage.getItem(KEY) || "[]"); return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : []; } catch { return []; }
}
function rememberPushRoom(roomId: string, on: boolean) {
  try {
    const rest = pushRooms().filter(item => item !== roomId.toLowerCase());
    window.localStorage.setItem(KEY, JSON.stringify(on ? [roomId.toLowerCase(), ...rest].slice(0, 100) : rest));
    window.dispatchEvent(new Event(PUSH_ROOMS_EVENT));
  } catch { /* the server copy is authoritative */ }
}

export type PushSupport = "supported" | "unsupported" | "needs-install" | "blocked";

export function pushSupport(): PushSupport {
  if (typeof window === "undefined") return "unsupported";
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const standalone = window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return ios && !standalone ? "needs-install" : "unsupported";
  if (Notification.permission === "denied") return "blocked";
  return "supported";
}

function keyBytes(base64: string) {
  const padded = (base64 + "=".repeat((4 - base64.length % 4) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(padded), char => char.charCodeAt(0));
}

/** Ask permission (only after a tap), subscribe this browser, and follow the room for alerts. */
export async function setRoomAlerts(roomId: string, on: boolean) {
  const config = await fetch("/api/push", { cache: "no-store" }).then(response => response.json()) as { enabled?: boolean; publicKey?: string | null };
  if (!config.enabled || !config.publicKey) throw new Error("Notifications aren’t switched on for HYPR yet.");
  if (on && Notification.permission !== "granted" && await Notification.requestPermission() !== "granted") throw new Error("Notifications are blocked. Allow them in your browser settings to get alerts.");
  const registration = await navigator.serviceWorker.getRegistration("/") || await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription() || (on ? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(config.publicKey) }) : null);
  if (!subscription) { rememberPushRoom(roomId, false); return false; }
  const response = await fetch("/api/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ roomId, follow: on, subscription: subscription.toJSON() }) });
  const data = await response.json() as { error?: string };
  if (!response.ok) throw new Error(data.error || "Notifications couldn’t be saved.");
  rememberPushRoom(roomId, on);
  return on;
}
