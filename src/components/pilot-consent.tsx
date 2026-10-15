"use client";
import { useEffect, useRef, useState } from "react";
import { ANALYTICS_PREFERENCE_EVENT, analyticsAllowed, pilotEvent, setAnalyticsPreference, shareAttribution } from "@/lib/pilot-analytics";
export function PilotConsent({ roomId }: { roomId: string }) {
  const [allowed, setAllowed] = useState(false), [busy, setBusy] = useState(false), [notice, setNotice] = useState("");
  const viewed = useRef(false);
  useEffect(() => {
    async function measure() {
      setAllowed(analyticsAllowed());
      if (!analyticsAllowed() || viewed.current || document.visibilityState === "hidden") return;
      const consent = await fetch("/api/community/analytics", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "consent" }) }).catch(() => null);
      if (!consent?.ok || !analyticsAllowed()) return;
      viewed.current = true; await pilotEvent("room_viewed", roomId);
      if (shareAttribution()) await pilotEvent("share_link_opened", roomId);
    }
    void measure();
    window.addEventListener(ANALYTICS_PREFERENCE_EVENT, measure); document.addEventListener("visibilitychange", measure);
    return () => { window.removeEventListener(ANALYTICS_PREFERENCE_EVENT, measure); document.removeEventListener("visibilitychange", measure); };
  }, [roomId]);
  return <details className="pilot-consent"><summary>Privacy & optional pilot measurement</summary><p>Help us understand whether viewers return. Off by default. If enabled, pilot measurement stores a random browser identifier and room/share/watch events—not your IP address, wallet, signatures or recordings. Reports use a rolling 30-day window; older events are removed in batches when activity resumes, so physical cleanup may be delayed. This covers only consenting browsers, not all viewers. Browser Do Not Track and Global Privacy Control override this choice.</p><p>Turning this off requests removal of this browser’s stored pilot events and attribution links; it does not delete saved chat or follows. Hosting providers may maintain separate operational logs.</p><button className="secondary-button" disabled={busy} onClick={async () => { setBusy(true); const error = await setAnalyticsPreference(!allowed); setAllowed(analyticsAllowed()); setNotice(error || (allowed ? "Optional tracking disabled and this browser’s pilot events removed." : "Optional measurement enabled for this browser.")); setBusy(false); }}>{allowed ? "Turn off & remove pilot events" : "Allow optional pilot measurement"}</button>{!allowed && <button className="claim-link" disabled={busy} onClick={async () => { const error = await setAnalyticsPreference(false); setNotice(error || "This browser’s stored pilot events removed."); }}>Retry stored-data removal</button>}{notice && <p role="status">{notice}</p>}</details>;
}
