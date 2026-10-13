# Broadcasts stop; community rooms persist

Implemented October 13, 2026. This is a consumer lifecycle improvement, not a
new recording service, completed real-media acceptance test or mainnet release.

## Separate the room from a stream

The token-address route is the persistent community destination. A LiveKit
connection is a temporary audio/video session inside it. Ending a stream does
not delete a token, alter a curve, remove saved messages/follows or generate a
new room URL. Shared community data is stored independently in Supabase; chain
state remains onchain. Availability still depends on the respective services.

## Actual UI states

- A fresh offline visit: **Between broadcasts**. No claim that a creator has
  never streamed or that a historical stream ended at a particular time.
- Connected creator without publishing: **Creator in the studio**; not LIVE.
- Actual unmuted host media: **LIVE**. Viewer counts are connected viewer
  participants, not unique people or traction.
- A connected host turns all media off after publication: **Broadcast paused**.
- Local player reconnects: **Reconnecting your player**. Stale track state does
  not keep a misleading LIVE badge or assert a deliberate creator exit.
- Creator disappears from a connected viewer's participant list: show the
  disconnection and wait 15 seconds for a return. Reappearance or local
  reconnection cancels the timeout. Continued absence disconnects only the
  viewer's media session; the same room/chat remain mounted.
- Observed stream loss: **Broadcast stopped. Room still open.** An accidental
  disconnect is not described as the creator deliberately ending it.
- Explicit creator confirmation: **Your broadcast has ended**. End broadcast
  opens a confirmation; Keep broadcasting cancels it. Confirming calls
  `disconnect(true)` to stop local capture tracks. Completion callbacks are
  deduplicated; an error does not pretend the end succeeded.
- API failure: **Broadcast status unavailable**, not a fabricated offline/end
  state. A Retry action makes another actual status read.

The offline/finished surface links directly to room chat and sharing. About and
the studio explain what survives a broadcast. No session timestamp, duration,
history entry, view count or replay is fabricated. Stop/pause observations are
current-visit state, not a durable broadcast-history archive.

## What is saved

- Real token/factory provenance and persisted room discovery.
- Shared wallet-authenticated messages and follows, subject to moderation and
  the application's normal persistence policies.
- **Not saved:** broadcast video/audio or a video replay. Device preview stays
  on-device and no MediaRecorder/egress/recording job is started by this change.

Viewer capture defaults remain false. Host capture also defaults false unless
the session explicitly selects the device. Restarting the studio after leaving
resets both device choices to OFF. Nothing auto-broadcasts after a reconnect or
an ended session from the offline page; joining again is a deliberate action.

## Verification and limits

Automated checks cover state classification, unknown/error precedence,
reconnect/creator-return timeout cancellation, explicit end confirmation and
cancellation, capture-stop arguments, duplicate callbacks, failure/retry, and
the actual offline/live room component's status transitions. These use mocked
providers/participants, not personal camera or microphone.

Real creator/viewer media delivery, device permission behavior and real phone
wallet acceptance still require an approved real-source session. This work
does not add recording/storage billing, terms, mainnet transactions, protocol
economics changes or new organizer messages.

## Replay phase — design recommendation, not implemented

Optional replays can improve return visits, but recording is a separate product
and operating commitment. Before enabling it, specify:

1. Explicit creator opt-in before each recording and an unmistakable recording
   indicator for everyone; no recording surprise.
2. Private processing, authenticated publish/delete controls, and moderation /
   copyright handling before exposing a video URL publicly.
3. Duration/storage/cost caps, a retention window and expiry/delete behavior.
   Begin with a small pilot, not unlimited free permanent video hosting.
4. Verified signed recording-completion callbacks and storage provenance. Only
   show Replay available when a real playable artifact is ready; distinguish
   Processing, Unavailable, Expired and Removed.
5. A session history sourced from signed provider events, idempotent persistence
   and retry/reconciliation. A token authorization is not a recorded broadcast.

Pump.fun's current [livestream policy](https://pump.fun/docs/livestream-moderation-policy)
says it may retain copies but does not promise to keep or provide them. That is
not evidence of a guaranteed user-facing replay product. LiveKit likewise
[documents](https://docs.livekit.io/intro/basics/connect/) temporary media-room
connections independently of HYPR's permanent token-address destination.
