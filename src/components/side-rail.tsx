"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Launch } from "@/lib/types";
import { discoveryRooms, isThrowawayRoom } from "@/lib/discovery";
import { isTestnetDemoRoom } from "@/lib/demo-news";
import { SAVED_ROOMS_EVENT, savedRooms } from "@/lib/saved-rooms";
import { TokenArt, tokenGlyph } from "./token-art";

export const RAIL_ITEMS = [
  { key: "home", href: "/", label: "Home", icon: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" },
  { key: "watch", href: "/watch", label: "Watch", icon: "M4 6h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1zm6 3v6l5-3z" },
  { key: "discover", href: "/discover", label: "Discover", icon: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm3.5 5.5-2 5-5 2 2-5z" },
  { key: "following", href: "/following", label: "Following", icon: "M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" },
  { key: "create", href: "/creators", label: "Create", icon: "M12 5v14M5 12h14" },
] as const;

const DESKTOP = "(min-width: 1100px)";

/** Room list for the desktop rail: real index data only, refreshed while the page is visible. */
function useRailRooms() {
  const [launches, setLaunches] = useState<Launch[] | null>(null);
  const [saved, setSaved] = useState<string[]>([]);
  useEffect(() => {
    const media = window.matchMedia(DESKTOP);
    let active = true, timer = 0;
    async function load() {
      if (!media.matches || document.visibilityState === "hidden") return;
      try {
        const response = await fetch("/api/launches", { cache: "no-store", signal: AbortSignal.timeout(15000) });
        const data = await response.json() as { launches?: Launch[] };
        if (active && response.ok && Array.isArray(data.launches)) setLaunches(data.launches);
      } catch { /* Keep the last list; the rail is a shortcut, not a source of truth. */ }
    }
    const readSaved = () => setSaved(savedRooms());
    void load(); readSaved();
    timer = window.setInterval(() => void load(), 30000);
    media.addEventListener("change", load);
    window.addEventListener(SAVED_ROOMS_EVENT, readSaved); window.addEventListener("storage", readSaved);
    return () => { active = false; window.clearInterval(timer); media.removeEventListener("change", load); window.removeEventListener(SAVED_ROOMS_EVENT, readSaved); window.removeEventListener("storage", readSaved); };
  }, []);
  return useMemo(() => {
    if (!launches) return null;
    const rooms = discoveryRooms(launches, []);
    const followed = rooms.filter(room => saved.includes(room.token.address.toLowerCase()));
    // Same rule as Explore: test-named rooms stay out of the rail, except HYPR's own demo room.
    const others = rooms.filter(room => !saved.includes(room.token.address.toLowerCase()) && (!isThrowawayRoom(room) || isTestnetDemoRoom(room.token)));
    const order = (a: typeof rooms[number], b: typeof rooms[number]) => Number(b.token.broadcastStatus === "live") - Number(a.token.broadcastStatus === "live");
    return { followed: followed.sort(order).slice(0, 8), others: others.sort(order).slice(0, 8) };
  }, [launches, saved]);
}

function RailRoom({ token, title }: { token: Launch; title: string }) {
  const live = token.broadcastStatus === "live";
  return <li><Link href={`/room/${token.address}`} className={`rail-room${live ? " is-live" : ""}`} title={title}>
    <span className="rail-room-avatar" aria-hidden="true"><TokenArt seed={token.address} glyph={tokenGlyph(token.logo, token.symbol)} /></span>
    <span className="rail-room-text"><strong>{title}</strong><small>{live ? token.viewerCount !== undefined ? `Live · ${token.viewerCount.toLocaleString()} watching` : "Live" : token.broadcastStatus === "offline" ? "Offline" : "Status unavailable"}</small></span>
    {live && <span className="rail-live-dot" aria-label="Live" />}
  </Link></li>;
}

export function SideRail({ active }: { active?: string }) {
  const rooms = useRailRooms();
  return <aside className="side-rail" aria-label="Browse HYPR">
    <nav className="rail-nav" aria-label="Main">
      {RAIL_ITEMS.map(item => <Link key={item.key} href={item.href} className={active === item.key ? "active" : ""} aria-current={active === item.key ? "page" : undefined} title={item.label}>
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d={item.icon} /></svg><span>{item.label}</span>
      </Link>)}
    </nav>
    {rooms && rooms.followed.length > 0 && <section className="rail-section" aria-label="Rooms you follow"><h2>Following</h2><ul>{rooms.followed.map(room => <RailRoom key={room.token.address} token={room.token} title={room.title} />)}</ul></section>}
    {rooms && rooms.others.length > 0 && <section className="rail-section" aria-label="Rooms on HYPR"><h2>{rooms.others.some(room => room.token.broadcastStatus === "live") ? "Live and open rooms" : "Rooms on HYPR"}</h2><ul>{rooms.others.map(room => <RailRoom key={room.token.address} token={room.token} title={room.title} />)}</ul></section>}
    <div className="rail-foot">
      <Link href="/creators" className="rail-golive"><span aria-hidden="true" className="rail-golive-dot" /> <span>Start your room</span></Link>
      <nav aria-label="About HYPR"><Link href="/faq">How it works</Link><Link href="/protocol">Protocol</Link><Link href="/about">About</Link></nav>
      <small>Robinhood Chain testnet preview</small>
    </div>
  </aside>;
}
