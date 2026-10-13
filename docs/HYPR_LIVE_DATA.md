# HYPR live data and native broadcasting

Updated October 13, 2026.

## Sources and freshness

- Public discovery never falls back to fixture launches after RPC failure.
- `/api/launches` combines actual HYPR/Pons sources and checks native LiveKit rooms. Missing status is `unavailable`, not a fabricated zero or an offline claim.
- Discovery and room accounting refresh every 15 seconds while visible. Page chain snapshots have a 10-second cache; `chainCheckedAt` records the observation. RPC failures are visibly labeled.
- In-room broadcast availability refreshes every five seconds. Actual audio/video is delivered through LiveKit WebRTC, not page polling or a YouTube/Twitch embed.
- `LIVE` requires a creator's published, unmuted camera, microphone, screen-share or screen-share-audio track. A connected creator with all media off is not live.
- Viewer counts are connected LiveKit viewer participants, not unique people, holders, visits or traction.
- Curve phase `Live` is displayed as **Active curve**, distinct from broadcast status.
- Recent trade counts/volume cover the confirmed 2,500-block scan, not lifetime activity or 24-hour volume. USD prices, historical charts and unmeasured HYPE remain unavailable.
- Real onchain token names remain unchanged, including earlier test launches. Live-first discovery ranks actual broadcasts/viewer counts, then measured curve progress; it does not fabricate popularity or silently relabel tokens.

## Creator/viewer workflow

1. Open a native HYPR room. Anyone can watch an available broadcast without a wallet or media permissions.
2. The creator opens the studio and selects camera and/or microphone. Audio-only is supported.
3. The site requests the Robinhood testnet network when necessary, checks the exact creator wallet, and requests a canonical UTF-8-hex personal signature.
4. The server independently verifies the indexed creator and signature. Only that creator receives media-publish permission.
5. The browser requests permission for the selected devices after the explicit start action. Media publishing—not connection alone—determines broadcast status.
6. Viewers see only creator tracks and can tap to enable blocked audio playback. They receive no camera/microphone controls or publish grant.
7. The creator can mute, disable camera, share screen, and end the session. HYPR does not automatically record media.

## Shared community

Migration `0003_hypr_live_community.sql` adds isolated, RLS-enabled wallet community tables; older `auth.users`-linked social tables are not changed. Database functions are callable only by the existing service role.

A same-origin, expiring wallet challenge establishes a two-hour HTTP-only, Secure-on-HTTPS, SameSite=Strict session. A domain-separated signing key is derived server-side from the existing Supabase service credential; that credential is never sent to browsers. Challenge nonces are consumed atomically. Sessions are bound to the website, wallet and configured chain. No transaction or approval is requested.

Chat and follows are durable and shared. Messages refresh every five seconds, have actual database timestamps and public wallet attribution, and are limited to 280 characters, one per three seconds and ten per minute per wallet. Follow upserts are idempotent. Only the message author or indexed room creator can soft-hide a message. Browser-only messages/follow previews and seeded chat are removed.

## Verification and remaining boundaries

- `npm test`, typecheck, lint, production build, client bundle security scan and runtime smoke exercise automated boundaries.
- `supabase/tests/live_community.sql` checks actual database sharing, nonce replay, follow idempotency, rate limits and moderation with transaction-local test rows and rollback.
- `node scripts/test-shared-community.mjs https://hypr-pons.vercel.app` checks the published authentication/session/database flow with an ephemeral unfunded identity and an independent public reader. It soft-hides its own marked test message and unfollows afterwards. It never signs from a user wallet or sends coin transactions.
- A real creator/viewer audio/video acceptance session still requires the creator's wallet and selected-device permissions. Rendering tests and a connected studio do not establish actual media delivery.
- The site remains Robinhood **testnet**. This change does not assert mainnet safety, public-chain graduation, a professional audit, production moderation operations, complete unattended indexing/backfill or million-user capacity.
- Existing submission videos are historical walkthroughs. Website updates do not turn those videos into an uninterrupted live recording or automatically change locked contest submissions.
