"use client";

import { useEffect, useState } from "react";
import type { Launch } from "./types";
import type { CombinedLaunchDataSource } from "./launch-data";

export function useLiveLaunches(initial: Launch[], initialSource?: CombinedLaunchDataSource) {
  const [launches, setLaunches] = useState(initial);
  const [source, setSource] = useState(initialSource);
  const [updatedAt, setUpdatedAt] = useState<string>();
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    let pending = false;
    let request: AbortController | undefined;
    async function refresh() {
      if (pending || document.visibilityState === "hidden") return;
      pending = true;
      request = new AbortController();
      const timeout = window.setTimeout(() => request?.abort(), 20000);
      try {
        const response = await fetch("/api/launches", { cache: "no-store", signal: request.signal });
        const data = await response.json() as { launches: Launch[]; source: CombinedLaunchDataSource; checkedAt: string };
        if (!response.ok || !Array.isArray(data.launches) || typeof data.source !== "string" || typeof data.checkedAt !== "string") throw new Error("Live data is temporarily unavailable.");
        if (active) { setLaunches(data.launches); setSource(data.source); setUpdatedAt(data.checkedAt); setError(data.source.endsWith("error") ? "Chain reads are unavailable. No substitute data is shown." : ""); }
      } catch {
        if (active) { setError("Connection interrupted. Displayed chain values are the last successful snapshot."); setLaunches((current) => current.map((launch) => ({ ...launch, broadcastStatus: "unavailable", viewerCount: undefined }))); }
      } finally { pending = false; window.clearTimeout(timeout); }
    }
    void refresh();
    const timer = window.setInterval(() => void refresh(), 15000);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => { active = false; request?.abort(); window.clearInterval(timer); document.removeEventListener("visibilitychange", refresh); window.removeEventListener("focus", refresh); };
  }, []);
  return { launches, source: source || initialSource, updatedAt, error };
}
