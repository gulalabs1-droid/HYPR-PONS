"use client";
import { useState } from "react";
import Link from "next/link";
import { signInCommunity } from "@/lib/community-client";
import { walletErrorMessage } from "@/lib/wallet-discovery";
import { Header } from "./header";
const metrics = { dailyViewers:"Active viewer browsers · last 24h", weeklyViewers:"Active viewer browsers · last 7d", uniqueViewers30d:"Unique viewer browsers · 30d", shares:"Successful share actions", attributedArrivals:"Attributed browser/share arrivals", attributedFollowers:"Attributed followed browsers", watchedThenFollowed:"Watched, then followed", day1Eligible:"Mature day-1 cohort", day1Returned:"Day-1 returning browsers", day7Eligible:"Mature day-7 cohort", day7Returned:"Day-7 returning browsers" };
export function PilotInsights({ roomId }: { roomId?: string }) {
  const [data, setData] = useState<Record<string, unknown> | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  async function load() {
    setBusy(true); setError("");
    try { await signInCommunity(); const response = await fetch(`/api/community/analytics${roomId ? `?roomId=${encodeURIComponent(roomId)}` : ""}`, { cache:"no-store" }); const body = await response.json(); if (!response.ok) throw new Error(body.error); setData(body); }
    catch (failure) { setError(walletErrorMessage(failure)); } finally { setBusy(false); }
  }
  return <main><Header /><div className="page-shell"><section className="growth-page-heading"><span className="eyebrow">PRIVATE PILOT INSIGHTS</span><h1>Measure return visits, not hype.</h1><p>Creator-only room insights; founder-wide access requires a server-configured admin wallet. No wallet address, raw browser identifier or signature appears in these metrics.</p><button className="primary-button" disabled={busy} onClick={() => void load()}>{busy ? "Loading…" : "Sign in & load real metrics"}</button></section>{error && <p className="live-notice" role="alert">{error}</p>}{data && <><p className="accounting-copy">{String(data.scope)}</p><dl className="pilot-metrics">{Object.entries(metrics).map(([key,label]) => <div key={key}><dt>{label}</dt><dd>{typeof data[key] === "number" ? (data[key] as number).toLocaleString() : "Unavailable"}</dd></div>)}</dl><p className="accounting-copy">No mature cohort means retention is not measurable yet—not a 0% failure. Shares-to-arrivals is a ratio, not a probability: one share may reach many browsers. Without consent, visits are intentionally not counted.</p><h2>Not measured yet</h2><p>Average watch duration, creator repeat-broadcast rate, provider-confirmed successful broadcasts and engagement without a trade are unavailable. Anonymous identities are not merged with wallets or counted as unique people.</p></> }<h2>Financial accounting is separate</h2><p>Current assets are testnet: these tests generate no real-money platform revenue. Unclaimed fees are current balances, not lifetime income. Acquisition and viewing do not imply trading.</p><Link className="secondary-button" href="/protocol">Open verified testnet accounting →</Link><p><Link href="/following">Your communities →</Link></p></div></main>;
}
