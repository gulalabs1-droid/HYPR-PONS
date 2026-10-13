// Media sessions are temporary. The token-address community room is independent.
export type BroadcastExit = "host-ended" | "viewer-left" | "creator-offline" | "connection-lost";
export type BroadcastStatus = { configured: boolean; live: boolean; viewerCount?: number; hostConnected?: boolean; checkedAt?: string };
export type BroadcastPhase = "checking" | "unavailable" | "offline" | "preparing" | "live" | "paused" | "stopped" | "ended" | "connecting" | "reconnecting" | "creator-disconnected";

export const CREATOR_RETURN_GRACE_MS = 15_000;

export function publicBroadcastPhase(status: BroadcastStatus | null, unavailable: boolean, seenLive: boolean, exit: BroadcastExit | null): BroadcastPhase {
  if (unavailable) return "unavailable";
  if (!status) return "checking";
  if (!status.configured) return "unavailable";
  if (status.live) return "live";
  if (status.hostConnected) return seenLive ? "paused" : "preparing";
  if (exit === "host-ended") return "ended";
  // A disappearance proves loss of media, not that the creator deliberately ended it.
  if (seenLive || exit === "creator-offline") return "stopped";
  return "offline";
}

export function connectedBroadcastPhase({ connection, hostPresent, hasMedia, seenMedia }: {
  connection: "connected" | "reconnecting" | "connecting"; hostPresent: boolean; hasMedia: boolean; seenMedia: boolean;
}): BroadcastPhase {
  // Reconnection takes precedence over stale participant/track information.
  if (connection === "reconnecting") return "reconnecting";
  if (connection !== "connected") return "connecting";
  if (!hostPresent) return "creator-disconnected";
  if (hasMedia) return "live";
  return seenMedia ? "paused" : "preparing";
}

export function shouldReleaseViewer(role: "host" | "viewer", connection: "connected" | "reconnecting" | "connecting", hostPresent: boolean) {
  return role === "viewer" && connection === "connected" && !hostPresent;
}

export function broadcastCopy(phase: BroadcastPhase) {
  const copy: Record<BroadcastPhase, { title: string; detail: string; label: string }> = {
    checking: { title: "Checking the broadcast…", detail: "This community room stays open between broadcasts.", label: "CHECKING BROADCAST" },
    unavailable: { title: "Broadcast status unavailable", detail: "We cannot confirm the stream right now. Your community room is still here.", label: "STATUS UNAVAILABLE" },
    offline: { title: "Between broadcasts", detail: "The creator is offline. The room, saved chat and follows stay here—come back using this same link.", label: "ROOM OPEN · CREATOR OFFLINE" },
    preparing: { title: "Creator in the studio", detail: "No live audio or video is being published yet. Chat stays open.", label: "STUDIO READY · NOT LIVE" },
    live: { title: "The creator is live", detail: "Watch here without a wallet or token purchase. This is live-only, not a saved video.", label: "LIVE" },
    paused: { title: "Broadcast paused", detail: "The creator is connected, but their audio and video are off. Stay here; playback can resume when they publish again.", label: "PAUSED · ROOM OPEN" },
    stopped: { title: "Broadcast stopped. Room still open.", detail: "The creator went offline. Stay in chat; if they return, you can watch again here. No video replay was saved.", label: "BROADCAST STOPPED · ROOM OPEN" },
    ended: { title: "Your broadcast has ended", detail: "You stopped this media session. Your community room, saved messages, follows and token remain here.", label: "BROADCAST ENDED · ROOM OPEN" },
    connecting: { title: "Connecting to the broadcast…", detail: "You are joining the live player, not leaving the community room.", label: "CONNECTING" },
    reconnecting: { title: "Reconnecting your player…", detail: "Your connection was interrupted. We are trying to reconnect; this does not mean the creator ended the broadcast.", label: "RECONNECTING · ROOM OPEN" },
    "creator-disconnected": { title: "Creator disconnected", detail: "Waiting briefly in case they reconnect. If not, we will close only the live player and keep you in this room.", label: "CREATOR DISCONNECTED · ROOM OPEN" },
  };
  return copy[phase];
}

export function broadcastExitNotice(reason: BroadcastExit) {
  if (reason === "host-ended") return "Broadcast ended. Your camera, microphone and screen-sharing tracks are stopped. This room remains open.";
  if (reason === "creator-offline") return "The creator is offline. The live player has closed; saved chat, follows and the token remain available here.";
  if (reason === "connection-lost") return "Your broadcast connection was lost—not a confirmed end by the creator. This room remains open; try joining again when a live stream is available.";
  return "You left the live player, not the community room. You can keep chatting or join the broadcast again.";
}
