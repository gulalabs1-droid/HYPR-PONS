# HYPR native video pilot

## What is implemented

- An unchecked creator-studio consent option saves a replay when published creator media becomes available. Recording can also be started explicitly in the connected studio.
- Replays stop at 10 minutes / 40 MiB. Clips capture the next 30 seconds, up to 8 MiB; there is no retroactive rolling buffer.
- Recording uses the creator's already-published media. It never requests viewer devices or records chat. Multiple creator audio sources are mixed locally. A published-source change finishes the current capture rather than silently saving a different scene.
- Stopping live flushes the recording before disconnecting, then uploads continue in the root layout across in-app navigation. Closing/reloading the browser before upload completes is not safe; a warning is displayed.
- Path-scoped signed PUT uploads bypass the serverless request-body limit. The hosted TUS endpoint rejected scoped signatures during real verification, so uploads deliberately use the tested single-request path instead. Failed uploads retain a local downloadable backup while the tab remains open; retries restart the transfer, not resume partial bytes. A saved object can be finalized again without uploading a duplicate.
- WebM duration metadata is repaired before upload. MIME and file headers are checked, as are actual Storage object size and type.
- Drafts are private to their author and room creator. Only the creator publishes or hides a recording. Public playback is wallet-free. Private pages never expose their title in public metadata.
- Public share links target the HYPR recording page, never a temporary storage credential. Storage read links expire after five minutes; hiding/revoking consent cannot recall downloaded copies or instantly invalidate issued links.

## Permissions and capacity

Apply migrations 0001–0007 in order. Migration 0007 adds two private Storage buckets, media metadata and per-broadcast clipping permissions. No anonymous Storage policies are added. The media RPC is service-role-only; browser clients never receive the service credential.

Broadcast permission uses the actual LiveKit host participant SID, not a client-supplied session ID or the creator's reusable wallet identity. Clipping starts disabled for each new broadcast. Turning clipping off hides published viewer clips for the room. Viewer drafts never self-publish.

Reservations serialize under an advisory lock. Actual object sizes, abandoned objects and unresolved full-capacity reservations count toward a 256 MiB total. Unfinished reservations are intentionally not automatically freed: expiring a signing token does not prove that every resumable upload was canceled. Limits are six reservations per wallet and sixteen per room per day. Operators must reconcile abandoned reservations and objects before releasing capacity; never blindly delete user media or make a bucket public.

The storage cap is not a guarantee about monthly bandwidth or provider availability. Existing Supabase/LiveKit plan limits still apply. No billing plan is upgraded by this implementation. This is a bounded testnet/private-pilot feature, not million-user security, moderation, codec, or load certification.

## Verification

- `npm test`: format validation, buffer/size limits, guest reads, authentication boundaries, private drafts, scoped read URLs, explicit/automatic consent and late-start cancellation.
- `supabase/tests/video_library.sql`: rollback-only real database permission and publication tests. Its fake object metadata exists only inside a rolled-back transaction, not in the product.
- `tests/recording-browser.html`: synthetic canvas + generated audio through the actual recorder, playable duration and original-track preservation; no camera/microphone/screen access. This test fixture is excluded from Vercel uploads.
- `scripts/media-private-smoke.ts`: ephemeral test-wallet sign-in, real path-scoped upload, actual byte-identical download, anonymous draft rejection, non-creator publication rejection and completion retry. Test keys stay in process memory and no funds are used. A synthetic fixture must remain explicitly labeled and private; it is not traction or a real broadcast.

## Known rollout limits

This is not always-on cloud recording. Unsupported browsers show a recording/playback message; the creator must keep HYPR open. Backgrounding/suspending a mobile browser may interrupt capture. Camera/screen-share changes finish the current recording; full-session track-switch compositing is not claimed. Clips are opt-in forward captures, not retroactive cuts from replay ranges. Longer full-show cloud recordings, downloadable transcoded exports, content review staffing, and stronger bandwidth/abuse controls remain separate work.
