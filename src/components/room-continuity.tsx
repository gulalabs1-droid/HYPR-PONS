"use client";

import React from "react";

export function RoomContinuity({ onOpenChat }: { onOpenChat?: () => void }) {
  return <div className="room-continuity" aria-label="What stays after a broadcast">
    <div><strong>This room stays open</strong><p>Chat and follows stay. Replays appear when published.</p></div>
    {onOpenChat && <button type="button" className="secondary-button" aria-label="Open room chat" onClick={onOpenChat}>Open chat</button>}
  </div>;
}
