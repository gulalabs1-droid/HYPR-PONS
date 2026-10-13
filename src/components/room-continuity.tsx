"use client";

import React from "react";

export function RoomContinuity({ onOpenChat, onShareRoom }: { onOpenChat?: () => void; onShareRoom?: () => void }) {
  return <div className="room-continuity" aria-label="What stays after a broadcast">
    <div><strong>Persistent room · live-only video</strong><p>Your room link, saved chat, follows and token stay after a broadcast. Video replays are not saved by HYPR.</p></div>
    {(onOpenChat || onShareRoom) && <div className="room-continuity-actions">{onOpenChat && <button type="button" className="secondary-button" onClick={onOpenChat}>Open room chat</button>}{onShareRoom && <button type="button" className="claim-link" onClick={onShareRoom}>Share room ↗</button>}</div>}
  </div>;
}
