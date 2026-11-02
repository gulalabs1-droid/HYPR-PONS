# Live guest operations

HYPR live guests are a small-pilot feature. A signed-in viewer requests a spot, and only the current room creator may approve it. A guest's camera and microphone remain off until the guest enables them. The creator can remove guests or end the broadcast; the normal interface supports up to four guests.

## Connect disconnect notifications

After the release containing `/api/live/webhook` has been deployed, open the HYPR project in LiveKit Cloud and choose **Settings → Webhooks → Create new webhook**. Use the public production origin followed by `/api/live/webhook`, and select the same signing API key configured as `LIVEKIT_API_KEY` in the HYPR deployment. Do not put the secret into the URL or a browser field. Use LiveKit's test-event action and confirm a successful delivery; a successful test event verifies the signature path, but does not replace a real host-and-guest disconnect test.

LiveKit sends room, participant and track event metadata to the HYPR endpoint, including public wallet-derived participant information. HYPR verifies the signature and only acts on a creator's departure; it does not save webhook payloads. The endpoint checks the current participant list before removing stale approvals, so a delayed event cannot remove a guest approved for a newer creator connection.

Webhooks can be delayed or lost. HYPR also stops guest devices in the browser when the creator disappears and reconciles stale guest permissions on subsequent live-status reads. Those are best-effort safeguards, not a guarantee of immediate revocation in every network failure. A production security review and a real-world disconnect test remain necessary before a broad public launch. The four-guest limit is enforced for normal creator actions; concurrent approval requests are not protected by a distributed lock.

## Test a release

1. In a real native HYPR room, have the creator start a broadcast using a consenting test account and device.
2. From a second signed-in account, request a stage spot. Verify that the guest's devices remain off until the creator approves and the guest chooses to share.
3. Use a third viewer to confirm both participants are visible and audible. Verify that the creator can remove the guest and that the guest can leave the stage while continuing to watch.
4. Repeat with the creator ending the show, then with the creator unexpectedly closing the browser. Confirm the guest stops sharing and is no longer publish-enabled.
5. Repeat on desktop and mobile. Built-in replays and clips use the creator's tracks, not a composed guest-stage recording; recordings can still pick up sound played through the creator's microphone.
