export const REACTIONS = ["🔥", "❤️", "😂", "👏", "🚀"] as const;
export const LIVE_SIGNAL_TOPIC = "hypr";
export const LIVE_SIGNAL_SEND_EVENT = "hypr-live-signal-send";
export const LIVE_CHAT_PING_EVENT = "hypr-live-chat-ping";

export type LiveSignal = { type: "react"; reaction: number } | { type: "chat" };

export function encodeLiveSignal(signal: LiveSignal) {
  return new TextEncoder().encode(JSON.stringify(signal.type === "react" ? { t: "r", r: signal.reaction } : { t: "c" }));
}

// Any viewer can publish data, so every packet is untrusted input.
export function decodeLiveSignal(payload: Uint8Array): LiveSignal | null {
  if (payload.byteLength > 64) return null;
  try {
    const value = JSON.parse(new TextDecoder().decode(payload)) as { t?: unknown; r?: unknown };
    if (value.t === "c") return { type: "chat" };
    if (value.t === "r" && Number.isInteger(value.r) && (value.r as number) >= 0 && (value.r as number) < REACTIONS.length) return { type: "react", reaction: value.r as number };
  } catch { /* malformed packet */ }
  return null;
}

export function sendLiveSignal(roomId: string, signal: LiveSignal) {
  window.dispatchEvent(new CustomEvent(LIVE_SIGNAL_SEND_EVENT, { detail: { roomId: roomId.toLowerCase(), signal } }));
}

export class SenderThrottle {
  private hits = new Map<string, number[]>();
  constructor(private limit: number, private windowMs: number) {}
  allow(sender: string, now = Date.now()) {
    const recent = (this.hits.get(sender) || []).filter(time => now - time < this.windowMs);
    if (recent.length >= this.limit) { this.hits.set(sender, recent); return false; }
    recent.push(now); this.hits.set(sender, recent);
    if (this.hits.size > 500) this.hits.delete(this.hits.keys().next().value as string);
    return true;
  }
}
