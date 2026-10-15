# HYPR: creator-first discovery and the next headline features

Research and local implementation: October 15, 2026. This is a product direction, not a claim of exclusivity or production readiness.

## What the reference actually does

[Pump.fun Live](https://pump.fun/live) already offers native livestream listings with coin/creator identity, viewer counts, market cap, and rails including Most viewers. Native streaming plus a coin is table stakes, not HYPR's unique selling point. Public documentation did not establish the exact permissions or availability of viewer-created clips; do not claim Pump lacks them.

[Pump's livestream policy](https://pump.fun/docs/livestream-moderation-policy) describes safety moderation and possible retention. Retention for safety is not proof of publicly playable replays.

## Built in this local change

- `/discover` is its own destination; the homepage is a landing page, not the full directory.
- Content-first room cards with real creator profiles when available, confirmed live status, optional known connected-viewer counts, device saves, and permanent room destinations. Artwork is explicitly labeled, never passed off as stream screenshots.
- Explore, Live now, Upcoming shows, and Saved filters. Search creators, biographies, room/coin names, symbols, addresses, and show titles. Query/filter/sort live in the URL; shared links preserve the view, but device-saved results remain personal to each browser.
- Creator schedules use local time zones. Past/canceled/ended schedules are not upcoming. A schedule cannot produce a LIVE badge.
- A dedicated FAQ plus contextual room/Discover help. The FAQ explicitly says video clips and replays are not available.
- Responsive layout, accessible native disclosures, named controls, visible focus indicators, reduced-motion styles, truthful empty/service-error states. No sample crowds, endorsements, category guesses, or imaginary shows.

Existing features reused: LiveKit broadcasting, permanent rooms/chat, creator profiles, one planned next show, calendars, device saves, wallet follows, room sharing and text/art Moment Share Cards. These were not newly invented by this change.

## Priority 1: HYPR Moments — the distribution loop

The headline: **The audience finds the moment. The creator owns the release. The clip brings people home.**

1. Creator explicitly opts into recording for a broadcast after seeing retention, rights, visibility, and cost information. Display recording state to everyone. No retroactive or hidden capture.
2. Viewer requests a recent 15/30/60-second moment, bounded by available recorded media. “Request a moment” is not the same permission as public publishing.
3. Creator previews, trims, captions, approves/rejects, and can delete. Private preview assets need short-lived signed URLs; public assets have a separate explicit publication step.
4. Approved clip gets captions, a portrait-friendly export, creator attribution, and its canonical room link. No automatic third-party social posting.
5. Shared clip page plays without a wallet, links to the source creator, shows actual room status and next show, and offers Save/Follow. If deleted, it stops serving the media instead of leaving an orphaned public URL.
6. Measure consented clip views → room visits → saved rooms → returning watch sessions. A share click is not a new viewer or a retained user. Do not make coins or purchases the success metric.

Infrastructure required before enabling: recording consent and authorization, durable recording/session records, [LiveKit Egress](https://docs.livekit.io/reference/other/egress/api/), authenticated webhooks, bounded media storage, async cut/transcode jobs, retries/idempotency, storage lifecycle/deletion, cost caps, rate limits, report/review tools, content ownership policy and takedowns. LiveKit export capability alone does not implement clipping. Start with creator-owned recording and approved clips; do not launch arbitrary instant-public viewer recording.

## Priority 2: Ask HYPR — conversation that survives the stream

An in-room question queue: viewer submits a question, creator pins/marks it answered, viewers can find answered questions after the show. Optional creator-curated FAQ replaces repetitive onboarding and helps first-time visitors understand the room without buying anything. Keep it separate from normal chat; require existing wallet/session permissions for writes initially, escape all content, rate limit, allow delete/report, never infer factual answers from chat automatically. This is proposed; the local change ships platform FAQs only.

## Priority 3: A recognizable creator home

Creator-set stream title/topic, approved cover artwork, explicit community rules, recurring schedule, and a post-show note (“Here’s what we made; here’s what’s next”). Existing single-show scheduling/profile fields are a start, not a recurring-program system. Topic filters need creator-provided metadata and moderation; do not fabricate categories from token names. Start with editable title and curated cover before a complex recommendation engine.

## Priority 4: Room-to-room handoffs

When a creator ends, offer an optional recommendation of another confirmed-live room with a preview of who/what is there. Viewer chooses; no autoplay, wallet prompt, camera permission, forced redirect, or invented live status. Later consider co-host guests with separate scoped publishing permissions, not by handing out the owner's broadcaster token.

## Brand and growth

Use HYPR as the primary consumer name and social identity; describe Pons as an integration rather than splitting a small audience across product brands. Exact handles require an availability check. Publish useful creator moments with permission and source-room attribution. Do not substitute follower counts or token volume for returning viewers.

## Limits of this pass

No deployment, recording, user-media capture, storage purchases, contracts, auth policies or database migrations are included. The local environment may lack production's persisted index and community credentials; an empty local directory is not proof the public app has no rooms. Component test fixtures are tests, not live activity. Screenshot/compilation checks do not establish product-market fit or production security.
