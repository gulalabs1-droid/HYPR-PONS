# HYPR product vision

## One sentence

HYPR gives every creator a room that stays open between shows, where fans watch for free, talk, come
back, can support the creator directly, and can optionally trade a community coin, without any of
those things being confused for the others.

## The three relationships (never blur them)

| Relationship | What the fan gets | What it is not |
|---|---|---|
| **Follow** (free) | A place to return to, reminders, the room's chat | Not a payment, not a subscription |
| **Support** (tips, later subscriptions) | Recognition, perks tied to a valid paid status | Not an investment, no price exposure |
| **Coin** (optional) | A tradable testnet asset with transparent fees | Not ownership of the creator or their business, not a subscription |

Design rule: a creator's room, followers, chat, replays and perks must keep working if their coin
falls 50%, 90% or to zero. Nothing in the room's core experience reads coin price.

## What we learn from others (and what is just table stakes)

| Product | Why people come | Established pattern (table stakes) | What HYPR takes |
|---|---|---|---|
| TikTok | Zero-effort discovery, instant play | Vertical feed, autoplay, share | Instant play with no account; shareable moments that link home |
| Twitch / Kick | Live presence, chat culture, raids | Live chat, emotes, subs, raids, clips | Live chat and presence; raids become consent-based Handoff |
| Discord | A place that persists | Channels, roles, history | The room outlasts the show: chat, schedule, replays |
| Pump.fun | Fast, legible speculation | One-click coins, curve, simple fees | Transparent curve with verified fees, kept out of the default view |

None of HYPR's live, chat, follow or coin features is novel by itself. The differentiation is the
**connection**: a live room that persists, with support and an optional market that never take over.

## Signature experiences

### 1. Room views: Watch, Community, Trade (built in this change)

1. **Experience.** One permanent room. A three-way switch rearranges it: video + chat (Watch), a big
   conversation with the video beside it (Community), or a big chart and order form with the stream
   still playing (Trade). Switching never restarts the stream.
2. **Why compelling.** Fans who only want the show never see a chart. Traders never lose the show.
3. **Return driver.** The room fits whatever mood you're in today.
4. **Competitors.** Twitch has theatre mode; Pump.fun has chat beside a chart. Nobody combines a
   live room, a persistent community and a market with a single layout switch.
5. **Creator retention.** The coin stops crowding out the creator's content.
6. **Smallest version.** CSS grid areas on one DOM, a segmented control. Done.
7. **Complexity / cost.** Low; zero running cost.
8. **Risks.** Trade view could be used as the default by creators who want to push the coin. Keep
   Watch as the default for viewers; do not let creators change that.
9. **Metric.** Share of room sessions that switch views; watch time in Trade view versus coin-page
   bounce rate before the change.

### 2. HYPR Pulse (first step built)

1. **Experience.** Every room shows its community energy from real signals: followers, regulars who
   came back on another day, people in the chat, shows held. "How Pulse is counted" explains each.
2. **Why compelling.** It shows a fan that a room is alive even between shows, and it gives creators
   a health number that doesn't depend on their coin.
3. **Return driver.** Creators watch their regulars grow; fans see a lively room and stay.
4. **Competitors.** Twitch shows follower counts and private creator analytics; no platform shows a
   public "returning community" measure next to a market.
5. **Creator retention.** A coin crash doesn't erase visible proof of a loyal audience.
6. **Smallest version.** Public aggregate stats (built). A composite 0–100 score only after weeks of
   data show which signals predict return visits.
7. **Complexity / cost.** One SQL function, CDN-cached for 60 s. Negligible cost.
8. **Risks.** Inflation by guest identities or passkey farms. Mitigations: signed-in followers only,
   creator excluded, removed messages excluded, "regulars" require two separate days. Never attach
   money or ranking rewards to Pulse until it is harder to fake.
9. **Metric.** Correlation of Pulse "regulars" with next-show attendance; follow conversion on rooms
   with a visible Pulse versus without.

### 3. HYPR Handoff (next)

1. **Experience.** When a show ends, the creator picks a live creator to recommend. Viewers see a
   card "Sam is sending you to Rae's show" and choose to go. Nobody is moved automatically.
2. **Why compelling.** The end of a show becomes the start of another, keeping the audience on HYPR.
3. **Return driver.** Small creators get discovered through people they collaborate with.
4. **Competitors.** Twitch raids move viewers forcibly; Kick hosts. HYPR's version is opt-in per
   viewer, attributed, and limited to confirmed-live rooms.
5. **Creator retention.** Collaboration is a growth path that doesn't involve the coin.
6. **Smallest version.** Extend the existing "Up next" panel: the creator chooses one target from
   confirmed-live rooms; record clicks as referrals.
7. **Complexity / cost.** Medium (creator UI, a referral table, blocklist). No paid services.
8. **Risks.** Sending viewers into harmful streams; reciprocal-raid rings. Mitigations: live-only
   targets, creator blocklists, reports, no trading-based eligibility.
9. **Metric.** Referred viewers who follow the target room within 7 days.

### Challenged ideas

- **Live Market Timeline** (replay synced to chart history). Interesting for education, but it
  makes coin price the star of the replay and invites "look what it did" marketing. Hold until
  replays have an audience of their own.
- **Gifted subscriptions with big on-screen celebrations.** Proven revenue on Twitch, but it pushes
  spending pressure. Build only after subscriptions exist, with modest, configurable effects.
- **"Rising creators" ranking.** Only with written criteria from Pulse signals. Never from volume.

## What success looks like

A first-time visitor can: open HYPR → find a creator → press play → chat with a nickname → follow →
come back for the next show, without ever seeing a wallet prompt. A creator can grow a room whose
health is visible without a coin. A trader can see the real price, a real quote, the fees, and a
confirmed receipt.
