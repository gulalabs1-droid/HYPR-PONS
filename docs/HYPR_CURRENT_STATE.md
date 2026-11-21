# HYPR current state

Audited 2026-11-21 against the repository at `main` (`d9c79c8`) plus this change, and against
production (`https://hypr-pons.vercel.app`). Every item is marked:

- **Verified**: checked in code and observed working (tests, browser, or a production read).
- **Built, unverified**: code exists and tests pass, but no real end-to-end run was observed.
- **Partial**: some of the capability exists; the gap is named.
- **Missing**: not in the codebase.

## Architecture

| Layer | What it is |
|---|---|
| App | Next.js 15.5 App Router, React 18, TypeScript. Deployed on Vercel (Hobby). |
| Chain | Robinhood Chain **testnet** (46630) only. viem for reads and wallet calls. |
| Contracts | `protocol/src`: `HYPRFactory`, `HYPRCurve` (bonding curve), `HYPRToken`, `HYPRV4GraduationAdapter`, `HYPRV4Boundary`. Foundry tests (`npm run protocol:check`). |
| Video | LiveKit Cloud (WebRTC rooms), browser publishing, optional RTMP/WHIP ingress behind `HYPR_INGRESS_ENABLED`. |
| Data | Supabase Postgres via service-role RPCs only (RLS on, anon revoked). Migrations `0001`–`0016`. |
| Storage | Supabase Storage for opt-in replays and clips (signed URLs, 5-minute expiry). |
| Push | `web-push` with VAPID, a GitHub Actions cron for show reminders. |
| Auth | Wallet signature (HMAC session cookie, HKDF keys) or passkey (WebAuthn, resident keys). |

## Capability audit

### Watching and community

| Capability | Status | Evidence / gap |
|---|---|---|
| Watch without a wallet | Verified | Room pages, Discover and Watch render with no wallet; browser-checked on phone and desktop. |
| Native livestreaming (creator → viewers) | Verified (earlier) | Reported creator/viewer test; `livekit.ts`, `native-live-*`. Production shows rooms `offline` today. Not re-run in this audit. |
| Permanent room URL `/room/<address>` | Verified | Same URL before, during and after a show. Coinless rooms reuse address-format IDs. |
| Guest chat with nickname | Built, unverified in prod | Migration `0008` applied 2026-11-20; per-IP rate limits and slow mode. |
| Wallet / passkey chat, follows synced | Verified (wallet), built (passkey) | Real browser passkey enrollment not yet verified (see `HYPR_CLOUD_SETUP_STATUS.md`). |
| Reactions, polls, @mentions, presence ("here now") | Built, unverified in prod | `0010`, `0014`, presence RPC. |
| Moderation (reports, removal, slow mode) | Partial | Reports and creator removal exist (`0006`); no moderator roles, bans or word filters. |
| Show scheduling, countdown, calendar link | Verified | `creator-growth.tsx`, `/api/community/calendar`. |
| Push reminders | Built, **disabled** | Production `/api/push` returns `{"enabled":false}`: VAPID keys and cron secrets not configured. UI hides the button. |
| Replays and 30-second clips | Built, limits | Opt-in browser recording, 10-minute replay / 30-second clip caps (`MEDIA_LIMITS`), creator review before publishing. No cloud DVR. |
| Share links and preview images | Verified | `share-image` route reads real live status. |
| "Up next" after a show ends | Built | Points only to other confirmed-live rooms. Seed of "Handoff". |
| **Room views (Watch / Community / Trade)** | **Verified (new)** | Desktop rearranges one DOM; the player node is preserved across switches (checked in the browser). |
| **HYPR Pulse (public engagement)** | **Built, needs migration `0016`** | Route returns `{pulse:null}` until `0016` is applied; panel hides itself. |

### Money

| Capability | Status | Evidence / gap |
|---|---|---|
| Token launch (factory) | Verified (earlier) | Testnet launches exist in production data. |
| Bonding-curve buy/sell | Verified (earlier) | `native-trade-panel.tsx`: onchain `quoteBuy`/`quoteSell`, minimum-receive protection, waits for receipts. |
| Fee split 1.25% = 0.30% creator + 0.95% HYPR | **Verified** | Production `/api/launches` reads `125 / 30 / 95` bps from the deployed curves (2026-11-21). |
| Charts: line + candles, volume, "my trades" markers | Verified (earlier) | `native-market-chart.tsx` (lightweight-charts) from confirmed `TradeExecuted` events, confirmation depth enforced in `market-server.ts`. |
| Wallet balance | Verified | Shown in trade panel. |
| Price impact display | Missing | Quote and minimum receive are shown; impact percentage is not. |
| Cost basis, realized / unrealized P&L, portfolio page | Missing | No per-wallet position accounting. |
| Uniswap v4 graduation | Partial | Adapter deployed and wired; no token has graduated, so the migration path is untested live. |
| Tips | Built | Viewer wallet → creator wallet directly (HYPR never holds funds); server verifies the receipt before announcing (`0012`). Test ETH only. |
| Paid subscriptions, gifted subscriptions | **Missing** | No payment provider, no entitlement tables. Do not activate real payments without approval. |
| Creator earnings dashboard | Partial | Shows unclaimed curve fees and tips; no subscription revenue (none exists). |

### Discovery and growth

| Capability | Status | Gap |
|---|---|---|
| Home, Discover (Live / Upcoming / Saved), Watch hub, Following | Verified | Redesigned 2026-11-21. |
| Throwaway-name filtering | Verified | `isThrowawayRoom`; production has 3 rooms, two are test names. |
| Personalised "For you" | Missing | Not enough data to personalise honestly. |
| Rising creators | Missing | Needs defined engagement criteria (Pulse can supply them). |
| Anonymous counts (views, plays, shares) | Built | DNT/GPC and bots skipped, no cookies (`0011`). |
| Referral attribution | Missing | |

## Security and readiness risks

1. **Manual migrations.** `0008`–`0015` were applied by hand in the SQL editor, outside migration history. `0016` must be applied the same way, so the history drifts further. Recommend adopting `supabase db push` with a staging project.
2. **Guest identity is a browser cookie.** Guests can mint new identities by clearing cookies. Writes are per-IP rate-limited; Pulse counts "regulars" only across two days to blunt this. Do not use guest counts for anything with money attached.
3. **Passkey accounts are free to create.** Same inflation caveat for follows by passkey members.
4. **Push and reminders are off** in production. Anything claiming "we'll notify you" must stay hidden until configured.
5. **No dependency audit gate.** `npm audit` reports pre-existing advisories in `next` and `minimatch`.
6. **Graduation path untested live.** A real graduation on testnet should be rehearsed before any mainnet discussion.
7. **No subscription legal or tax design.** Subscriptions are a regulated money flow; tokens are speculative assets. Keep them in separate code paths and separate copy.

## Missing credentials and infrastructure

| Item | Needed for |
|---|---|
| Apply migration `0016_hypr_room_pulse.sql` | Pulse panel |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Push alerts |
| `CRON_SECRET` + GitHub secrets `CRON_SECRET`, `HYPR_APP_URL` | Show reminders |
| LiveKit `track_published` webhook | Instant "went live" detection |
| Payment provider account (e.g. Stripe), legal review | Subscriptions, gifts (not approved) |
