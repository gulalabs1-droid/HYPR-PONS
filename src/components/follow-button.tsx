"use client";
import React, { useEffect, useState } from "react";
import { SAVED_ROOMS_EVENT, savedRooms, saveRoomOnDevice } from "@/lib/saved-rooms";
import { COMMUNITY_UPDATED_EVENT } from "@/lib/growth";
import { countOnce } from "@/lib/counts";
import type { useGrowth } from "@/lib/use-growth";

export const FOLLOWED_ROOM_EVENT = "hypr-followed-room";

/**
 * One Follow control. It always works instantly on this device, needs no
 * wallet, and also updates the signed-in account's follows when a HYPR
 * session already exists. It never opens a wallet prompt by itself.
 */
export function FollowButton({ roomId, growth, className = "" }: { roomId: string; growth?: ReturnType<typeof useGrowth> | null; className?: string }) {
  const [deviceSaved, setDeviceSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const room = growth?.state?.rooms.find(item => item.address.toLowerCase() === roomId.toLowerCase());
  const signedIn = Boolean(growth?.state?.wallet) && growth?.state?.enabled !== false;
  const following = deviceSaved || Boolean(room?.following);

  useEffect(() => {
    const refresh = () => setDeviceSaved(savedRooms().includes(roomId.toLowerCase()));
    refresh();
    window.addEventListener(SAVED_ROOMS_EVENT, refresh); window.addEventListener("storage", refresh);
    return () => { window.removeEventListener(SAVED_ROOMS_EVENT, refresh); window.removeEventListener("storage", refresh); };
  }, [roomId]);
  // Confirmation is a brief toast, not text that lingers beside the button and reads like a second state.
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  async function toggle() {
    if (busy) return;
    const next = !following;
    setBusy(true); setNotice("");
    try {
      saveRoomOnDevice(roomId, next);
      let accountSynced = Boolean(signedIn && room && room.following === next);
      if (signedIn && (!room || room.following !== next)) {
        const response = await fetch("/api/community", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ roomId, action: "follow", following: next }) });
        if (!response.ok) throw new Error("sync");
        accountSynced = true;
        window.dispatchEvent(new Event(COMMUNITY_UPDATED_EVENT));
        growth?.refresh();
      }
      if (next) { countOnce("follow", roomId); window.dispatchEvent(new CustomEvent(FOLLOWED_ROOM_EVENT, { detail: { roomId: roomId.toLowerCase() } })); }
      setNotice(next ? accountSynced ? "Following on all your devices." : "Following. Find it in Following—sign in anytime to sync devices." : "Unfollowed. You can follow again anytime.");
    } catch (failure) {
      setNotice(failure instanceof Error && failure.message === "sync" ? "Saved on this device. Syncing to your account failed; it will retry when you sign in again." : "This browser can’t save follows. Bookmark the room link instead.");
    } finally { setBusy(false); }
  }

  return <div className="follow-control">
    <button type="button" className={`${following ? "secondary-button is-following" : "primary-button"} ${className}`.trim()} aria-pressed={following} disabled={busy} onClick={() => void toggle()}>{following ? "✓ Following" : "+ Follow"}</button>
    <span className="follow-toast" role="status" data-shown={Boolean(notice)}>{notice}</span>
  </div>;
}
