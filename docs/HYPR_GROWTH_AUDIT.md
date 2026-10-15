# HYPR growth audit — October 14, 2026

## Verified baseline, before changes

- Next.js 15.5.27 App Router, React 18, TypeScript; no replacement framework needed (`package.json`, `src/app`). No HYPR Rush files found in the scoped source search.
- Native token/curve contracts, reviewed testnet constants and existing create/buy/sell/fee tests exist (`protocol/src`, `src/lib/hypr-launch-config.ts`). Chain 46630, fees 125/30/95 basis points and curve/graduation mathematics are out of scope for this change. Public graduation and independent economic/security review remain release gates.
- LiveKit server-issued creator/viewer grants; indexed creator + wallet signature required to publish (`src/app/api/live/token/route.ts`, `src/lib/livekit.ts`). Guest viewing grants do not require a wallet. Viewer devices remain off.
- Explicit private preview/start/end, published-media LIVE state, reconnect grace, persistent room/chat/follows (`src/components/native-live-*`, `docs/HYPR_BROADCAST_LIFECYCLE.md`). Founder now reports a successful real creator/viewer test; this was not independently observed or recorded by the agent. Prior docs' unverified media statements are historical.
- Supabase service-only RPCs and RLS, domain/chain-bound two-hour HttpOnly sessions, atomic nonce consumption, shared chat and idempotent room follows (`0001`–`0003`, `community-auth.ts`, community routes). Chat: 280 chars, three-second spacing, ten/minute; creator/author soft-hide. No complete platform reporting/ban/stream-takedown workflow.
- Public chat API freshly returned actual empty messages, zero followers, no signed-in wallet on canonical room. Live status freshly returned configured/offline, no host/media, zero connected viewers. No substitute fixtures used in this check.
- Discovery is primarily token-room cards, live-first sorting mixes pool progress; no schedule or usable Following destination. Broadcast status is checked against LiveKit, not inferred from trade activity (`use-live-launches.ts`, `/api/launches`).
- Rooms are stable token-address destinations, not independent creator profiles: one creator can have multiple token rooms. A tokenless creator onboarding flow does not exist. Preserve these associations rather than imply that roadmap is already implemented.
- Existing room metadata is generic and sharing copies the current URL. No room-specific artwork, attribution, consented pilot analytics, schedule/calendar, or show management found.
- Existing phone Chat/Trade/About retains mounted media; earlier checked 320/390/768px. Real phone wallet and novice acceptance still limited. No million-user performance claim.
- No recording/egress, replay artifact, clip permission/storage/delete/moderation pipeline. A share card is appropriate; actual clips stay disabled.

## Prioritized safe vertical slice

1. Add service-only, creator-authorized room profile + show scheduling, public upcoming reads, private Following reads. Existing session and wallet ownership are the authority; no second account system.
2. Put next-show/calendar, profile, follow and permanent sharing alongside existing room/studio; add Following destination and content-first Live Now/Upcoming discovery without fabricated rankings.
3. Native dynamic social artwork/canonical metadata; explicitly non-video Moment Share Cards, creator-published and removable. No automatic recording or external image requests.
4. Opt-in, bounded first-party event measurement with no IP/wallet/signature payloads. Label client observations honestly; authenticated follows and creator writes are server-confirmed. Metrics not measurable yet stay unavailable.
5. Basic authenticated reporting, creator report review/hide, public-content validation and independent regression checks. Platform takedown, bans and operational response remain a separate release gate.

## Risks and deployment boundaries

Additive migrations must be tested against PostgreSQL and RLS, not just text assertions. Missing schema/settings must fail honestly, not fall back to browser-only schedules or follows. Guest viewing must remain available if growth features fail. New features may be staged behind `HYPR_GROWTH_ENABLED`; paid video processing is never enabled by this work. No money, mainnet, camera/microphone capture, organizer messages or locked contest edits.

Privacy: analytics are optional; no consent means no tracking identifier/event collection. Browser observations are not audited humans, unique people, verified impressions or financial results. Avoid bot previews and hidden-tab watch-time credit. Full consent/legal/retention/abuse review remains necessary before open scale.

Cost: reuse existing Next/Supabase/LiveKit; no new paid provider. This does not guarantee a $25 total bill. LiveKit usage and database/hosting limits still apply; Vercel commercial eligibility must be resolved independently before a business launch.
