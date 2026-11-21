# HYPR growth and retention

## The loop

Creator goes live → a good moment happens → it gets shared → a new viewer lands on the room →
watches with no wallet → chats → follows → gets a reminder → returns → may support or start a room.

| Step | What exists | Gap |
|---|---|---|
| Go live | Browser studio, optional OBS ingress | Ingress off by default |
| Moment | Opt-in 30-second clips, replays | No vertical clip pages yet |
| Share | Permanent room URL, live-aware preview image, share button | No referral attribution |
| Land and watch | Instant, no wallet; redesigned home showcase | Vertical swipe feed on phones |
| Chat | Guest nickname chat, reactions, polls | Moderators |
| Follow | Free; syncs after wallet or passkey sign-in | — |
| Reminder | Built | **Push disabled in production** |
| Return | "Up next", saved chat, replays | Handoff |
| Support | Tips (test ETH) | Subscriptions not built |

The single biggest leak today is the reminder step: without push, a follow is only as good as the
viewer's memory. Turning push on is the highest-value, lowest-cost growth action available.

## What we measure (honest metrics only)

| Metric | Source | Notes |
|---|---|---|
| Room views, plays, shares | `hypr_daily_counts` (anonymous, DNT/GPC respected) | No cookies or IDs |
| Followers, new followers | `hypr_community_follows` | Signed-in members only |
| Chatters, regulars (2+ days in 30) | Pulse (`0016`) | Removed messages and the creator excluded |
| Shows held, peak viewers | `hypr_broadcast_peaks` | From LiveKit status polls |
| Reminder → attendance | Push deliveries vs. presence at show start | Needs push enabled |

Never published: fake viewer counts, invented "trending" labels, trading volume as popularity.

## Retention levers, in order

1. **Reminders that work** (push on, calendar link fallback already exists).
2. **A reason to come back between shows**: chat that persists, polls, replays, Pulse.
3. **Consistency for creators**: recurring schedules and a visible "shows this month" stat.
4. **Collaboration**: Handoff sends audiences between creators.
5. **Support without speculation**: tips now, subscriptions later.

## Guardrails

- No trading-based recruitment rewards, no referral bonuses paid in coins.
- No countdown pressure on purchases, no "price is going up" animations.
- Gifting effects modest and configurable by the creator.
- Pulse and any future ranking ignore coin price, volume and holdings.

## First experiments (once push is on)

1. Reminder 15 minutes before vs. 1 hour before: attendance rate.
2. Visible Pulse vs. hidden (by room): follow conversion of first-time visitors.
3. Showcase room on home: live room vs. scheduled room: click-through to watch.
