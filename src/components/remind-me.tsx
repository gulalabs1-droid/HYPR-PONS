"use client";
import React, { useEffect, useState } from "react";
import { PUSH_ROOMS_EVENT, pushRooms, pushSupport, setRoomAlerts, type PushSupport } from "@/lib/push-client";
import { FOLLOWED_ROOM_EVENT } from "./follow-button";
import { countOnce } from "@/lib/counts";

/** "Notify me" for one room: live alerts and show reminders, with honest fallbacks. */
export function RemindMe({ roomId, calendarHref }: { roomId: string; calendarHref?: string }) {
  const [on, setOn] = useState(false);
  const [support, setSupport] = useState<PushSupport>("unsupported");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    const refresh = () => setOn(pushRooms().includes(roomId.toLowerCase()));
    setSupport(pushSupport()); refresh();
    // A new follower is the best moment to offer alerts.
    const followed = (event: Event) => { if ((event as CustomEvent<{ roomId?: string }>).detail?.roomId === roomId.toLowerCase() && !pushRooms().includes(roomId.toLowerCase()) && pushSupport() === "supported") setNotice("Want a heads-up when they go live? Tap Notify me."); };
    window.addEventListener(PUSH_ROOMS_EVENT, refresh); window.addEventListener(FOLLOWED_ROOM_EVENT, followed);
    return () => { window.removeEventListener(PUSH_ROOMS_EVENT, refresh); window.removeEventListener(FOLLOWED_ROOM_EVENT, followed); };
  }, [roomId]);

  async function toggle() {
    if (busy) return;
    if (support === "needs-install") { setNotice("On iPhone, tap Share → Add to Home Screen, then open HYPR from there to turn on alerts."); return; }
    if (support === "blocked") { setNotice("Notifications are blocked for this site. Allow them in your browser settings."); return; }
    if (support === "unsupported") { setNotice(calendarHref ? "This browser can’t show alerts. Add the next show to your calendar instead." : "This browser can’t show alerts. Follow the room to find it in Following."); return; }
    setBusy(true); setNotice("");
    try { const next = await setRoomAlerts(roomId, !on); setOn(next); if (next) countOnce("alert_on", roomId); setNotice(next ? "You’ll get an alert when they go live or a show is about to start." : "Alerts off for this room."); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Alerts couldn’t be changed."); setSupport(pushSupport()); }
    finally { setBusy(false); }
  }

  return <div className="remind-me">
    <button type="button" className={`secondary-button${on ? " is-on" : ""}`} aria-pressed={on} disabled={busy} onClick={() => void toggle()}>{on ? "🔔 Alerts on" : "🔔 Notify me"}</button>
    {notice && <span role="status">{notice}{calendarHref && support !== "supported" && <> <a href={calendarHref}>Add to calendar ↓</a></>}</span>}
  </div>;
}
