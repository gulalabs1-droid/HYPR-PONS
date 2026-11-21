# HYPR implementation plan

Ordered by impact on the core loop (watch → chat → follow → return), then by risk. Nothing here
moves to mainnet, activates paid providers or real payments, or changes token economics without
explicit approval.

## Done in this change (2026-11-21)

| Item | Files | Verified by |
|---|---|---|
| Room views: Watch / Community / Trade on desktop, player preserved | `src/components/room-client.tsx`, `src/app/brand.css` | Browser: same player node across all switches; layouts measured |
| Phones keep the stream pinned while on the Coin tab during a live show | `room-client.tsx` (`data-chatting`) | Code + existing sticky rules |
| HYPR Pulse v1: public aggregates, hidden if unavailable | `supabase/migrations/0016_hypr_room_pulse.sql`, `src/app/api/community/pulse/route.ts`, `src/lib/pulse.ts`, `src/components/room-pulse.tsx` | `tests/pulse.test.ts` (5 tests, incl. "never reads price/trades") |
| Product docs | `docs/HYPR_*.md` (five files) | — |

Before this: the consumer redesign (`d9c79c8`), guest chat, polls, reactions, tips, passkeys and
coinless rooms (`0c4fd54` … `2313838`).

## Phase 1 — core experience (remaining)

1. **Apply `0016`** in Supabase (SQL editor, as with `0008`–`0015`). Then confirm
   `/api/community/pulse?roomId=<demo room>` returns numbers.
2. **Turn on push**: VAPID keys, `CRON_SECRET`, GitHub secrets. Test one real reminder end to end.
3. **Verify passkey sign-up on a real iPhone and Android device.**
4. **Vertical discovery on phones**: a swipeable full-screen "Live now / Up next" feed using the
   existing `discoveryRooms` data. Only confirmed-live rooms autoplay (muted).
5. **Moderation basics**: room moderators (creator-appointed), timeouts, blocked words list.

## Phase 2 — trading completeness

1. **Price impact** in the quote panel (quote vs. spot from the curve) with a warning above 5%.
2. **Gas estimate** before signing (viem `estimateGas` × current fee), clearly marked as an estimate.
3. **Portfolio view**: per-wallet holdings from `balanceOf` across HYPR tokens; cost basis from the
   wallet's own confirmed `TradeExecuted` events (FIFO), realized/unrealized P&L labeled "estimate,
   at current curve quote, not a guaranteed sale price".
4. **Indexer hardening**: idempotent event keys `(chain, tx hash, log index)` already used; add a
   reorg window re-scan test.
5. **Graduation rehearsal** on testnet with a funded test token; document every transaction.

## Phase 3 — creator monetization (design only until approved)

1. **Entitlements table** (`hypr_entitlements`: room, member, kind, source, valid_from, valid_to,
   status) independent of any provider. Perks read only this table.
2. **Provider adapter** behind `HYPR_PAYMENTS_ENABLED` (default off). Development uses a clearly
   labeled fake provider that only works on localhost.
3. **Subscriptions** at a configurable price (starting idea $4.99/month); badge and subscriber-only
   chat mode read entitlements.
4. **Gifted subscriptions**: purchaser pays, recipients get entitlements; modest, configurable chat
   announcement. No leaderboards of spenders.
5. **Earnings**: three separate ledgers (subscriptions, tips, curve fees), each reconciling to its
   source (provider payouts, tip receipts, onchain fee claims).

## Phase 4 — growth engine

1. **Handoff v1**: creator picks one confirmed-live room when ending a show; viewers opt in; clicks
   recorded as referrals.
2. **Referral attribution** on share links (`?via=<roomId>`), counted anonymously.
3. **Returning-viewer analytics** in the creator dashboard using the Pulse function plus daily counts.
4. **Moments**: promote opt-in 30-second clips to shareable vertical pages (infrastructure exists).

## Phase 5 — signature innovation

Run Pulse in production for 4–6 weeks. If "regulars" predicts next-show attendance, introduce a
documented composite score and a "Rising creators" shelf driven by it. If it doesn't, keep the raw
stats and invest in Handoff instead.

## Incremental operating-cost estimates (monthly, pilot scale)

| Item | Cost | Notes |
|---|---|---|
| Room views | $0 | CSS only |
| Pulse | ~$0 | One cached SQL call per room per minute at most |
| Push (VAPID) | $0 | Browser push services are free |
| Reminder cron (GitHub Actions) | $0 | Within free minutes |
| LiveKit | Free tier, then usage-based | Grows with concurrent viewer-minutes; the biggest variable cost |
| Supabase Storage for replays | Free tier (1 GB), then ~$0.021/GB | 10-minute replay ≤ 40 MB |
| Payments (if approved) | Provider % per transaction | Not active |

## Risks to watch

- **Financial:** never show a trade as done before confirmation (enforced today); never show P&L
  without "estimate" labels; keep subscriptions and coins in separate code and copy.
- **Security:** manual migrations drifting from history; guest/passkey inflation of social metrics;
  pre-existing `npm audit` advisories.
- **Product:** coin features crowding the default view (mitigated by Watch-first views).
