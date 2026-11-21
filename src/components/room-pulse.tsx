"use client";

import { useEffect, useState } from "react";
import { type Pulse, normalizePulse, pulseIsEmpty, returnRate } from "@/lib/pulse";

function relativeDay(iso: string) {
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  return days <= 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
}

/** Community energy from real, countable signals. Hidden when the data isn't available. */
export function RoomPulse({ roomId }: { roomId: string }) {
  const [pulse, setPulse] = useState<Pulse | null>(null);
  useEffect(() => {
    let active = true;
    fetch(`/api/community/pulse?roomId=${roomId}`).then(response => response.ok ? response.json() : null).then((data: { pulse?: unknown } | null) => { if (active) setPulse(normalizePulse(data?.pulse)); }).catch(() => undefined);
    return () => { active = false; };
  }, [roomId]);
  if (!pulse) return null;
  const rate = returnRate(pulse);
  return <section className="room-pulse activity-panel" aria-labelledby="room-pulse-title">
    <div className="room-pulse-head"><span className="eyebrow">HYPR Pulse</span><h2 id="room-pulse-title">Community energy</h2></div>
    {pulseIsEmpty(pulse) ? <p className="accounting-copy">Pulse fills in as people follow, chat and come back for shows. It starts with the first show.</p> : <dl className="room-pulse-grid">
      <div><dt>Followers</dt><dd>{pulse.followers.toLocaleString()}</dd><small>{pulse.newFollowers30d ? `+${pulse.newFollowers30d.toLocaleString()} this month` : "Signed-in members"}</small></div>
      <div><dt>Regulars</dt><dd>{pulse.regulars30d.toLocaleString()}</dd><small>{rate !== null ? `${rate}% of chatters came back` : "Chatted on 2+ days"}</small></div>
      <div><dt>In the chat</dt><dd>{pulse.chatters30d.toLocaleString()}</dd><small>People, last 30 days</small></div>
      <div><dt>Shows</dt><dd>{pulse.shows30d.toLocaleString()}</dd><small>{pulse.lastShowAt ? `Last one ${relativeDay(pulse.lastShowAt)}` : "Last 30 days"}</small></div>
    </dl>}
    <details className="room-pulse-how"><summary>How Pulse is counted</summary><p>Only real community activity counts: signed-in followers, people who chat (removed messages and the creator don’t count) and broadcasts in the last 30 days. Regulars chatted on at least two different days. Coin price, trading and holdings are never part of Pulse, and it doesn’t predict anything.</p></details>
  </section>;
}
