import { createHmac, hkdfSync, randomUUID, timingSafeEqual } from "node:crypto";

export const LIVE_HOST_COOKIE = "hypr-live-host";
export type HostCapability = { roomId: string; wallet: string; origin: string; controlId: string; expiresAt: number };
export function liveHostCookieName(roomId: string) { return `${LIVE_HOST_COOKIE}-${roomId.toLowerCase().slice(2)}`; }

function signingKey() {
  const secret = process.env.LIVEKIT_API_SECRET?.trim();
  if (!secret) throw new Error("Live host authorization is unavailable.");
  return Buffer.from(hkdfSync("sha256", secret, "HYPR live", "host capability v1", 32));
}

export function createHostCapability(roomId: string, wallet: string, origin: string): HostCapability {
  return { roomId: roomId.toLowerCase(), wallet: wallet.toLowerCase(), origin, controlId: randomUUID(), expiresAt: Date.now() + 12 * 60 * 60_000 };
}

export function encodeHostCapability(value: HostCapability) {
  const data = Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${data}.${createHmac("sha256", signingKey()).update(data).digest("base64url")}`;
}

export function decodeHostCapability(value: string | undefined, origin: string, now = Date.now()): HostCapability | null {
  if (!value || value.length > 2000) return null;
  try {
    const [data, mac, extra] = value.split(".");
    if (!data || !mac || extra) return null;
    const expected = createHmac("sha256", signingKey()).update(data).digest();
    const supplied = Buffer.from(mac, "base64url");
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null;
    const cap = JSON.parse(Buffer.from(data, "base64url").toString()) as HostCapability;
    if (cap.origin !== origin || !/^0x[0-9a-f]{40}$/.test(cap.roomId) || !/^0x[0-9a-f]{40}$/.test(cap.wallet) ||
      !/^[0-9a-f-]{36}$/.test(cap.controlId) || !Number.isSafeInteger(cap.expiresAt) || cap.expiresAt <= now) return null;
    return cap;
  } catch { return null; }
}
