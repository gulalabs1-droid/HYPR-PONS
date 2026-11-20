"use client";
import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Launch } from "@/lib/types";
import type { CombinedLaunchDataSource } from "@/lib/launch-data";
import { useLiveLaunches } from "@/lib/use-live-launches";
import { useGrowth } from "@/lib/use-growth";
import { SAVED_ROOMS_EVENT, savedRooms } from "@/lib/saved-rooms";
import { PUSH_ROOMS_EVENT, pushRooms, pushSupport, setRoomAlerts } from "@/lib/push-client";
import { Header } from "./header";
import { SiteFooter } from "./site-footer";
import { CreatorAvatar } from "./token-art";
import { ShowCountdown } from "./show-countdown";
import { ShowTime } from "./creator-growth";

type Row = { address: string; name: string; avatar: string; live: boolean; show: { title: string; startsAt: string } | null };

/** Everything you follow in one list: live first, then the next shows, then the rest. */
export function FollowingClient({ launches, source }: { launches: Launch[]; source: CombinedLaunchDataSource }) {
  const data = useLiveLaunches(launches, source);
  const growth = useGrowth();
  const [saved, setSaved] = useState<string[]>([]), [alerted, setAlerted] = useState<string[]>([]);
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState("");
  useEffect(() => {
    const update = () => { setSaved(savedRooms()); setAlerted(pushRooms()); };
    update();
    window.addEventListener(SAVED_ROOMS_EVENT, update); window.addEventListener(PUSH_ROOMS_EVENT, update); window.addEventListener("storage", update);
    return () => { window.removeEventListener(SAVED_ROOMS_EVENT, update); window.removeEventListener(PUSH_ROOMS_EVENT, update); window.removeEventListener("storage", update); };
  }, []);

  const rows = useMemo(() => {
    const profiles = new Map((growth.state?.rooms || []).map(room => [room.address.toLowerCase(), room]));
    const followed = new Set([...saved, ...(growth.state?.rooms || []).filter(room => room.following).map(room => room.address.toLowerCase())]);
    const now = Date.now();
    const list: Row[] = data.launches.filter(launch => followed.has(launch.address.toLowerCase())).map(launch => {
      const profile = profiles.get(launch.address.toLowerCase());
      const show = profile?.show?.status === "scheduled" && Date.parse(profile.show.startsAt) > now - 60 * 60_000 ? { title: profile.show.title, startsAt: profile.show.startsAt } : null;
      return { address: launch.address, name: profile?.displayName || launch.name, avatar: profile?.avatar || "H", live: launch.broadcastStatus === "live", show };
    });
    const rank = (row: Row) => row.live ? 0 : row.show ? 1 : 2;
    return list.sort((a, b) => rank(a) - rank(b) || (a.show && b.show ? Date.parse(a.show.startsAt) - Date.parse(b.show.startsAt) : a.name.localeCompare(b.name)));
  }, [data.launches, growth.state, saved]);

  const allAlerted = rows.length > 0 && rows.every(row => alerted.includes(row.address.toLowerCase()));
  async function toggleAlerts() {
    const support = pushSupport();
    if (support === "needs-install") { setNotice("On iPhone, tap Share → Add to Home Screen, then open HYPR from there to turn on alerts."); return; }
    if (support !== "supported") { setNotice(support === "blocked" ? "Notifications are blocked for this site. Allow them in your browser settings." : "This browser can’t show alerts."); return; }
    setBusy(true); setNotice("");
    try {
      for (const row of rows) if (alerted.includes(row.address.toLowerCase()) === allAlerted) await setRoomAlerts(row.address, !allAlerted);
      setNotice(allAlerted ? "Alerts off." : "You’ll get an alert when any of these rooms goes live or a show is about to start.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Alerts couldn’t be changed."); }
    finally { setBusy(false); }
  }

  return <main className="following-page"><Header active="following" />
    <div className="page-shell following-shell">
      <section className="following-heading">
        <div><span className="eyebrow">FOLLOWING</span><h1>Your rooms</h1><p>{rows.length ? "Live rooms first, then upcoming shows." : "Follow a room and it shows up here—no wallet needed."}</p></div>
        {rows.length > 0 && <button type="button" className={`secondary-button${allAlerted ? " is-on" : ""}`} aria-pressed={allAlerted} disabled={busy} onClick={() => void toggleAlerts()}>{busy ? "Updating…" : allAlerted ? "🔔 Alerts on for all" : "🔔 Alerts for all my rooms"}</button>}
      </section>
      {notice && <p className="accounting-copy" role="status">{notice}</p>}
      {rows.length === 0 ? <div className="following-empty"><span aria-hidden="true">♡</span><h2>Nothing followed yet</h2><p>Tap + Follow in any room. Sign in later and your follows sync across devices.</p><Link className="primary-button" href="/discover">Find rooms →</Link></div>
        : <ul className="following-list">{rows.map(row => <li key={row.address}><Link href={`/room/${row.address}`} className={row.live ? "is-live" : ""}>
          <CreatorAvatar seed={row.address} avatar={row.avatar} name={row.name} />
          <span className="following-name"><strong>{row.name}</strong>{row.live ? <span className="following-live"><span className="pulse" aria-hidden="true" />Live now</span> : row.show ? <span>{row.show.title} · <ShowTime iso={row.show.startsAt} /></span> : <span>No show scheduled</span>}</span>
          {row.live ? <span className="following-cta">Watch →</span> : row.show && Date.parse(row.show.startsAt) > Date.now() ? <ShowCountdown startsAt={row.show.startsAt} /> : <span className="following-cta" aria-hidden="true">→</span>}
          {alerted.includes(row.address.toLowerCase()) && <span className="following-bell" aria-label="Alerts on">🔔</span>}
        </Link></li>)}</ul>}
      <SiteFooter />
    </div>
  </main>;
}
