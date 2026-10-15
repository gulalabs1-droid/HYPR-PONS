"use client";
import { useState } from "react";
import Link from "next/link";
import { signInCommunity } from "@/lib/community-client";
import { walletErrorMessage } from "@/lib/wallet-discovery";
import { Header } from "./header";
import { SiteFooter } from "./site-footer";

type Metric = { key: string; label: string; hint: string };
const groups: { id: string; title: string; caption: string; metrics: Metric[] }[] = [
  { id: "reach", title: "Reach", caption: "Browsers that opened the room player.", metrics: [
    { key: "dailyViewers", label: "Active viewer browsers · last 24h", hint: "Today’s audience" },
    { key: "weeklyViewers", label: "Active viewer browsers · last 7d", hint: "This week" },
    { key: "uniqueViewers30d", label: "Unique viewer browsers · 30d", hint: "Monthly reach" },
  ] },
  { id: "sharing", title: "Sharing & follows", caption: "What happens after someone shares your room link.", metrics: [
    { key: "shares", label: "Successful share actions", hint: "Links copied or shared" },
    { key: "attributedArrivals", label: "Attributed browser/share arrivals", hint: "Visits from those links" },
    { key: "attributedFollowers", label: "Attributed followed browsers", hint: "Arrivals that followed" },
    { key: "watchedThenFollowed", label: "Watched, then followed", hint: "Viewers who converted" },
  ] },
];
const cohorts = [
  { day: "Day 1", eligible: "day1Eligible", returned: "day1Returned", eligibleLabel: "Mature day-1 cohort", returnedLabel: "Day-1 returning browsers" },
  { day: "Day 7", eligible: "day7Eligible", returned: "day7Returned", eligibleLabel: "Mature day-7 cohort", returnedLabel: "Day-7 returning browsers" },
];

function shortAddress(address: string) { return `${address.slice(0, 6)}…${address.slice(-4)}`; }

type ShowRow = { id: string; title: string; startsAt: string; status: string; viewers: number; follows: number };
type OperatorReport = { id: string; roomId?: string; room?: string; reason: string; details: string; message: string | null };

export function PilotInsights({ roomId }: { roomId?: string }) {
  const [data, setData] = useState<Record<string, unknown> | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const [operatorReports, setOperatorReports] = useState<OperatorReport[] | null>(null);
  async function load() {
    setBusy(true); setError("");
    try {
      await signInCommunity();
      const response = await fetch(`/api/community/analytics${roomId ? `?roomId=${encodeURIComponent(roomId)}` : ""}`, { cache:"no-store" });
      const body = await response.json(); if (!response.ok) throw new Error(body.error); setData(body);
      const inbox = await fetch("/api/community/reports?scope=operator", { cache: "no-store" });
      const payload = inbox.ok ? await inbox.json() as { reports?: OperatorReport[] } : null;
      setOperatorReports(Array.isArray(payload?.reports) ? payload.reports : null);
    }
    catch (failure) { setError(walletErrorMessage(failure)); } finally { setBusy(false); }
  }
  const value = (key: string) => typeof data?.[key] === "number" ? data[key] as number : null;
  const shown = (key: string) => { const number = value(key); return number === null ? "Unavailable" : number.toLocaleString(); };
  return <main className="insights-page"><Header />
    <div className="page-shell">
      <nav className="insights-crumbs" aria-label="Breadcrumb">{roomId ? <Link href={`/room/${roomId}`}>← Back to room <code>{shortAddress(roomId)}</code></Link> : <Link href="/following">← Your communities</Link>}</nav>
      <section className="insights-hero">
        <div><span className="eyebrow">PRIVATE PILOT INSIGHTS</span><h1>Measure return visits, <em>not hype.</em></h1><p>Creator-only room insights; founder-wide access requires a server-configured admin wallet. No wallet address, raw browser identifier or signature appears in these metrics.</p></div>
        <div className="insights-hero-actions"><button className="primary-button" disabled={busy} onClick={() => void load()}>{busy ? "Loading…" : data ? "Refresh metrics" : "Sign in & load real metrics"}</button>{data && <span className="insights-scope">{String(data.scope)}</span>}</div>
      </section>
      {error && <p className="live-notice" role="alert">{error}</p>}
      {!data && <section className="insights-locked" aria-label="What you will see">
        {[...groups.map(group => ({ title: group.title, caption: group.caption })), { title: "Retention", caption: "Who comes back a day and a week later." }].map(item => <div key={item.title}><svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg><strong>{item.title}</strong><p>{item.caption}</p></div>)}
        <p className="insights-locked-note">Sign in with the room creator’s wallet to load measured numbers. Nothing here is estimated.</p>
      </section>}
      {data && <>
        {groups.map(group => <section className="insights-group" key={group.id} aria-labelledby={`insights-${group.id}`}>
          <header><h2 id={`insights-${group.id}`}>{group.title}</h2><p>{group.caption}</p></header>
          <dl className="pilot-metrics">{group.metrics.map(metric => <div key={metric.key} className={value(metric.key) ? "" : "is-quiet"}><dt>{metric.label}</dt><dd>{shown(metric.key)}</dd><small>{metric.hint}</small></div>)}</dl>
        </section>)}
        <section className="insights-group" aria-labelledby="insights-retention">
          <header><h2 id="insights-retention">Retention</h2><p>Returning browsers out of each cohort old enough to measure.</p></header>
          <div className="insights-cohorts">{cohorts.map(cohort => { const eligible = value(cohort.eligible), returned = value(cohort.returned); const measurable = eligible !== null && eligible > 0 && returned !== null; return <div className={`insights-cohort${measurable ? "" : " is-quiet"}`} key={cohort.day}>
            <span className="eyebrow">{cohort.day}</span>
            <strong>{measurable ? `${Math.round(returned / eligible * 100)}%` : "Not measurable yet"}</strong>
            <dl><div><dt>{cohort.returnedLabel}</dt><dd>{shown(cohort.returned)}</dd></div><div><dt>{cohort.eligibleLabel}</dt><dd>{shown(cohort.eligible)}</dd></div></dl>
            {measurable && <span className="insights-bar" aria-hidden="true"><i style={{ width: `${Math.min(100, returned / eligible * 100)}%` }} /></span>}
          </div>; })}</div>
          <p className="creator-fineprint">No mature cohort means retention is not measurable yet—not a 0% failure. Shares-to-arrivals is a ratio, not a probability: one share may reach many browsers. Without consent, visits are intentionally not counted.</p>
        </section>
        {Array.isArray(data.shows) && <section className="insights-group" aria-labelledby="insights-shows">
          <header><h2 id="insights-shows">By scheduled show</h2><p>Consenting threshold browsers whose first event in this window fell around the scheduled start (±15 minutes / +4 hours). Not a certified broadcast log.</p></header>
          {!(data.shows as ShowRow[]).length ? <p className="creator-fineprint">No shows in the last 30 days, so there is nothing to group yet.</p> : <div className="insights-shows">{(data.shows as ShowRow[]).map(show => <article key={show.id}><span className="eyebrow">{show.status}</span><strong>{show.title}</strong><time dateTime={show.startsAt}>{new Date(show.startsAt).toLocaleString()}</time><dl><div><dt>Viewer browsers</dt><dd>{Number(show.viewers).toLocaleString()}</dd></div><div><dt>Follows in window</dt><dd>{Number(show.follows).toLocaleString()}</dd></div></dl></article>)}</div>}
        </section>}
        {operatorReports && <section className="insights-group" aria-labelledby="insights-ops">
          <header><h2 id="insights-ops">Operator inbox</h2><p>Room-level reports, independent of the accused creator. Message reports stay with that room’s creator.</p></header>
          {operatorReports.length === 0 ? <p className="creator-fineprint">No unresolved operator reports.</p> : operatorReports.map(report => <article className="growth-report" key={report.id}><strong>{report.reason}{report.room ? ` · ${report.room}` : ""}</strong><p>{report.details}</p>{report.message && <blockquote>{report.message}</blockquote>}{report.roomId && <Link href={`/room/${report.roomId}`}>Open room →</Link>}</article>)}
        </section>}
      </>}
      <section className="insights-notes" aria-label="About these numbers">
        {data && <article><h2>Not measured yet</h2><p>Average watch duration, creator repeat-broadcast rate, provider-confirmed successful broadcasts and engagement without a trade are unavailable. Anonymous identities are not merged with wallets or counted as unique people.</p></article>}
        <article><h2>Financial accounting is separate</h2><p>Current assets are testnet: these tests generate no real-money platform revenue. Unclaimed fees are current balances, not lifetime income. Acquisition and viewing do not imply trading.</p><Link className="secondary-button" href="/protocol">Open verified testnet accounting →</Link></article>
        <article><h2>Keep the loop going</h2><p>Schedule your next show and share the room link—returning viewers are built between broadcasts.</p><div className="growth-actions">{roomId && <Link className="secondary-button" href={`/room/${roomId}`}>Open your room →</Link>}<Link className="secondary-button" href="/following">Your communities →</Link></div></article>
      </section>
    </div>
    <SiteFooter />
  </main>;
}
