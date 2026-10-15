"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Launch } from "@/lib/types";
import { useGrowth } from "@/lib/use-growth";
import { SAVED_ROOMS_EVENT, savedRooms } from "@/lib/saved-rooms";
import { TokenArt, tokenGlyph } from "./token-art";

const PREF_KEY = "hypr-live-alerts-v1";
const NOTIFIED_KEY = "hypr-live-alerts-notified-v1";
const DISMISSED_KEY = "hypr-live-alerts-dismissed-v1";
const PREF_EVENT = "hypr-live-alerts-pref";
const RENOTIFY_MS = 3 * 60 * 60 * 1000;

type LiveRoom = { address: string; name: string; seed: string; glyph: string; viewers?: number };

export function liveAlertsSupported() { return typeof window !== "undefined" && "Notification" in window; }
export function liveAlertsOn() {
  if (!liveAlertsSupported()) return false;
  try { return window.localStorage.getItem(PREF_KEY) === "on" && Notification.permission === "granted"; } catch { return false; }
}

function readJson<T>(storage: Storage, key: string, fallback: T): T {
  try { const value = storage.getItem(key); return value ? JSON.parse(value) as T : fallback; } catch { return fallback; }
}

async function notify(room: LiveRoom) {
  const options = { body: "Live now on HYPR. Tap to watch—no wallet needed.", icon: "/icons/hypr-192.png", badge: "/icons/hypr-192.png", tag: `live-${room.address}`, data: { url: `/room/${room.address}` } };
  const title = `${room.name} is live`;
  try {
    const registration = "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
    if (registration) { await registration.showNotification(title, options); return; }
    const fallback = new Notification(title, options);
    fallback.onclick = () => { window.focus(); window.location.href = `/room/${room.address}`; };
  } catch { /* notification blocked by the OS; the banner still shows */ }
}

function useWatchedLiveRooms() {
  const growth = useGrowth();
  const [saved, setSaved] = useState<string[]>([]);
  const [launches, setLaunches] = useState<Launch[]>([]);
  const [alertsOn, setAlertsOn] = useState(false);
  useEffect(() => {
    const update = () => setSaved(savedRooms());
    const pref = () => setAlertsOn(liveAlertsOn());
    update(); pref();
    window.addEventListener(SAVED_ROOMS_EVENT, update); window.addEventListener("storage", update); window.addEventListener(PREF_EVENT, pref);
    return () => { window.removeEventListener(SAVED_ROOMS_EVENT, update); window.removeEventListener("storage", update); window.removeEventListener(PREF_EVENT, pref); };
  }, []);
  const followed = useMemo(() => (growth.state?.rooms || []).filter(room => room.following), [growth.state]);
  const watched = useMemo(() => new Set([...saved, ...followed.map(room => room.address.toLowerCase())]), [saved, followed]);
  const hasWatched = watched.size > 0;
  useEffect(() => {
    if (!hasWatched) return;
    let active = true, pending = false;
    async function load() {
      if (pending || (document.visibilityState === "hidden" && !liveAlertsOn())) return;
      pending = true;
      try {
        const response = await fetch("/api/launches", { cache: "no-store", signal: AbortSignal.timeout(15000) });
        const data = await response.json() as { launches?: Launch[] };
        if (active) setLaunches(response.ok && Array.isArray(data.launches) ? data.launches : []);
      } catch { if (active) setLaunches([]); } finally { pending = false; }
    }
    void load();
    const timer = window.setInterval(() => void load(), 45000);
    document.addEventListener("visibilitychange", load);
    return () => { active = false; window.clearInterval(timer); document.removeEventListener("visibilitychange", load); };
  }, [hasWatched]);
  const names = useMemo(() => new Map(followed.map(room => [room.address.toLowerCase(), room.displayName || room.name])), [followed]);
  const live = useMemo<LiveRoom[]>(() => launches.filter(launch => launch.broadcastStatus === "live" && watched.has(launch.address.toLowerCase())).map(launch => ({
    address: launch.address, name: names.get(launch.address.toLowerCase()) || launch.name, seed: launch.address, glyph: tokenGlyph(launch.logo, launch.symbol), viewers: launch.viewerCount,
  })), [launches, watched, names]);
  return { live, alertsOn };
}

export function LiveAlerts() {
  const pathname = usePathname() || "";
  const { live, alertsOn } = useWatchedLiveRooms();
  const [dismissed, setDismissed] = useState<string[]>([]);
  const first = useRef(true);
  useEffect(() => { setDismissed(readJson<string[]>(window.sessionStorage, DISMISSED_KEY, [])); }, []);
  useEffect(() => {
    if (!alertsOn || !live.length) return;
    const notified = readJson<Record<string, number>>(window.localStorage, NOTIFIED_KEY, {});
    const now = Date.now();
    const fresh = live.filter(room => now - (notified[room.address.toLowerCase()] || 0) > RENOTIFY_MS && !pathname.toLowerCase().includes(room.address.toLowerCase()));
    if (!fresh.length) return;
    // Notify only when the tab isn't in view; the banner covers the visible case.
    if (document.visibilityState === "hidden" || !first.current) fresh.forEach(room => void notify(room));
    first.current = false;
    for (const room of fresh) notified[room.address.toLowerCase()] = now;
    try { window.localStorage.setItem(NOTIFIED_KEY, JSON.stringify(notified)); } catch { /* storage full */ }
  }, [alertsOn, live, pathname]);
  const visible = live.filter(room => !dismissed.includes(room.address.toLowerCase()) && !pathname.toLowerCase().includes(room.address.toLowerCase()));
  if (!visible.length) return null;
  function dismiss() {
    const next = [...new Set([...dismissed, ...visible.map(room => room.address.toLowerCase())])];
    setDismissed(next);
    try { window.sessionStorage.setItem(DISMISSED_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  }
  const lead = visible[0];
  return <div className="live-alerts" role="status" aria-live="polite">
    <span className="live-alerts-avatars" aria-hidden="true">{visible.slice(0, 3).map(room => <span key={room.address}><TokenArt seed={room.seed} glyph={room.glyph} /></span>)}</span>
    <span className="live-alerts-copy"><span className="live-alerts-badge"><span className="pulse" />LIVE</span><strong>{visible.length === 1 ? `${lead.name} is live` : `${lead.name} + ${visible.length - 1} more you follow are live`}</strong>{visible.length === 1 && typeof lead.viewers === "number" && lead.viewers > 0 && <small>{lead.viewers} watching</small>}</span>
    <Link className="live-alerts-join" href={visible.length === 1 ? `/room/${lead.address}` : "/discover?view=live"}>{visible.length === 1 ? "Watch now" : "See who’s live"} →</Link>
    <button type="button" className="live-alerts-close" aria-label="Dismiss live alert" onClick={dismiss}>×</button>
  </div>;
}

export function LiveAlertsToggle() {
  const [state, setState] = useState<"loading" | "unsupported" | "denied" | "off" | "on">("loading");
  useEffect(() => {
    if (!liveAlertsSupported()) { setState("unsupported"); return; }
    setState(Notification.permission === "denied" ? "denied" : liveAlertsOn() ? "on" : "off");
  }, []);
  async function toggle() {
    if (state === "on") { window.localStorage.setItem(PREF_KEY, "off"); setState("off"); window.dispatchEvent(new Event(PREF_EVENT)); return; }
    const permission = await Notification.requestPermission();
    if (permission !== "granted") { setState(permission === "denied" ? "denied" : "off"); return; }
    window.localStorage.setItem(PREF_KEY, "on"); setState("on"); window.dispatchEvent(new Event(PREF_EVENT));
  }
  if (state === "loading") return null;
  return <div className={`live-alerts-toggle is-${state}`}>
    <button type="button" className={state === "on" ? "secondary-button" : "primary-button"} disabled={state === "unsupported" || state === "denied"} aria-pressed={state === "on"} onClick={() => void toggle()}>
      <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>
      {state === "on" ? "Live alerts on" : "Turn on live alerts"}
    </button>
    <small>{state === "unsupported" ? "This browser can’t show notifications. The live banner still appears while you browse." : state === "denied" ? "Notifications are blocked for HYPR in your browser settings." : "Best-effort alerts for followed or saved rooms while HYPR is open. Installing HYPR does not enable alerts when the app is closed."}</small>
  </div>;
}
