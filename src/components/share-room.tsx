"use client";
import React, { useEffect, useRef, useState } from "react";
import { ANALYTICS_PREFERENCE_EVENT, analyticsAllowed, pilotEvent } from "@/lib/pilot-analytics";
import { canonicalRoomUrl } from "@/lib/growth";

export function ShareRoom({ roomId, name, moment = false }: { roomId: string; name: string; moment?: boolean }) {
  const [notice, setNotice] = useState(""), [busy, setBusy] = useState(false);
  const pendingShare = useRef<string>();
  useEffect(() => {
    let active = true;
    async function prepare() {
      pendingShare.current = undefined;
      if (!analyticsAllowed()) return;
      try { const response = await fetch("/api/community/analytics", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "prepare-share", roomId }) }); const data = await response.json(); if (active && response.ok && data.shareId) pendingShare.current = data.shareId; } catch { /* sharing never depends on measurement */ }
    }
    void prepare(); window.addEventListener(ANALYTICS_PREFERENCE_EVENT, prepare);
    return () => { active = false; window.removeEventListener(ANALYTICS_PREFERENCE_EVENT, prepare); };
  }, [roomId]);
  async function share(native: boolean) {
    if (busy) return;
    setBusy(true); setNotice("");
    try {
      // Count successful copies/native shares only, never dialog openings/cancellations.
      const canonical = `${canonicalRoomUrl(roomId)}${moment ? "/moment" : ""}`;
      let url = canonical;
      const shareId = analyticsAllowed() ? pendingShare.current || null : null;
      if (shareId) url += `?via=${shareId}`;
      const nativeSupported = native && typeof navigator.share === "function";
      if (nativeSupported) await navigator.share({ title: `${name} on HYPR${moment ? " · Share card (not video)" : ""}`, text: "Watch, chat and return for the next show. No wallet needed to watch.", url });
      else await navigator.clipboard.writeText(url);
      setNotice(nativeSupported ? "Shared." : "Link copied.");
      await pilotEvent("room_shared", roomId, crypto.randomUUID(), shareId);
    } catch (failure) {
      if ((failure as Error)?.name !== "AbortError") setNotice("Copy the permanent room link from your browser’s address bar.");
    } finally { setBusy(false); }
  }
  return <div className="share-controls"><button className="secondary-button" disabled={busy} onClick={() => void share(false)}>Copy {moment ? "card" : "room"} link</button><button className="secondary-button" disabled={busy} onClick={() => void share(true)}>Share ↗</button>{notice && <span role="status">{notice}</span>}</div>;
}
