"use client";
export const ANALYTICS_PREFERENCE_EVENT = "hypr-analytics-preference";
const preferenceKey = "hypr-pilot-analytics";
export const CLIENT_EVENTS = ["room_viewed", "stream_playback_started", "stream_watch_threshold_reached", "room_shared", "share_link_opened"] as const;
export type ClientEvent = typeof CLIENT_EVENTS[number];
export function analyticsAllowed() {
  if (typeof window === "undefined") return false;
  if (navigator.doNotTrack === "1" || (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl) return false;
  try { return window.localStorage.getItem(preferenceKey) === "yes"; } catch { return false; }
}
export async function setAnalyticsPreference(allowed: boolean) {
  if (allowed && (navigator.doNotTrack === "1" || (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl)) return "Your browser privacy setting keeps optional measurement off.";
  try { window.localStorage.setItem(preferenceKey, "no"); } catch { return "This browser cannot save a privacy choice; optional measurement stays off."; }
  const response = await fetch("/api/community/analytics", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: allowed ? "consent" : "withdraw" }) }).catch(() => null);
  let accepted = false;
  try { accepted = Boolean(response?.ok && (await response.json()).tracking === allowed); } catch { /* malformed response is not consent */ }
  if (allowed && accepted) {
    try { window.localStorage.setItem(preferenceKey, "yes"); } catch { return "This browser cannot save a privacy choice; measurement stays off."; }
  }
  window.dispatchEvent(new Event(ANALYTICS_PREFERENCE_EVENT));
  return accepted ? null : "The service could not finish this request. Optional tracking stays off locally; retry stored-data removal when connected.";
}
export function shareAttribution() {
  if (typeof window === "undefined") return null;
  const value = new URL(window.location.href).searchParams.get("via");
  return value && /^[a-f0-9-]{36}$/i.test(value) ? value : null;
}
export async function pilotEvent(event: ClientEvent, roomId: string, id = crypto.randomUUID(), attribution = shareAttribution()) {
  if (!analyticsAllowed()) return null;
  try {
    const response = await fetch("/api/community/analytics", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "event", event, roomId, id, shareId: attribution }) });
    return response.ok ? await response.json() as { shareId?: string } : null;
  } catch { return null; }
}
