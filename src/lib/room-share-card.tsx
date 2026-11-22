import React from "react";
import { roomHue } from "@/lib/room-display";

// Brand tokens from brand.css. Red only appears when the room is confirmed live.
const BG = "#08080c", VOLT = "#d3fb5a", LIVE = "#ff3b5c", VIOLET = "#a596ff", CYAN = "#6ee7f9", ROSE = "#ff5c8a";
const MAGIC = `linear-gradient(120deg, ${VOLT}, ${CYAN}, ${VIOLET}, ${ROSE})`;
const LIVE_EDGE = `linear-gradient(120deg, ${LIVE}, ${ROSE}, ${VIOLET})`;

/** Shorten at a word boundary when one is close, so names and bios don't end mid-word. */
function clip(text: string, max: number) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1), space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd().replace(/[,.;:·-]+$/, "")}…`;
}

/** Letters and digits only: the image renderer has no emoji font. */
function initial(name: string) {
  return (name.match(/[A-Za-z0-9]/)?.[0] || "H").toUpperCase();
}

/** The image renderer ignores hsl(), so room colours are converted to rgba here. */
function hsl(h: number, sat: number, light: number, alpha = 1) {
  const s = sat / 100, l = light / 100, k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l), f = (n: number) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))));
  return `rgba(${f(0)}, ${f(8)}, ${f(4)}, ${alpha})`;
}

export function showTime(iso: string) {
  return `${new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" }).format(new Date(iso)).replace(",", " ·")} UTC`;
}

export type RoomShareCard = {
  address: string;
  name: string;
  live: boolean;
  /** Only set when the next show is still in the future. */
  upcoming?: { title: string; startsAt: string } | null;
  /** Title of the current show while live. */
  liveTitle?: string | null;
  bio?: string | null;
  /** A creator-pinned moment; switches the card to the moment layout. */
  moment?: string | null;
};

/** The 1200×630 room share card, drawn for next/og. No counts or prices: only what the room says about itself. */
export function roomShareCard({ address, name, live, upcoming = null, liveTitle = null, bio = null, moment: momentText = null }: RoomShareCard) {
  const moment = Boolean(momentText);
  const status = moment ? { label: "Moment", color: BG, background: VOLT }
    : live ? { label: "LIVE NOW", color: "#fff", background: LIVE }
    : upcoming ? { label: `Next show · ${showTime(upcoming.startsAt)}`, color: BG, background: VIOLET }
    : { label: "Between shows", color: "#d3d3dc", background: "#1f1f29" };
  const line = moment ? `“${clip(momentText!, 90)}”`
    : live ? (liveTitle ? clip(liveTitle, 90) : "Live now. Come say hi in chat.")
    : upcoming ? clip(upcoming.title, 90)
    : clip(bio || "Watch live. Join the conversation. Come back for the next show.", name.length > 28 ? 70 : 100);
  const hue = /^0x[0-9a-fA-F]{6}/.test(address) ? roomHue(address) : 260;
  const roomArt = `linear-gradient(135deg, ${hsl(hue, 88, 58)}, ${hsl((hue + 60) % 360, 72, 22)})`;
  const nameSize = name.length > 28 ? 54 : name.length > 16 ? 68 : 84;

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", padding: 6, backgroundImage: live ? LIVE_EDGE : MAGIC }}>
      <div style={{ flex: 1, display: "flex", gap: 44, padding: "52px 56px", color: "#f6f6f8", fontFamily: "sans-serif", backgroundColor: BG, backgroundImage: `radial-gradient(circle at 95% 5%, ${hsl(hue, 85, 60, .26)}, transparent 45%), radial-gradient(circle at 60% 100%, rgba(211,251,90,.10), transparent 45%)` }}>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: 600 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 48, height: 48, borderRadius: 14, background: VOLT, color: BG, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, fontWeight: 900 }}>H</div>
            <div style={{ display: "flex", fontSize: 30, fontWeight: 800, letterSpacing: 5 }}>HYPR</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div style={{ display: "flex" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 18px", borderRadius: 999, background: status.background, color: status.color, fontSize: 22, fontWeight: 800 }}>
                {live && <span style={{ display: "flex", width: 12, height: 12, borderRadius: 999, background: "#fff" }} />}{status.label}
              </span>
            </div>
            <span style={{ display: "flex", fontSize: nameSize, fontWeight: 800, lineHeight: 1.02, letterSpacing: -2.5 }}>{clip(name, 38)}</span>
            <span style={{ display: "flex", fontSize: moment ? 40 : 28, lineHeight: 1.3, color: moment ? VOLT : "#d3d3dc", fontWeight: moment ? 700 : 400 }}>{line}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 21 }}>
            <span style={{ color: "#d3d3dc" }}>Watch free · No wallet needed · Chat with a nickname</span>
            <span style={{ color: "#a6a6b4", fontSize: 19 }}>Robinhood Chain testnet preview · hypr-pons.vercel.app</span>
          </div>
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 16 }}>
          <div style={{ display: "flex", padding: 4, borderRadius: 26, backgroundImage: live ? LIVE_EDGE : MAGIC }}>
            <div style={{ flex: 1, height: 276, display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 20, borderRadius: 22, backgroundColor: "#111117", backgroundImage: `radial-gradient(circle at 30% 30%, ${hsl(hue, 90, 60, .38)}, transparent 60%), radial-gradient(circle at 85% 85%, ${hsl((hue + 120) % 360, 90, 60, .28)}, transparent 55%)` }}>
              <div style={{ display: "flex", minHeight: 34 }}>
                {live && <span style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 14px", borderRadius: 999, background: LIVE, color: "#fff", fontSize: 18, fontWeight: 800 }}><span style={{ display: "flex", width: 10, height: 10, borderRadius: 999, background: "#fff" }} />LIVE</span>}
              </div>
              <div style={{ display: "flex", alignSelf: "center", alignItems: "center", justifyContent: "center", width: 96, height: 96, borderRadius: 999, background: "rgba(246,246,248,.16)" }}>
                <svg width="44" height="44" viewBox="0 0 24 24"><path d="M7 4.5v15l12.5-7.5z" fill="#f6f6f8" /></svg>
              </div>
              <div style={{ display: "flex", height: 6, borderRadius: 3, background: "rgba(255,255,255,.18)" }} />
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 18px", borderRadius: 20, background: "#17171f", border: "1px solid rgba(255,255,255,.08)" }}>
            <div style={{ display: "flex", padding: 3, borderRadius: 999, backgroundImage: live ? LIVE_EDGE : MAGIC }}>
              <div style={{ width: 48, height: 48, borderRadius: 999, backgroundImage: roomArt, border: `3px solid ${BG}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 900, color: "#fff" }}>{initial(name)}</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
              <span style={{ fontSize: 22, fontWeight: 800 }}>{clip(name, 18)}</span>
              <span style={{ fontSize: 17, color: "#a6a6b4" }}>{live ? "On air now" : "A room that stays open between shows"}</span>
            </div>
            <span style={{ display: "flex", padding: "8px 18px", borderRadius: 999, background: live ? LIVE : VOLT, color: live ? "#fff" : BG, fontSize: 18, fontWeight: 800 }}>{live ? "Watch" : "Follow"}</span>
          </div>
        </div>
      </div>
    </div>);
}
