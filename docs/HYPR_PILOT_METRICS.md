# HYPR pilot measurement contract — October 14, 2026

## Scope and privacy

Optional first-party measurement, off by default. No tracking ID or events before consent. DNT=1 / Sec-GPC=1 and common bot/preview agents are excluded. No IP, referrer, wallet address, signature, financial payload, video or audio is stored in the measurement event/share tables. Creator/social authorization and write-rate tables remain a separate wallet-based boundary. Hosting/provider operational logs are separate. An opaque signed HttpOnly browser ID lasts 30 days; identities are not joined across devices or merged with wallets. Withdraw requests delete that browser's events/shares; failures are disclosed and retryable. A failed removal never silently re-enables local measurement.

Growth event/share reads filter a rolling 30-day window; writes clean up bounded batches older than 30 days. Without traffic, physical removal can be delayed until the next write. A scheduled daily purge and a reviewed public privacy/retention policy are still needed; do not promise an exact physical deletion deadline.

These are **consenting anonymous browsers**, not verified humans, all visitors, unique people, or evidence of demand. Bot filtering/rate caps are lightweight, not Sybil resistance. Explicitly separate automated test runs from recruitment results.

## Event definitions

| Event | Source and boundary |
| --- | --- |
| `room_viewed` | Visible public room visit after consent, once per component visit. Does not mean playback. |
| `stream_playback_started` | Viewer-side media `playing` event while subscribed creator media is live. Not a token grant or join click. Does not establish attention or audible audio. |
| `stream_watch_threshold_reached` | 30 seconds of visible, playing, live media in the current viewer session; paused/hidden/reconnecting time excluded. Timer catch-up capped. Once per session. Client observation, not provider-certified duration. |
| `creator_followed` / `creator_unfollowed` | Server confirms authenticated relationship write changed the prior state; consenting browser only. Duplicate relationship writes stay idempotent; concurrent event measurements are best-effort, not an accounting ledger. |
| `room_shared` | Clipboard/native share resolves successfully. Native cancellation does not count. One action is not a social-network impression or known recipient. |
| `share_link_opened` | Consenting visible room arrival with a server-issued, successfully shared ID bound to that room. Unknown IDs / preview bots do not count. Moment-to-room links preserve valid attribution. |
| `visitor_returned` | Derived from repeat threshold events in mature cohorts, not separately emitted. |
| `show_scheduled` | Actual persisted show rows/revisions exist; no separate analytics event is emitted in this slice. |
| `stream_started` / `stream_ended` | No durable provider-signed lifecycle instrumentation yet. UI state/creator-end callbacks are not a verified broadcast log. |
| `clip_shared` | Not emitted: no actual clips exist. Topic cards are not video. |

IDs deduplicate retries at the database. Event timestamps are server-generated; clients cannot submit historical dates. Twenty events/minute/browser and ten prepared share IDs/minute/browser; server-only tables and RPCs. No trading rewards or manipulation incentives.

## Available calculations

- DAU/WAU: distinct browser IDs with a threshold event over trailing 24h / 7d (not midnight calendar days).
- Unique viewers: distinct threshold browser IDs in the selected room or founder scope over 30d.
- Day-1 retention: first observed threshold in the retained window; return in [24h,48h). Include only cohorts with a complete 48h observation opportunity.
- Day-7 retention: return in [168h,192h); only cohorts with a complete 192h opportunity. These are window-first observed cohorts, not lifetime first-ever viewers.
- Watch→follow: threshold browsers with a later server-confirmed follow in the scope/window. This is an observed association, not causal attribution.
- Shared arrivals: distinct (issued share ID, browser ID) pairs. One share can generate multiple arrivals; arrivals/shares is not a probability.
- Shared followers: distinct consenting browsers with a valid shared arrival and later server-confirmed follow carrying the same share ID. Visitors who decline tracking intentionally disappear from this funnel.
- Creator dashboard uses actual total room follower count independently of analytics consent.

No eligible cohort means **not measurable yet**, not 0% retention. Clearing cookies, incognito mode and devices change anonymous identity. Reusing one browser undercounts different people; multiple browsers can overcount one person.

## Not measured yet

Average/median legitimate duration, successful provider-confirmed broadcasts, repeat-creator rate, engagement without a trade, cross-device identity, notification delivery and attribution outside the controlled share path. Metrics return null/unavailable; never substitute samples.

Financial accounting remains separate at `/protocol`: actual current unclaimed test-ETH balances and bounded confirmed trade events, not lifetime revenue, USD income, or business viability. All current assets are testnet; actual monetary platform revenue from these tests is **$0**. A durable reorg-aware fee/claim ledger is required before founder revenue reporting can be complete.

## Five-creator experiment: entertainment return, not token demand

Run one 14-day, invite-only testnet experiment. Recruit five consenting creators with distinct non-financial topics; each commits to three 20–30 minute shows, on days 1–3, 5–7 and 10–12. Each creator invites 20 genuine adults: target 100 invited people, not a claimed 100 viewers. Onboard the creators manually; no token purchases, price calls, airdrop incentives, referral payments or trading targets. The token can remain associated with the room without being the entertainment subject. Do not change the price algorithm for the experiment.

Give each creator one permanent room, real profile, published next-show time and calendar link. Keep trade optional and outside the primary watch path. Ask consent for measurement, never as an entry requirement. Track organizer-observed attendance and voluntary interviews separately from anonymous analytics; do not publish personal attendance lists.

Pre-register before invitations:

1. Primary outcome: at least 25% of consenting first-show threshold browsers return to a later show by the **same creator** within seven days. Use an explicit same-room cohort export/calculation, not the founder-wide aggregate that could mean a different creator. Observe cohorts for the full window; report n/N and consent coverage. This is a decision threshold, not a forecast.
2. Creator repeat: at least four of five creators complete at least two shows. Confirm via operator attendance/provider evidence, not authorization-token requests.
3. Usability: at least 80% of consenting observed novices reach media within 60 seconds without wallet help; log time-to-first-playing and failures manually until reliable telemetry exists.
4. Safety/reliability stop: stop the session for exposed private media, unauthorized publishing, serious harmful content, or repeated unexplained joins/disconnects. A live moderator attends each show.
5. Cost cap: founder-approved provider spending cap before invitations; monitor actual costs, not assumed free tiers. No recording.

Interview ten attendees and all five creators: why they returned/missed a show, what was confusing, whether they would return if buying tokens were unavailable, and whether HYPR adds enough value over their current tools. Do not count friends saying "looks good" as repeat behavior.

Decision: repeat viewing plus creator repetition supports another small pilot, not product-market fit. Good viewing but low return → improve show quality/scheduling/return reminders first. Wallet friction → design a separately reviewed non-wallet fan identity flow. No return absent speculation → reassess the product thesis before adding token incentives.
