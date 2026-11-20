"use client";
import React, { useEffect, useState } from "react";

export const LOBBY_OPENS_MS = 15 * 60_000;

export function countdownLabel(startsAt: string, now: number) {
  const ms = Date.parse(startsAt) - now;
  if (!Number.isFinite(ms)) return "";
  if (ms <= 0) return "Starting now";
  const minutes = Math.floor(ms / 60_000), hours = Math.floor(minutes / 60), days = Math.floor(hours / 24);
  if (days > 0) return `Starts in ${days}d ${hours % 24}h`;
  if (hours > 0) return `Starts in ${hours}h ${minutes % 60}m`;
  const seconds = Math.floor(ms / 1000) % 60;
  return `Starts in ${minutes}:${String(seconds).padStart(2, "0")}`;
}

/** Ticks every second in the final hour, otherwise every 30 seconds. */
export function useNow(startsAt?: string) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!startsAt) return;
    const near = () => Date.parse(startsAt) - Date.now() < 60 * 60_000;
    let timer = window.setInterval(tick, near() ? 1000 : 30_000);
    function tick() {
      setNow(Date.now());
      const wanted = near() ? 1000 : 30_000;
      window.clearInterval(timer); timer = window.setInterval(tick, wanted);
    }
    return () => window.clearInterval(timer);
  }, [startsAt]);
  return now;
}

export function ShowCountdown({ startsAt }: { startsAt: string }) {
  const now = useNow(startsAt);
  return <span className="show-countdown" suppressHydrationWarning>{countdownLabel(startsAt, now)}</span>;
}
